import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as http from 'http';
import * as https from 'https';
import { CloudDrawing, SyncStatus, SyncTask, DrawingFile, IpcResponse } from '@shared/types';
import {
  CLOUD_API_BASE,
  CLOUD_REQUEST_TIMEOUT,
  CLOUD_SYNC_INTERVAL,
} from '@shared/constants';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ResumeState {
  taskId: string;
  fileHash: string;
  uploadedBytes: number;
  totalBytes: number;
  uploadId?: string;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

interface ConnectionPoolConfig {
  maxSockets: number;
  maxFreeSockets: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  timeout: number;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

interface BatchQueueItem {
  id: string;
  data: any;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 15000,
};

const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxSockets: 10,
  maxFreeSockets: 5,
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 60000,
};

class CloudSyncService {
  private client: AxiosInstance;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;
  private tokens: AuthTokens | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private tasks: Map<string, SyncTask> = new Map();
  private resumeStates: Map<string, ResumeState> = new Map();
  private status: SyncStatus = {
    lastSyncTime: null,
    isSyncing: false,
    pendingUploads: 0,
    pendingDownloads: 0,
    totalCloudFiles: 0,
    totalLocalFiles: 0,
  };
  private onProgress: ((task: SyncTask) => void) | null = null;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;

  private requestDedupeMap: Map<string, PendingRequest> = new Map();
  private batchQueue: Map<string, BatchQueueItem[]> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private activeUploads: number = 0;
  private activeDownloads: number = 0;
  private maxConcurrentUploads: number = 3;
  private maxConcurrentDownloads: number = 3;
  private pendingUploadQueue: Array<{ task: SyncTask; localPath: string }> = [];
  private pendingDownloadQueue: Array<{ task: SyncTask; savePath: string }> = [];

  constructor(poolConfig: Partial<ConnectionPoolConfig> = {}) {
    const config = { ...DEFAULT_POOL_CONFIG, ...poolConfig };

    this.httpAgent = new http.Agent({
      keepAlive: config.keepAlive,
      keepAliveMsecs: config.keepAliveMsecs,
      maxSockets: config.maxSockets,
      maxFreeSockets: config.maxFreeSockets,
      timeout: config.timeout,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: config.keepAlive,
      keepAliveMsecs: config.keepAliveMsecs,
      maxSockets: config.maxSockets,
      maxFreeSockets: config.maxFreeSockets,
      timeout: config.timeout,
    });

    this.client = axios.create({
      baseURL: CLOUD_API_BASE,
      timeout: CLOUD_REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    });

    this.client.interceptors.request.use((config) => {
      if (this.tokens?.accessToken) {
        config.headers.Authorization = `Bearer ${this.tokens.accessToken}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };
        if (error.response?.status === 401 && !originalRequest._retry && this.tokens?.refreshToken) {
          originalRequest._retry = true;
          try {
            await this.refreshAccessToken();
            originalRequest.headers = originalRequest.headers ?? {};
            originalRequest.headers.Authorization = `Bearer ${this.tokens.accessToken}`;
            return this.client(originalRequest);
          } catch {
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    onProgress?: (retryCount: number) => void,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay } = { ...this.retryConfig, ...config };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        lastError = err;
        if (attempt === maxRetries) break;
        if (!this.isRetryableError(err)) break;

        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * 0.1 * (Math.random() - 0.5);

        if (onProgress) onProgress(attempt + 1);
        await this.sleep(delay + jitter);
      }
    }

    throw lastError!;
  }

  private isRetryableError(err: any): boolean {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const code = (err as AxiosError).code;

      if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        return true;
      }

      if (!status) return true;
      if (status >= 500) return true;
      if (status === 429) return true;
      return false;
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  setConcurrencyLimits(maxUploads: number, maxDownloads: number): void {
    this.maxConcurrentUploads = maxUploads;
    this.maxConcurrentDownloads = maxDownloads;
  }

  private async dedupeRequest<T>(key: string, operation: () => Promise<T>, ttlMs = 1000): Promise<T> {
    const existing = this.requestDedupeMap.get(key);
    if (existing && Date.now() - existing.timestamp < ttlMs) {
      return new Promise<T>((resolve, reject) => {
        const origResolve = existing.resolve;
        const origReject = existing.reject;
        existing.resolve = (value) => {
          origResolve(value);
          resolve(value as T);
        };
        existing.reject = (reason) => {
          origReject(reason);
          reject(reason);
        };
      });
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.requestDedupeMap.set(key, {
        resolve: resolve as any,
        reject: reject as any,
        timestamp: Date.now(),
      });
    });

    try {
      const result = await operation();
      const pending = this.requestDedupeMap.get(key);
      if (pending) {
        pending.resolve(result);
      }
      setTimeout(() => this.requestDedupeMap.delete(key), ttlMs);
      return result;
    } catch (error) {
      const pending = this.requestDedupeMap.get(key);
      if (pending) {
        pending.reject(error);
      }
      this.requestDedupeMap.delete(key);
      throw error;
    }
  }

  private async batchRequest<T>(
    batchKey: string,
    itemId: string,
    itemData: any,
    batchExecutor: (items: BatchQueueItem[]) => Promise<void>,
    maxBatchSize = 50,
    maxWaitMs = 100
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.batchQueue.has(batchKey)) {
        this.batchQueue.set(batchKey, []);
      }

      const queue = this.batchQueue.get(batchKey)!;
      queue.push({ id: itemId, data: itemData, resolve: resolve as any, reject: reject as any });

      if (queue.length >= maxBatchSize) {
        this.processBatch(batchKey, batchExecutor);
      } else if (!this.batchTimers.has(batchKey)) {
        this.batchTimers.set(
          batchKey,
          setTimeout(() => this.processBatch(batchKey, batchExecutor), maxWaitMs)
        );
      }
    });
  }

  private async processBatch(
    batchKey: string,
    batchExecutor: (items: BatchQueueItem[]) => Promise<void>
  ): Promise<void> {
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    const items = this.batchQueue.get(batchKey) || [];
    this.batchQueue.delete(batchKey);

    if (items.length === 0) return;

    try {
      await batchExecutor(items);
    } catch (error: any) {
      for (const item of items) {
        item.reject(error);
      }
    }
  }

  async getDrawingBatch(drawingIds: string[]): Promise<Map<string, CloudDrawing>> {
    this.ensureAuthenticated();

    const results = new Map<string, CloudDrawing>();

    const batchSize = 50;
    for (let i = 0; i < drawingIds.length; i += batchSize) {
      const batch = drawingIds.slice(i, i + batchSize);
      const response = await this.withRetry(() =>
        this.client.post('/drawings/batch-get', { ids: batch })
      );
      for (const drawing of response.data.items || []) {
        results.set(drawing.id, drawing);
      }
    }

    return results;
  }

  async batchUpload(
    drawings: Array<{ drawing: DrawingFile; localPath: string }>
  ): Promise<SyncTask[]> {
    const tasks: SyncTask[] = [];
    for (const { drawing, localPath } of drawings) {
      const task = await this.upload(drawing, localPath);
      tasks.push(task);
    }
    return tasks;
  }

  getConnectionStats(): {
    activeSockets: number;
    freeSockets: number;
    pendingRequests: number;
    activeUploads: number;
    activeDownloads: number;
    pendingUploadQueue: number;
    pendingDownloadQueue: number;
  } {
    return {
      activeSockets: Object.keys(this.httpsAgent.sockets).length + Object.keys(this.httpAgent.sockets).length,
      freeSockets: Object.keys(this.httpsAgent.freeSockets).length + Object.keys(this.httpAgent.freeSockets).length,
      pendingRequests: this.requestDedupeMap.size,
      activeUploads: this.activeUploads,
      activeDownloads: this.activeDownloads,
      pendingUploadQueue: this.pendingUploadQueue.length,
      pendingDownloadQueue: this.pendingDownloadQueue.length,
    };
  }

  destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    this.stopAutoSync();
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }
    this.batchTimers.clear();
    this.batchQueue.clear();
    this.requestDedupeMap.clear();
  }

  async authenticate(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const response = await this.client.post('/auth/token', { apiKey, apiSecret });
      const { access_token, refresh_token, expires_in } = response.data;
      this.tokens = {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + expires_in * 1000,
      };
      return true;
    } catch {
      return false;
    }
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens?.refreshToken) throw new Error('未登录');
    const response = await this.client.post('/auth/refresh', {
      refreshToken: this.tokens.refreshToken,
    });
    const { access_token, refresh_token, expires_in } = response.data;
    this.tokens = {
      accessToken: access_token,
      refreshToken: refresh_token ?? this.tokens.refreshToken,
      expiresAt: Date.now() + expires_in * 1000,
    };
  }

  isAuthenticated(): boolean {
    return !!this.tokens && this.tokens.expiresAt > Date.now();
  }

  setProgressHandler(handler: (task: SyncTask) => void): void {
    this.onProgress = handler;
  }

  async getStatus(): Promise<SyncStatus> {
    if (this.isAuthenticated()) {
      try {
        const response = await this.client.get('/drawings/stats');
        this.status.totalCloudFiles = response.data.totalFiles ?? 0;
      } catch {
        // ignore
      }
    }
    return { ...this.status };
  }

  async listCloudDrawings(page = 1, pageSize = 50): Promise<CloudDrawing[]> {
    this.ensureAuthenticated();
    const response = await this.client.get('/drawings', {
      params: { page, pageSize },
    });
    return response.data.items ?? [];
  }

  async upload(drawing: DrawingFile, localPath: string): Promise<SyncTask> {
    this.ensureAuthenticated();

    const task: SyncTask = {
      id: uuidv4(),
      type: 'upload',
      drawing: {
        id: drawing.id,
        name: drawing.name,
        format: drawing.format,
        size: drawing.size,
        version: 1,
        cloudUrl: '',
        uploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    this.status.pendingUploads = this.pendingUploadQueue.length + 1;

    if (this.activeUploads < this.maxConcurrentUploads) {
      this.activeUploads++;
      this.executeUpload(task, localPath).catch((err) => {
        task.status = 'failed';
        task.error = err.message;
        this.notifyProgress(task);
      });
    } else {
      this.pendingUploadQueue.push({ task, localPath });
    }

    return task;
  }

  private async executeUpload(task: SyncTask, localPath: string): Promise<void> {
    task.status = 'processing';
    task.progress = 10;
    this.notifyProgress(task);

    const fileBuffer = await this.withRetry(
      async () => {
        if (!(await fs.pathExists(localPath))) {
          throw new Error('本地文件不存在');
        }
        return await fs.readFile(localPath);
      },
      undefined,
      { maxRetries: 2 }
    );
    task.progress = 20;
    this.notifyProgress(task);

    const fileHash = this.computeHash(fileBuffer);
    const resumeState = this.resumeStates.get(task.id) || {
      taskId: task.id,
      fileHash,
      uploadedBytes: 0,
      totalBytes: fileBuffer.length,
    };

    if (resumeState.fileHash !== fileHash) {
      resumeState.uploadedBytes = 0;
      resumeState.uploadId = undefined;
    }
    resumeState.fileHash = fileHash;
    resumeState.totalBytes = fileBuffer.length;
    this.resumeStates.set(task.id, resumeState);

    task.progress = 30;
    this.notifyProgress(task);

    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunks = Math.ceil(fileBuffer.length / CHUNK_SIZE);
    const startChunk = Math.floor(resumeState.uploadedBytes / CHUNK_SIZE);

    for (let i = startChunk; i < totalChunks; i++) {
      const chunkStart = i * CHUNK_SIZE;
      const chunkEnd = Math.min((i + 1) * CHUNK_SIZE, fileBuffer.length);
      const chunk = fileBuffer.slice(chunkStart, chunkEnd);
      const chunkHash = this.computeHash(chunk);

      await this.withRetry(
        async () => {
          const formData = new FormData();
          formData.append('chunk', new Blob([chunk]), `chunk_${i}`);
          formData.append('chunkIndex', String(i));
          formData.append('totalChunks', String(totalChunks));
          formData.append('chunkHash', chunkHash);
          formData.append('fileHash', fileHash);
          formData.append('fileName', task.drawing.name);
          formData.append('metadata', JSON.stringify({
            format: task.drawing.format,
            size: task.drawing.size,
          }));
          if (resumeState.uploadId) {
            formData.append('uploadId', resumeState.uploadId);
          }

          const response = await this.client.post('/drawings/upload-chunk', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: Math.max(CLOUD_REQUEST_TIMEOUT, 60000),
          });

          if (!resumeState.uploadId && response.data.uploadId) {
            resumeState.uploadId = response.data.uploadId;
          }

          resumeState.uploadedBytes = chunkEnd;
          task.progress = 30 + Math.round(((i + 1) / totalChunks) * 65);
          this.notifyProgress(task);
        },
        (retry) => {
          task.error = `分片 ${i + 1}/${totalChunks} 重试中 (${retry})`;
          this.notifyProgress(task);
        }
      );
    }

    const finalizeResponse = await this.withRetry(async () => {
      return await this.client.post('/drawings/complete-upload', {
        uploadId: resumeState.uploadId,
        fileHash,
        totalSize: fileBuffer.length,
      });
    });

    task.drawing.cloudUrl = finalizeResponse.data.url ?? '';
    task.drawing.id = finalizeResponse.data.id ?? task.drawing.id;
    task.drawing.version = finalizeResponse.data.version ?? task.drawing.version;
    task.progress = 100;
    task.status = 'completed';
    task.error = undefined;
    this.status.lastSyncTime = new Date().toISOString();
    this.notifyProgress(task);

    this.resumeStates.delete(task.id);
    this.processNextUpload();
  }

  private processNextUpload(): void {
    this.activeUploads--;
    this.status.pendingUploads = this.pendingUploadQueue.length;

    if (this.pendingUploadQueue.length > 0 && this.activeUploads < this.maxConcurrentUploads) {
      const next = this.pendingUploadQueue.shift();
      if (next) {
        this.activeUploads++;
        this.executeUpload(next.task, next.localPath).catch((err) => {
          next.task.status = 'failed';
          next.task.error = err.message;
          this.notifyProgress(next.task);
        });
      }
    }
  }

  async download(cloudDrawing: CloudDrawing, savePath: string): Promise<SyncTask> {
    this.ensureAuthenticated();

    const task: SyncTask = {
      id: uuidv4(),
      type: 'download',
      drawing: cloudDrawing,
      status: 'pending',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    this.tasks.set(task.id, task);
    this.status.pendingDownloads = this.pendingDownloadQueue.length + 1;

    if (this.activeDownloads < this.maxConcurrentDownloads) {
      this.activeDownloads++;
      this.executeDownload(task, savePath).catch((err) => {
        task.status = 'failed';
        task.error = err.message;
        this.notifyProgress(task);
      });
    } else {
      this.pendingDownloadQueue.push({ task, savePath });
    }

    return task;
  }

  private async executeDownload(task: SyncTask, savePath: string): Promise<void> {
    task.status = 'processing';
    task.progress = 10;
    this.notifyProgress(task);

    await fs.ensureDir(path.dirname(savePath));

    const tempPath = `${savePath}.part`;
    let downloadedBytes = 0;
    let totalBytes = 0;

    try {
      if (await fs.pathExists(tempPath)) {
        const stat = await fs.stat(tempPath);
        downloadedBytes = stat.size;
      }
    } catch {
      downloadedBytes = 0;
    }

    const downloadUrl = task.drawing.cloudUrl || `/drawings/${task.drawing.id}/download`;

    await this.withRetry(async () => {
      const headers: Record<string, string> = {};
      if (downloadedBytes > 0) {
        headers['Range'] = `bytes=${downloadedBytes}-`;
      }

      const response = await this.client.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers,
        timeout: Math.max(CLOUD_REQUEST_TIMEOUT, 120000),
        onDownloadProgress: (progressEvent) => {
          const loaded = downloadedBytes + (progressEvent.loaded || 0);
          const total = totalBytes || downloadedBytes + (progressEvent.total || 0);
          if (progressEvent.total) totalBytes = downloadedBytes + progressEvent.total;
          if (total > 0) {
            task.progress = 10 + Math.round((loaded / total) * 80);
            this.notifyProgress(task);
          }
        },
      });

      const buffer = Buffer.from(response.data);

      if (downloadedBytes === 0) {
        await fs.writeFile(tempPath, buffer);
      } else {
        await fs.appendFile(tempPath, buffer);
      }

      const finalSize = downloadedBytes + buffer.length;
      task.progress = 90;
      this.notifyProgress(task);

      const finalBuffer = await fs.readFile(tempPath);
      if (task.drawing.size && finalBuffer.length !== task.drawing.size) {
        throw new Error('文件大小校验失败');
      }

      await fs.rename(tempPath, savePath);
    }, (retry) => {
      task.error = `下载重试中 (${retry})`;
      this.notifyProgress(task);
    });

    task.progress = 100;
    task.status = 'completed';
    task.error = undefined;
    this.status.lastSyncTime = new Date().toISOString();
    this.notifyProgress(task);

    this.processNextDownload();
  }

  private processNextDownload(): void {
    this.activeDownloads--;
    this.status.pendingDownloads = this.pendingDownloadQueue.length;

    if (this.pendingDownloadQueue.length > 0 && this.activeDownloads < this.maxConcurrentDownloads) {
      const next = this.pendingDownloadQueue.shift();
      if (next) {
        this.activeDownloads++;
        this.executeDownload(next.task, next.savePath).catch((err) => {
          next.task.status = 'failed';
          next.task.error = err.message;
          this.notifyProgress(next.task);
        });
      }
    }
  }

  private computeHash(buffer: Buffer): string {
    return require('crypto').createHash('sha256').update(buffer).digest('hex');
  }

  async deleteCloudDrawing(drawingId: string): Promise<boolean> {
    this.ensureAuthenticated();
    try {
      await this.client.delete(`/drawings/${drawingId}`);
      return true;
    } catch {
      return false;
    }
  }

  startAutoSync(intervalMs: number = CLOUD_SYNC_INTERVAL): void {
    this.stopAutoSync();
    this.syncInterval = setInterval(() => this.sync(), intervalMs);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async sync(): Promise<SyncStatus> {
    if (this.status.isSyncing) return this.getStatus();
    this.status.isSyncing = true;

    try {
      const cloudDrawings = await this.listCloudDrawings();
      this.status.totalCloudFiles = cloudDrawings.length;
      this.status.pendingDownloads = 0;
      this.status.pendingUploads = 0;
      this.status.lastSyncTime = new Date().toISOString();
    } catch (error) {
      console.error('同步失败:', error);
    } finally {
      this.status.isSyncing = false;
    }

    return this.getStatus();
  }

  getTask(taskId: string): SyncTask | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): SyncTask[] {
    return Array.from(this.tasks.values());
  }

  private ensureAuthenticated(): void {
    if (!this.isAuthenticated()) {
      throw new Error('未认证，请先登录云端账号');
    }
  }

  private notifyProgress(task: SyncTask): void {
    if (this.onProgress) {
      this.onProgress(task);
    }
  }

  logout(): void {
    this.tokens = null;
    this.stopAutoSync();
  }
}

export const cloudSyncService = new CloudSyncService();
export { CloudSyncService };
