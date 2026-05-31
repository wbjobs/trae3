import { contextBridge, ipcRenderer } from 'electron';
import { ApiResponse } from '@shared/types';

export interface AppAPI {
  getConfig: () => Promise<{
    backendPort: number;
    isDevelopment: boolean;
    appVersion: string;
    platform: string;
    userDataPath: string;
  }>;
  saveConfig: (config: { backendPort?: number }) => Promise<ApiResponse<void>>;
  getSystemInfo: () => Promise<{
    platform: string;
    nodeVersion: string;
    appVersion: string;
    databasePath: string;
    firmwareStoragePath: string;
    logStoragePath: string;
    uptime: number;
  }>;
  selectFirmwareFile: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
  openPath: (type: 'database' | 'firmware' | 'logs' | string) => Promise<{ success: boolean }>;
  showMessageBox: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue>;
  getBackendStatus: () => Promise<{
    started: boolean;
    port: number;
    databaseInitialized: boolean;
  }>;
  getStats: () => Promise<ApiResponse<{
    terminals: Record<string, number>;
    tasks: {
      total: number;
      pending: number;
      running: number;
      completed: number;
      failed: number;
    };
  }>>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  off: (channel: string, callback: (...args: unknown[]) => void) => void;
}

const api: AppAPI = {
  getConfig: () => ipcRenderer.invoke('app:get-config'),
  saveConfig: (config) => ipcRenderer.invoke('app:save-config', config),
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  selectFirmwareFile: () => ipcRenderer.invoke('app:select-firmware-file'),
  openPath: (type) => ipcRenderer.invoke('app:open-path', type),
  showMessageBox: (options) => ipcRenderer.invoke('app:show-message-box', options),
  getBackendStatus: () => ipcRenderer.invoke('backend:status'),
  getStats: () => ipcRenderer.invoke('app:get-stats'),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, (_event, ...args) => callback(...args));
  }
};

contextBridge.exposeInMainWorld('appAPI', api);
