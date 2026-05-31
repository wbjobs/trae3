import axios from 'axios';
import type {
  Terminal,
  TerminalGroup,
  Firmware,
  UpgradeTask,
  TaskProgress,
  LogEntry,
  LogLevel,
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
  TerminalStatus,
  TaskStatus,
  NetworkScanResult,
  FirmwareValidationResult
} from '@shared/types';

const getBaseURL = async (): Promise<string> => {
  if (window.appAPI) {
    const config = await window.appAPI.getConfig();
    return `http://localhost:${config.backendPort}/api`;
  }
  return 'http://localhost:3000/api';
};

const createApiClient = async () => {
  const baseURL = await getBaseURL();
  return axios.create({
    baseURL,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json'
    }
  });
};

class ApiService {
  private client: ReturnType<typeof axios.create> | null = null;

  private async getClient() {
    if (!this.client) {
      this.client = await createApiClient();
    }
    return this.client;
  }

  private async request<T>(method: string, url: string, data?: unknown, config?: Record<string, unknown>): Promise<ApiResponse<T>> {
    try {
      const client = await this.getClient();
      const response = await client.request<ApiResponse<T>>({
        method,
        url,
        data,
        ...config
      });
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: ApiResponse<T> }; message: string };
      if (err.response?.data) {
        return err.response.data;
      }
      return {
        success: false,
        error: err.message || '请求失败'
      };
    }
  }

  async getHealth(): Promise<ApiResponse<{ status: string; timestamp: string; initialized: boolean }>> {
    return this.request('GET', '/health');
  }

  async getTerminals(params?: {
    page?: number;
    pageSize?: number;
    groupId?: string;
    status?: TerminalStatus;
    keyword?: string;
  }): Promise<ApiResponse<PaginatedResponse<Terminal>>> {
    return this.request('GET', '/terminals', undefined, { params });
  }

  async getTerminal(id: string): Promise<ApiResponse<Terminal>> {
    return this.request('GET', `/terminals/${id}`);
  }

  async createTerminal(data: Omit<Terminal, 'id' | 'createdAt' | 'updatedAt' | 'lastSeen'>): Promise<ApiResponse<Terminal>> {
    return this.request('POST', '/terminals', data);
  }

  async updateTerminal(id: string, data: Partial<Terminal>): Promise<ApiResponse<Terminal>> {
    return this.request('PUT', `/terminals/${id}`, data);
  }

  async deleteTerminal(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/terminals/${id}`);
  }

  async getTerminalStats(): Promise<ApiResponse<Record<TerminalStatus, number>>> {
    return this.request('GET', '/terminals/stats/count-by-status');
  }

  async scanNetwork(network?: string, netmask?: string): Promise<ApiResponse<NetworkScanResult[]>> {
    return this.request('POST', '/terminals/discover/scan', { network, netmask });
  }

  async getNetworks(): Promise<ApiResponse<{ network: string; netmask: string }[]>> {
    return this.request('GET', '/terminals/discover/networks');
  }

  async batchAddTerminals(terminals: Omit<Terminal, 'id' | 'createdAt' | 'updatedAt' | 'lastSeen'>[]): Promise<ApiResponse<{
    created: Terminal[];
    errors: { terminal: unknown; error: string }[];
  }>> {
    return this.request('POST', '/terminals/batch-add', { terminals });
  }

  async batchMoveTerminals(terminalIds: string[], groupId: string | null): Promise<ApiResponse<void>> {
    return this.request('POST', '/terminals/batch-move', { terminalIds, groupId });
  }

  async getGroups(params?: { page?: number; pageSize?: number; keyword?: string }): Promise<ApiResponse<PaginatedResponse<TerminalGroup>>> {
    return this.request('GET', '/groups', undefined, { params });
  }

  async getAllGroups(): Promise<ApiResponse<TerminalGroup[]>> {
    return this.request('GET', '/groups/all');
  }

  async getGroup(id: string): Promise<ApiResponse<TerminalGroup>> {
    return this.request('GET', `/groups/${id}`);
  }

  async createGroup(data: { name: string; description?: string }): Promise<ApiResponse<TerminalGroup>> {
    return this.request('POST', '/groups', data);
  }

  async updateGroup(id: string, data: { name?: string; description?: string }): Promise<ApiResponse<TerminalGroup>> {
    return this.request('PUT', `/groups/${id}`, data);
  }

  async deleteGroup(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/groups/${id}`);
  }

  async getFirmwares(params?: {
    page?: number;
    pageSize?: number;
    model?: string;
    keyword?: string;
  }): Promise<ApiResponse<PaginatedResponse<Firmware>>> {
    return this.request('GET', '/firmwares', undefined, { params });
  }

  async getFirmware(id: string): Promise<ApiResponse<Firmware>> {
    return this.request('GET', `/firmwares/${id}`);
  }

  async uploadFirmware(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<ApiResponse<Firmware>> {
    const client = await this.getClient();
    try {
      const response = await client.post<ApiResponse<Firmware>>('/firmwares', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percent);
          }
        }
      });
      return response.data;
    } catch (error: unknown) {
      const err = error as { response?: { data?: ApiResponse<Firmware> }; message: string };
      if (err.response?.data) {
        return err.response.data;
      }
      return {
        success: false,
        error: err.message || '上传失败'
      };
    }
  }

  async deleteFirmware(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/firmwares/${id}`);
  }

  async validateFirmware(id: string): Promise<ApiResponse<FirmwareValidationResult>> {
    return this.request('GET', `/firmwares/${id}/validate`);
  }

  async getFirmwareVersions(model: string): Promise<ApiResponse<Firmware[]>> {
    return this.request('GET', `/firmwares/model/${model}/versions`);
  }

  async getLatestFirmware(model: string): Promise<ApiResponse<Firmware>> {
    return this.request('GET', `/firmwares/model/${model}/latest`);
  }

  async checkUpdate(model: string, currentVersion: string): Promise<ApiResponse<{ hasUpdate: boolean; firmware: Firmware | null }>> {
    return this.request('GET', `/firmwares/model/${model}/check-update`, undefined, {
      params: { currentVersion }
    });
  }

  async getTasks(params?: { page?: number; pageSize?: number; status?: TaskStatus }): Promise<ApiResponse<PaginatedResponse<UpgradeTask>>> {
    return this.request('GET', '/tasks', undefined, { params });
  }

  async getRunningTasks(): Promise<ApiResponse<UpgradeTask[]>> {
    return this.request('GET', '/tasks/running');
  }

  async getQueuedTasks(): Promise<ApiResponse<string[]>> {
    return this.request('GET', '/tasks/queued');
  }

  async getTask(id: string): Promise<ApiResponse<UpgradeTask>> {
    return this.request('GET', `/tasks/${id}`);
  }

  async getTaskProgress(id: string): Promise<ApiResponse<TaskProgress[]>> {
    return this.request('GET', `/tasks/${id}/progress`);
  }

  async createTask(data: { name: string; firmwareId: string; terminalIds: string[] }): Promise<ApiResponse<UpgradeTask>> {
    return this.request('POST', '/tasks', data);
  }

  async startTask(id: string, firmware: Firmware, terminals: Terminal[]): Promise<ApiResponse<void>> {
    return this.request('POST', `/tasks/${id}/start`, { firmware, terminals });
  }

  async cancelTask(id: string): Promise<ApiResponse<void>> {
    return this.request('POST', `/tasks/${id}/cancel`);
  }

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/tasks/${id}`);
  }

  async getConcurrentSettings(): Promise<ApiResponse<{ maxConcurrentTasks: number }>> {
    return this.request('GET', '/tasks/settings/concurrent');
  }

  async setConcurrentSettings(max: number): Promise<ApiResponse<void>> {
    return this.request('PUT', '/tasks/settings/concurrent', { max });
  }

  async getLogs(params?: {
    page?: number;
    pageSize?: number;
    level?: LogLevel;
    module?: string;
    action?: string;
    startTime?: string;
    endTime?: string;
    keyword?: string;
  }): Promise<ApiResponse<PaginatedResponse<LogEntry>>> {
    return this.request('GET', '/logs', undefined, { params });
  }

  async getLog(id: string): Promise<ApiResponse<LogEntry>> {
    return this.request('GET', `/logs/${id}`);
  }

  async getLogStats(days: number = 7): Promise<ApiResponse<{
    total: number;
    byLevel: Record<LogLevel, number>;
    byModule: Record<string, number>;
    daily: { date: string; count: number }[];
  }>> {
    return this.request('GET', '/logs/stats/summary', undefined, { params: { days } });
  }

  async cleanLogs(beforeDays: number): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.request('DELETE', '/logs/clean', { beforeDays });
  }

  async clearAllLogs(): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.request('DELETE', '/logs/all');
  }

  async createLog(data: Omit<LogEntry, 'id' | 'createdAt'>): Promise<ApiResponse<LogEntry>> {
    return this.request('POST', '/logs', data);
  }
}

export const apiService = new ApiService();
export default apiService;
