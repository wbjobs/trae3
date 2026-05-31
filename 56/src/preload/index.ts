import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';

const electronAPI = {
  convert: {
    start: (sourceFile: any, targetFormat: string, outputDir: string, options?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERT_START, sourceFile, targetFormat, outputDir, options),
    cancel: (taskId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERT_CANCEL, taskId),
    batch: (sourceFiles: any[], targetFormat: string, outputDir: string, options?: any) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONVERT_BATCH, sourceFiles, targetFormat, outputDir, options),
    getCacheStats: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERT_CACHE_STATS),
    clearCache: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERT_CLEAR_CACHE),
    onProgress: (callback: (task: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CONVERT_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERT_PROGRESS, handler);
    },
  },
  compare: {
    start: (drawingId: string, versionA: number, versionB: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.COMPARE_START, drawingId, versionA, versionB),
    highlight: (drawingId: string, versionA: number, versionB: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.COMPARE_HIGHLIGHT, drawingId, versionA, versionB),
    onResult: (callback: (result: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.COMPARE_RESULT, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.COMPARE_RESULT, handler);
    },
  },
  sync: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SYNC_STATUS),
    upload: (drawing: any, localPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_UPLOAD, drawing, localPath),
    download: (cloudDrawing: any, savePath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SYNC_DOWNLOAD, cloudDrawing, savePath),
    onProgress: (callback: (task: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.SYNC_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.SYNC_PROGRESS, handler);
    },
  },
  cache: {
    getStats: () => ipcRenderer.invoke(IPC_CHANNELS.CACHE_STATS),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.CACHE_CLEAR),
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.CACHE_GET, key),
    set: (key: string, data: string, ttl?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.CACHE_SET, key, data, ttl),
  },
  drawing: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.DRAWING_LIST),
    open: () => ipcRenderer.invoke(IPC_CHANNELS.DRAWING_OPEN),
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),
  },
  encrypt: {
    start: (sourcePath: string, outputPath?: string, keyId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_START, sourcePath, outputPath, keyId),
    batch: (sourcePaths: string[], outputDir?: string, keyId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_BATCH, sourcePaths, outputDir, keyId),
    decrypt: (sourcePath: string, outputPath?: string, keyId?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_DECRYPT, sourcePath, outputPath, keyId),
    listKeys: () => ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_LIST_KEYS),
    createKey: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_CREATE_KEY, name),
    deleteKey: (keyId: string) => ipcRenderer.invoke(IPC_CHANNELS.ENCRYPT_DELETE_KEY, keyId),
    onProgress: (callback: (task: any) => void) => {
      const handler = (_event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.ENCRYPT_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.ENCRYPT_PROGRESS, handler);
    },
  },
  platform: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.PLATFORM_GET_INFO),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
