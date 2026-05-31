import { contextBridge, ipcRenderer } from 'electron';
import { IPCChannel, IPCResponse } from '../shared/types';

const api = {
  invoke: <T = unknown>(channel: string, ...args: unknown[]): Promise<IPCResponse<T>> => {
    return ipcRenderer.invoke(channel, ...args);
  },

  send: (channel: string, ...args: unknown[]): void => {
    ipcRenderer.send(channel, ...args);
  },

  on: (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    ipcRenderer.on(channel, callback);
    return () => ipcRenderer.removeListener(channel, callback);
  },

  once: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.once(channel, callback);
  },

  removeListener: (channel: string, callback: (...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, callback);
  },

  project: {
    new: (name: string, description?: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_NEW, name, description),
    open: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_OPEN, projectId),
    save: (project: unknown) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_SAVE, project),
    delete: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_DELETE, projectId),
    list: () =>
      ipcRenderer.invoke(IPCChannel.PROJECT_LIST),
  },

  file: {
    read: (projectId: string, filePath: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_READ, projectId, filePath),
    write: (projectId: string, name: string, filePath: string, content: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_WRITE, projectId, name, filePath, content),
    delete: (projectId: string, fileId: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_DELETE, projectId, fileId),
    rename: (projectId: string, fileId: string, newName: string, newPath: string) =>
      ipcRenderer.invoke(IPCChannel.FILE_RENAME, projectId, fileId, newName, newPath),
  },

  validate: {
    file: (file: unknown) =>
      ipcRenderer.invoke(IPCChannel.VALIDATE_FILE, file),
    project: (files: unknown[]) =>
      ipcRenderer.invoke(IPCChannel.VALIDATE_PROJECT, files),
  },

  sync: {
    start: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.SYNC_START, projectId),
    status: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.SYNC_STATUS, projectId),
    push: (projectId: string) =>
      ipcRenderer.invoke(IPCChannel.SYNC_PUSH, projectId),
    pull: (cloudId: string) =>
      ipcRenderer.invoke(IPCChannel.SYNC_PULL, cloudId),
  },

  cloud: {
    list: () =>
      ipcRenderer.invoke(IPCChannel.CLOUD_LIST),
    get: (cloudId: string) =>
      ipcRenderer.invoke(IPCChannel.CLOUD_GET, cloudId),
    create: (project: unknown) =>
      ipcRenderer.invoke(IPCChannel.CLOUD_CREATE, project),
    delete: (cloudId: string) =>
      ipcRenderer.invoke(IPCChannel.CLOUD_DELETE, cloudId),
  },

  cache: {
    get: (key: string) =>
      ipcRenderer.invoke(IPCChannel.CACHE_GET, key),
    set: (key: string, data: unknown, ttl?: number) =>
      ipcRenderer.invoke(IPCChannel.CACHE_SET, key, data, ttl),
    clear: (key?: string) =>
      ipcRenderer.invoke(IPCChannel.CACHE_CLEAR, key),
  },

  version: {
    list: (projectId: string, cloudId?: string) =>
      ipcRenderer.invoke(IPCChannel.VERSION_LIST, projectId, cloudId),
    create: (projectId: string, description: string, author: string, cloudId?: string) =>
      ipcRenderer.invoke(IPCChannel.VERSION_CREATE, projectId, description, author, cloudId),
    rollback: (projectId: string, version: string, cloudId?: string) =>
      ipcRenderer.invoke(IPCChannel.VERSION_ROLLBACK, projectId, version, cloudId),
  },

  config: {
    get: () =>
      ipcRenderer.invoke(IPCChannel.CONFIG_GET),
    set: (config: unknown) =>
      ipcRenderer.invoke(IPCChannel.CONFIG_SET, config),
  },

  encryption: {
    encrypt: (projectId: string, password: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_ENCRYPT, projectId, password),
    decrypt: (projectId: string, password: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_DECRYPT, projectId, password),
  },

  export: {
    export: (projectId: string, outputPath: string, options: unknown) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_EXPORT, projectId, outputPath, options),
    batchExport: (projectIds: string[], outputDir: string, options: unknown) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_BATCH_EXPORT, projectIds, outputDir, options),
    import: (filePath: string, password?: string) =>
      ipcRenderer.invoke(IPCChannel.PROJECT_IMPORT, filePath, password),
  },

  dialog: {
    showMessageBox: (options: Electron.MessageBoxOptions) =>
      ipcRenderer.invoke('app:show-dialog', options),
    showOpenDialog: (options: Electron.OpenDialogOptions) =>
      ipcRenderer.invoke('app:show-open-dialog', options),
    showSaveDialog: (options: Electron.SaveDialogOptions) =>
      ipcRenderer.invoke('app:show-save-dialog', options),
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = typeof api;
