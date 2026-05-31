import axios, { AxiosInstance, AxiosError } from 'axios';
import { Project, CloudProject, SyncStatus, ProjectFile, VersionInfo, AppConfig } from '../../shared/types';
import { DatabaseManager } from '../database/DatabaseManager';
import { generateId, calculateFileHash } from '../../shared/utils';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
};

function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = Math.min(config.baseDelay * Math.pow(2, attempt), config.maxDelay);
  return delay;
}

function isRetryableError(error: AxiosError): boolean {
  if (error.response) {
    const status = error.response.status;
    return status >= 500 || status === 408 || status === 429;
  }
  if (error.code === 'ECONNABORTED' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNRESET') {
    return true;
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>, 
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;
      if (!isRetryableError(axiosError)) {
        throw error;
      }
      if (attempt < config.maxRetries - 1) {
        const delay = calculateRetryDelay(attempt, config);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError!;
}

export class CloudSyncService {
  private apiClient: AxiosInstance;
  private db: DatabaseManager;
  private syncStatus: Map<string, SyncStatus> = new Map();
  private static instance: CloudSyncService;
  private config: AppConfig;
  private autoSyncTimer: NodeJS.Timeout | null = null;
  private syncingProjects: Set<string> = new Set();
  private uploadQueue: Map<string, string[]> = new Map();

  public static getInstance(db?: DatabaseManager, config?: AppConfig): CloudSyncService {
    if (!CloudSyncService.instance) {
      if (!db || !config) {
        throw new Error('DatabaseManager and config must be provided for first initialization');
      }
      CloudSyncService.instance = new CloudSyncService(db, config);
    }
    return CloudSyncService.instance;
  }

  private constructor(db: DatabaseManager, config: AppConfig) {
    this.config = config;
    this.db = db;
    this.apiClient = axios.create({
      baseURL: config.apiBaseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Project-Studio/1.0',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.request.use(
      (config) => {
        const cacheEntry = this.db.getCache<string>('auth_token');
        if (cacheEntry) {
          config.headers.Authorization = `Bearer ${cacheEntry.data}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.apiClient.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          this.db.clearCache('auth_token');
        }
        return Promise.reject(error);
      }
    );
  }

  public updateConfig(config: AppConfig): void {
    this.config = config;
    this.apiClient.defaults.baseURL = config.apiBaseUrl;
    this.restartAutoSync();
  }

  public setAuthToken(token: string, expiresIn?: number): void {
    this.db.setCache('auth_token', token, expiresIn);
  }

  public clearAuthToken(): void {
    this.db.clearCache('auth_token');
  }

  public async listCloudProjects(): Promise<CloudProject[]> {
    return withRetry(async () => {
      const cacheKey = 'cloud_projects_list';
      const cacheEntry = this.db.getCache<CloudProject[]>(cacheKey);
      if (cacheEntry) {
        return cacheEntry.data;
      }

      const response = await this.apiClient.get<CloudProject[]>('/projects');
      this.db.setCache(cacheKey, response.data, 60000);
      return response.data;
    });
  }

  public async getCloudProject(cloudId: string): Promise<CloudProject> {
    return withRetry(async () => {
      const cacheKey = `cloud_project_${cloudId}`;
      const cacheEntry = this.db.getCache<CloudProject>(cacheKey);
      if (cacheEntry) {
        return cacheEntry.data;
      }

      const response = await this.apiClient.get<CloudProject>(`/projects/${cloudId}`);
      this.db.setCache(cacheKey, response.data, 30000);
      return response.data;
    });
  }

  public async createCloudProject(project: Project): Promise<CloudProject> {
    return withRetry(async () => {
      const cloudProject: Omit<CloudProject, 'id' | 'createdAt' | 'updatedAt' | 'versions'> = {
        name: project.name,
        description: project.description || '',
        owner: 'local-user',
        version: project.version,
        isPublic: false,
      };

      const response = await this.apiClient.post<CloudProject>('/projects', cloudProject);
      const cloudProjectData = response.data;

      this.db.updateProject(project.id, {
        cloudId: cloudProjectData.id,
        isSynced: true,
        lastSyncedAt: Date.now(),
      });

      this.db.clearCache('cloud_projects_list');
      return cloudProjectData;
    });
  }

  public async deleteCloudProject(cloudId: string): Promise<void> {
    return withRetry(async () => {
      await this.apiClient.delete(`/projects/${cloudId}`);
      this.db.clearCache('cloud_projects_list');
      this.db.clearCache(`cloud_project_${cloudId}`);
    });
  }

  public async uploadProject(project: Project): Promise<void> {
    if (!project.cloudId) {
      throw new Error('项目未关联云端ID');
    }

    if (this.syncingProjects.has(project.id)) {
      throw new Error('项目正在同步中，请稍后再试');
    }

    this.syncingProjects.add(project.id);
    const status = this.getSyncStatus(project.id);
    this.updateSyncStatus(project.id, {
      ...status,
      status: 'syncing',
      progress: 0,
      message: '开始上传项目...',
    });

    try {
      const totalFiles = project.files.length;
      if (totalFiles === 0) {
        this.updateSyncStatus(project.id, {
          status: 'success',
          progress: 100,
          message: '项目无文件需要上传',
          lastSyncTime: Date.now(),
        });
        this.syncingProjects.delete(project.id);
        return;
      }

      for (let i = 0; i < totalFiles; i++) {
        const file = project.files[i];
        this.updateSyncStatus(project.id, {
          status: 'syncing',
          progress: Math.round((i / totalFiles) * 100),
          message: `上传文件: ${file.path}`,
        });

        await this.uploadFileWithRetry(project.cloudId, file);
      }

      await this.apiClient.put(`/projects/${project.cloudId}`, {
        name: project.name,
        description: project.description,
        updatedAt: Date.now(),
      });

      this.db.updateProject(project.id, {
        isSynced: true,
        lastSyncedAt: Date.now(),
      });

      this.updateSyncStatus(project.id, {
        status: 'success',
        progress: 100,
        message: '项目上传成功',
        lastSyncTime: Date.now(),
      });

      this.db.clearCache(`cloud_project_${project.cloudId}`);
      this.db.clearCache('cloud_projects_list');
    } catch (error) {
      this.updateSyncStatus(project.id, {
        status: 'error',
        progress: 0,
        message: `上传失败: ${(error as Error).message}`,
      });
      throw error;
    } finally {
      this.syncingProjects.delete(project.id);
    }
  }

  private async uploadFileWithRetry(cloudId: string, file: ProjectFile): Promise<void> {
    return withRetry(async () => {
      const fileHash = calculateFileHash(file.content);
      
      try {
        await this.apiClient.post(`/projects/${cloudId}/files`, {
          path: file.path,
          name: file.name,
          content: file.content,
          language: file.language,
          size: file.size,
          hash: fileHash,
          lastModified: file.lastModified,
        });

        const cacheKey = `file_hash_${file.id}`;
        this.db.setCache(cacheKey, fileHash, 3600000);
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 409) {
          const cacheKey = `file_hash_${file.id}`;
          this.db.setCache(cacheKey, fileHash, 3600000);
          return;
        }
        throw error;
      }
    });
  }

  public async downloadProject(cloudId: string): Promise<Project> {
    return withRetry(async () => {
      const response = await this.apiClient.get(`/projects/${cloudId}/files`);
      const cloudFiles = response.data as ProjectFile[];

      const cloudProject = await this.getCloudProject(cloudId);
      const localProject = this.db.createProject(cloudProject.name, cloudProject.description);

      cloudFiles.forEach(file => {
        const newFile: ProjectFile = {
          ...file,
          id: generateId(),
          isDirty: false,
        };
        this.db.addFile(localProject.id, newFile);
        const cacheKey = `file_hash_${newFile.id}`;
        this.db.setCache(cacheKey, calculateFileHash(newFile.content), 3600000);
      });

      this.db.updateProject(localProject.id, {
        cloudId,
        isSynced: true,
        lastSyncedAt: Date.now(),
      });

      return this.db.getProject(localProject.id)!;
    });
  }

  public async syncProject(projectId: string): Promise<void> {
    const project = this.db.getProject(projectId);
    if (!project) {
      throw new Error('项目不存在');
    }

    if (!project.cloudId) {
      throw new Error('项目未关联云端ID，无法同步');
    }

    if (this.syncingProjects.has(projectId)) {
      throw new Error('项目正在同步中，请稍后再试');
    }

    this.syncingProjects.add(projectId);
    const status = this.getSyncStatus(projectId);
    this.updateSyncStatus(projectId, {
      ...status,
      status: 'syncing',
      progress: 0,
      message: '正在检查变更...',
    });

    try {
      let cloudProject: CloudProject;
      let cloudHashes: Record<string, string>;

      try {
        cloudProject = await this.getCloudProject(project.cloudId);
        const response = await this.apiClient.get(`/projects/${project.cloudId}/file-hashes`);
        cloudHashes = response.data as Record<string, string>;
      } catch (error) {
        this.updateSyncStatus(projectId, {
          status: 'error',
          progress: 0,
          message: `连接云端失败: ${(error as Error).message}`,
        });
        throw error;
      }

      const filesToPush: ProjectFile[] = [];
      const filesToPull: string[] = [];

      project.files.forEach(file => {
        const localHash = calculateFileHash(file.content);
        const cacheKey = `file_hash_${file.id}`;
        const cacheEntry = this.db.getCache<string>(cacheKey);
        const lastSyncedHash = cacheEntry?.data || '';

        if (localHash !== lastSyncedHash) {
          filesToPush.push(file);
        }
      });

      Object.entries(cloudHashes || {}).forEach(([filePath, hash]) => {
        const localFile = project.files.find(f => f.path === filePath);
        if (!localFile) {
          filesToPull.push(filePath);
        } else {
          const localHash = calculateFileHash(localFile.content);
          if (hash !== localHash && !filesToPush.find(f => f.path === filePath)) {
            filesToPull.push(filePath);
          }
        }
      });

      const totalOperations = filesToPush.length + filesToPull.length;

      if (totalOperations === 0) {
        this.db.updateProject(projectId, {
          isSynced: true,
          lastSyncedAt: Date.now(),
        });
        this.updateSyncStatus(projectId, {
          status: 'success',
          progress: 100,
          message: '已是最新，无需同步',
          lastSyncTime: Date.now(),
        });
        this.syncingProjects.delete(projectId);
        return;
      }

      let completed = 0;

      for (const file of filesToPush) {
        this.updateSyncStatus(projectId, {
          status: 'syncing',
          progress: Math.round((completed / totalOperations) * 100),
          message: `上传: ${file.path}`,
        });

        try {
          await this.uploadFileWithRetry(project.cloudId!, file);
        } catch (error) {
          console.error(`上传文件失败 ${file.path}:`, error);
        }
        completed++;
      }

      for (const pullPath of filesToPull) {
        this.updateSyncStatus(projectId, {
          status: 'syncing',
          progress: Math.round((completed / totalOperations) * 100),
          message: `下载: ${pullPath}`,
        });

        try {
          const fileResponse = await this.apiClient.get(`/projects/${project.cloudId}/files`, {
            params: { path: pullPath },
          });

          const cloudFile = fileResponse.data as ProjectFile;
          const existingFile = project.files.find(f => f.path === pullPath);

          if (existingFile) {
            this.db.updateFile(projectId, existingFile.id, {
              content: cloudFile.content,
              size: cloudFile.size,
              lastModified: Date.now(),
            });
            const cacheKey = `file_hash_${existingFile.id}`;
            this.db.setCache(cacheKey, calculateFileHash(cloudFile.content), 3600000);
          } else {
            const newFile: ProjectFile = {
              ...cloudFile,
              id: generateId(),
              isDirty: false,
            };
            this.db.addFile(projectId, newFile);
            const cacheKey = `file_hash_${newFile.id}`;
            this.db.setCache(cacheKey, calculateFileHash(cloudFile.content), 3600000);
          }
        } catch (error) {
          console.error(`下载文件失败 ${pullPath}:`, error);
        }
        completed++;
      }

      this.db.updateProject(projectId, {
        isSynced: true,
        lastSyncedAt: Date.now(),
      });

      this.updateSyncStatus(projectId, {
        status: 'success',
        progress: 100,
        message: '同步完成',
        lastSyncTime: Date.now(),
      });

      this.db.clearCache(`cloud_project_${project.cloudId}`);
      this.db.clearCache('cloud_projects_list');
    } catch (error) {
      this.updateSyncStatus(projectId, {
        status: 'error',
        progress: 0,
        message: `同步失败: ${(error as Error).message}`,
      });
      throw error;
    } finally {
      this.syncingProjects.delete(projectId);
    }
  }

  public async listVersions(cloudId: string): Promise<VersionInfo[]> {
    return withRetry(async () => {
      const response = await this.apiClient.get<VersionInfo[]>(`/projects/${cloudId}/versions`);
      return response.data;
    });
  }

  public async createVersion(cloudId: string, description: string, author: string): Promise<VersionInfo> {
    return withRetry(async () => {
      const response = await this.apiClient.post<VersionInfo>(`/projects/${cloudId}/versions`, {
        description,
        author,
      });
      return response.data;
    });
  }

  public async rollbackToVersion(cloudId: string, version: string): Promise<void> {
    return withRetry(async () => {
      await this.apiClient.post(`/projects/${cloudId}/versions/${version}/rollback`);
      this.db.clearCache(`cloud_project_${cloudId}`);
    });
  }

  public getSyncStatus(projectId: string): SyncStatus {
    return this.syncStatus.get(projectId) || {
      status: 'idle',
      progress: 0,
    };
  }

  private updateSyncStatus(projectId: string, status: SyncStatus): void {
    this.syncStatus.set(projectId, status);
  }

  public startAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
    }

    if (this.config.autoSync) {
      this.autoSyncTimer = setInterval(async () => {
        const projects = this.db.listProjects();
        for (const project of projects) {
          if (project.cloudId && !project.isSynced && !this.syncingProjects.has(project.id)) {
            try {
              await this.syncProject(project.id);
            } catch (error) {
              console.error(`自动同步失败 ${project.id}:`, error);
            }
          }
        }
      }, this.config.syncInterval);
    }
  }

  public stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  private restartAutoSync(): void {
    this.stopAutoSync();
    this.startAutoSync();
  }

  public async testConnection(): Promise<boolean> {
    try {
      await withRetry(() => this.apiClient.get('/health'));
      return true;
    } catch {
      return false;
    }
  }

  public queueFileUpload(projectId: string, filePath: string): void {
    if (!this.uploadQueue.has(projectId)) {
      this.uploadQueue.set(projectId, []);
    }
    const queue = this.uploadQueue.get(projectId)!;
    if (!queue.includes(filePath)) {
      queue.push(filePath);
    }
  }

  public getUploadQueue(projectId: string): string[] {
    return this.uploadQueue.get(projectId) || [];
  }

  public clearUploadQueue(projectId: string): void {
    this.uploadQueue.delete(projectId);
  }
}
