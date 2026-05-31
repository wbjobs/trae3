import axios, { AxiosInstance } from 'axios';
import type { RemoteScript, ScriptFile, ScriptVersion, SyncConfig, SyncStatus } from '@/types';

export class CloudAPIClient {
  private client: AxiosInstance;
  private config: SyncConfig;

  constructor(config: SyncConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: config.serverUrl,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  updateConfig(config: SyncConfig): void {
    this.config = config;
    this.client.defaults.baseURL = config.serverUrl;
    this.client.defaults.headers.Authorization = `Bearer ${config.apiKey}`;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async fetchScriptList(params?: {
    category?: string;
    language?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  }): Promise<{ scripts: RemoteScript[]; total: number }> {
    const response = await this.client.get('/api/scripts', { params });
    return response.data;
  }

  async fetchScriptById(id: string): Promise<RemoteScript> {
    const response = await this.client.get(`/api/scripts/${id}`);
    return response.data;
  }

  async fetchScriptContent(id: string, version?: number): Promise<string> {
    const params = version ? { version } : undefined;
    const response = await this.client.get(`/api/scripts/${id}/content`, { params });
    return response.data.content;
  }

  async uploadScript(script: ScriptFile): Promise<RemoteScript> {
    const response = await this.client.post('/api/scripts', {
      name: script.name,
      content: script.content,
      language: script.language,
      tags: script.tags,
      localId: script.id
    });
    return response.data;
  }

  async updateScript(id: string, script: Partial<ScriptFile>): Promise<RemoteScript> {
    const response = await this.client.put(`/api/scripts/${id}`, script);
    return response.data;
  }

  async deleteScript(id: string): Promise<void> {
    await this.client.delete(`/api/scripts/${id}`);
  }

  async fetchScriptVersions(scriptId: string): Promise<ScriptVersion[]> {
    const response = await this.client.get(`/api/scripts/${scriptId}/versions`);
    return response.data;
  }

  async syncFiles(localFiles: ScriptFile[]): Promise<{
    updated: ScriptFile[];
    conflicts: string[];
    errors: string[];
  }> {
    const response = await this.client.post('/api/sync', {
      files: localFiles.map(f => ({
        id: f.remoteId,
        localId: f.id,
        name: f.name,
        content: f.content,
        language: f.language,
        version: f.version,
        updatedAt: f.updatedAt
      }))
    });
    return response.data;
  }

  async getSyncStatus(): Promise<SyncStatus> {
    const response = await this.client.get('/api/sync/status');
    return response.data;
  }

  async downloadScript(id: string): Promise<{ content: string; script: RemoteScript }> {
    const response = await this.client.post(`/api/scripts/${id}/download`);
    return response.data;
  }

  async starScript(id: string): Promise<void> {
    await this.client.post(`/api/scripts/${id}/star`);
  }

  async unstarScript(id: string): Promise<void> {
    await this.client.delete(`/api/scripts/${id}/star`);
  }

  async getCategories(): Promise<string[]> {
    const response = await this.client.get('/api/categories');
    return response.data;
  }
}

export const createAPIClient = (config: SyncConfig): CloudAPIClient => {
  return new CloudAPIClient(config);
};
