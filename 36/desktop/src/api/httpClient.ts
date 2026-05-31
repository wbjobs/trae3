import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { FirmwareArchive, LogEntry, VersionInfo, DiffResult, PaginationParams, PaginatedResponse, VersionRollbackResult } from '@shared/types';
import { useConfigStore } from '@/stores/configStore';

class HttpClient {
  private instance: AxiosInstance;
  private configStore: ReturnType<typeof useConfigStore> | null = null;

  constructor() {
    this.instance = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private initConfigStore() {
    if (!this.configStore) {
      this.configStore = useConfigStore();
    }
    return this.configStore;
  }

  private setupInterceptors() {
    this.instance.interceptors.request.use(
      (config) => {
        const store = this.initConfigStore();
        if (store.config.server.apiKey) {
          config.headers['X-API-Key'] = store.config.server.apiKey;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    this.instance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('HTTP Error:', error);
        return Promise.reject(error);
      }
    );
  }

  private getBaseUrl(): string {
    const store = this.initConfigStore();
    return store.serverUrl;
  }

  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    const url = config.url?.startsWith('http')
      ? config.url
      : `${this.getBaseUrl()}${config.url}`;
    
    return this.instance.request<T>({ ...config, url });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>({ method: 'GET', url, ...config });
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>({ method: 'POST', url, data, ...config });
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>({ method: 'PUT', url, data, ...config });
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.request<T>({ method: 'DELETE', url, ...config });
    return response.data;
  }

  async uploadFile(url: string, file: File | Blob, filename: string, onProgress?: (progress: number) => void): Promise<FirmwareArchive> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const response = await this.request<FirmwareArchive>({
      method: 'POST',
      url,
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      }
    });

    return response.data;
  }

  async downloadFile(url: string, onProgress?: (progress: number) => void): Promise<Blob> {
    const response = await this.request<Blob>({
      method: 'GET',
      url,
      responseType: 'blob',
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      }
    });

    return response.data;
  }

  async healthCheck(): Promise<{ status: string; version: string }> {
    return this.get<{ status: string; version: string }>('/api/health');
  }

  async getFirmwareList(params?: PaginationParams & { projectId?: string; version?: string }): Promise<PaginatedResponse<FirmwareArchive>> {
    return this.get<PaginatedResponse<FirmwareArchive>>('/api/firmware', { params });
  }

  async getFirmwareById(id: string): Promise<FirmwareArchive> {
    return this.get<FirmwareArchive>(`/api/firmware/${id}`);
  }

  async uploadFirmware(
    projectId: string,
    projectName: string,
    version: string,
    filePath: string,
    onProgress?: (progress: number) => void
  ): Promise<FirmwareArchive> {
    const buffer = await window.electronAPI.fs.readFile(filePath);
    const blob = new Blob([buffer]);
    const filename = await window.electronAPI.path.basename(filePath);

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('projectId', projectId);
    formData.append('projectName', projectName);
    formData.append('version', version);

    const response = await this.request<FirmwareArchive>({
      method: 'POST',
      url: '/api/firmware/upload',
      data: formData,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      }
    });

    return response.data;
  }

  async downloadFirmware(id: string, onProgress?: (progress: number) => void): Promise<Blob> {
    return this.downloadFile(`/api/firmware/${id}/download`, onProgress);
  }

  async deleteFirmware(id: string): Promise<void> {
    return this.delete<void>(`/api/firmware/${id}`);
  }

  async validateFirmware(id: string): Promise<{ valid: boolean; md5: string; size: number }> {
    return this.post<{ valid: boolean; md5: string; size: number }>(`/api/firmware/${id}/validate`);
  }

  async compareVersions(leftId: string, rightId: string): Promise<DiffResult> {
    return this.get<DiffResult>(`/api/firmware/compare/${leftId}/${rightId}`);
  }

  async getVersionInfo(id: string): Promise<VersionInfo> {
    return this.get<VersionInfo>(`/api/firmware/${id}/version-info`);
  }

  async getLogs(params?: PaginationParams & { projectId?: string; buildId?: string; level?: string }): Promise<PaginatedResponse<LogEntry>> {
    return this.get<PaginatedResponse<LogEntry>>('/api/logs', { params });
  }

  async getLogById(id: string): Promise<LogEntry> {
    return this.get<LogEntry>(`/api/logs/${id}`);
  }

  async getBuildLog(buildId: string): Promise<string> {
    return this.request<string>({
      method: 'GET',
      url: `/api/logs/build/${buildId}`,
      responseType: 'text'
    }).then(response => response.data);
  }

  async uploadLog(buildId: string, projectId: string, content: string): Promise<{ success: boolean; data: LogEntry; message: string }> {
    return this.post<{ success: boolean; data: LogEntry; message: string }>('/api/logs/build', { buildId, projectId, content });
  }

  async deleteLogs(params: { olderThan?: number; projectId?: string }): Promise<{ deleted: number }> {
    return this.delete<{ deleted: number }>('/api/logs', { params });
  }

  async updateFirmwareTags(id: string, tags: string[]): Promise<FirmwareArchive> {
    return this.put<FirmwareArchive>(`/api/firmware/${id}/tags`, { tags });
  }

  async searchFirmware(query: string): Promise<FirmwareArchive[]> {
    return this.get<FirmwareArchive[]>('/api/firmware/search', { params: { q: query } });
  }

  async getProjectVersions(projectId: string): Promise<FirmwareArchive[]> {
    return this.get<FirmwareArchive[]>(`/api/firmware/project/${projectId}/versions`);
  }

  async getVersionTree(projectId: string): Promise<Array<{ version: string; buildNumber: number; uploadTime: number; md5: string; previousVersion: string | null }>> {
    return this.get(`/api/version/tree/${projectId}`);
  }

  async rollbackVersion(projectId: string, targetVersion: string, reason?: string): Promise<VersionRollbackResult> {
    return this.post<VersionRollbackResult>(`/api/version/rollback/${projectId}`, { targetVersion, reason });
  }

  async getNextVersion(projectId: string, increment: 'major' | 'minor' | 'patch' = 'patch'): Promise<string> {
    return this.get<string>(`/api/version/next/${projectId}`, { params: { increment } });
  }
}

export const httpClient = new HttpClient();
