import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  SyncConfig,
  RemoteFileInfo,
  FileUploadRequest,
  FileUploadResponse,
  FileDownloadResponse,
  VersionListResponse,
  DeltaResponse,
  VersionRecord,
} from './types';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;
const CHUNK_SIZE = 512 * 1024;

export class SyncApiClient {
  private client: AxiosInstance;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.serverUrl}/api/v1`,
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'X-Device-Id': config.deviceId,
        'Content-Type': 'application/json',
      },
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength: 100 * 1024 * 1024,
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          const err = new Error('认证失败：API Key 无效或已过期');
          (err as any).retryable = false;
          throw err;
        }
        if (error.response?.status === 409) {
          const err = new Error('版本冲突：文件已被其他设备修改');
          (err as any).retryable = false;
          throw err;
        }
        const err = new Error(
          error.code === 'ECONNREFUSED'
            ? '无法连接到同步服务器'
            : error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED'
              ? '请求超时，请检查网络连接'
              : `同步请求失败: ${error.message}`
        );
        (err as any).retryable = !error.response || error.response.status >= 500;
        throw err;
      }
    );
  }

  private async withRetry<T>(fn: () => Promise<T>, retries: number = MAX_RETRIES): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const retryable = (err as any).retryable !== false;
        if (!retryable || attempt === retries) {
          throw err;
        }
        const delay = RETRY_DELAY_BASE * Math.pow(2, attempt) + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  async listFiles(): Promise<RemoteFileInfo[]> {
    return this.withRetry(async () => {
      const response = await this.client.get<RemoteFileInfo[]>('/files');
      return response.data;
    });
  }

  async getFileInfo(fileId: string): Promise<RemoteFileInfo> {
    return this.withRetry(async () => {
      const response = await this.client.get<RemoteFileInfo>(`/files/${fileId}`);
      return response.data;
    });
  }

  async uploadFile(request: FileUploadRequest): Promise<FileUploadResponse> {
    return this.withRetry(async () => {
      const contentSize = Buffer.byteLength(request.content, 'utf-8');

      if (contentSize > CHUNK_SIZE) {
        return await this.uploadFileChunked(request);
      }

      const response = await this.client.post<FileUploadResponse>('/files/upload', request, {
        timeout: Math.max(60000, contentSize * 10),
      });

      if (!response.data || !response.data.id || typeof response.data.version !== 'number') {
        throw new Error('上传响应数据不完整');
      }

      return response.data;
    });
  }

  private async uploadFileChunked(request: FileUploadRequest): Promise<FileUploadResponse> {
    const content = request.content;
    const totalSize = Buffer.byteLength(content, 'utf-8');
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);

    const initResponse = await this.client.post<FileUploadResponse>('/files/upload/init', {
      name: request.name,
      path: request.path,
      hash: request.hash,
      deviceId: request.deviceId,
      changeDescription: request.changeDescription,
      baseVersion: request.baseVersion,
      totalSize,
      totalChunks,
    });

    if (!initResponse.data || !initResponse.data.id) {
      throw new Error('分块上传初始化失败');
    }

    const uploadId = initResponse.data.id;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunkContent = content.substring(start, end);

      await this.withRetry(async () => {
        await this.client.post('/files/upload/chunk', {
          uploadId,
          chunkIndex,
          totalChunks,
          content: chunkContent,
        }, {
          timeout: Math.max(30000, chunkContent.length * 10),
        });
      }, MAX_RETRIES);
    }

    const completeResponse = await this.client.post<FileUploadResponse>('/files/upload/complete', {
      uploadId,
      hash: request.hash,
    });

    if (!completeResponse.data || typeof completeResponse.data.version !== 'number') {
      throw new Error('分块上传完成响应数据不完整');
    }

    return completeResponse.data;
  }

  async downloadFile(fileId: string, version?: number): Promise<FileDownloadResponse> {
    return this.withRetry(async () => {
      const params = version ? { version } : {};
      const response = await this.client.get<FileDownloadResponse>(
        `/files/${fileId}/download`,
        { params, timeout: 120000 }
      );

      if (!response.data || typeof response.data.version !== 'number' || !response.data.content) {
        throw new Error('下载响应数据不完整');
      }

      return response.data;
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    return this.withRetry(async () => {
      await this.client.delete(`/files/${fileId}`);
    });
  }

  async getVersions(fileId: string): Promise<VersionListResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<VersionListResponse>(`/files/${fileId}/versions`);
      return response.data;
    });
  }

  async getVersion(fileId: string, version: number): Promise<VersionRecord> {
    return this.withRetry(async () => {
      const response = await this.client.get<VersionRecord>(`/files/${fileId}/versions/${version}`);
      return response.data;
    });
  }

  async getDelta(fileId: string, fromVersion: number, toVersion: number): Promise<DeltaResponse> {
    return this.withRetry(async () => {
      const response = await this.client.get<DeltaResponse>(
        `/files/${fileId}/delta`,
        { params: { from: fromVersion, to: toVersion } }
      );
      return response.data;
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async getChangesSince(timestamp: string): Promise<RemoteFileInfo[]> {
    return this.withRetry(async () => {
      const response = await this.client.get<RemoteFileInfo[]>('/files/changes', {
        params: { since: timestamp },
      });
      return response.data;
    });
  }

  updateConfig(config: Partial<SyncConfig>): void {
    Object.assign(this.config, config);
    if (config.serverUrl || config.apiKey || config.deviceId) {
      this.client.defaults.baseURL = `${this.config.serverUrl}/api/v1`;
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.config.apiKey}`;
      this.client.defaults.headers.common['X-Device-Id'] = this.config.deviceId;
    }
  }

  getConfig(): Readonly<SyncConfig> {
    return { ...this.config };
  }
}
