import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as os from 'os';
import { drawingConverter } from '../services/converter';
import { drawingComparator } from '../services/comparator';
import { cloudSyncService } from '../services/sync';
import { localCacheService } from '../services/cache';
import { drawingEncryptionService } from '../services/encryption';
import { IPC_CHANNELS } from '@shared/constants';
import {
  ConvertTask,
  DiffResult,
  SyncStatus,
  CacheStats,
  IpcResponse,
  DrawingFile,
  EncryptTask,
  DecryptTask,
  EncryptionKey,
  HighlightResult,
} from '@shared/types';

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  registerConvertHandlers(mainWindow);
  registerCompareHandlers(mainWindow);
  registerSyncHandlers(mainWindow);
  registerCacheHandlers();
  registerDrawingHandlers();
  registerAppHandlers();
  registerEncryptionHandlers(mainWindow);
  registerPlatformHandlers();
}

function sendToRenderer(mainWindow: BrowserWindow, channel: string, data: unknown): void {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function registerConvertHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.CONVERT_START, async (_event, sourceFile: DrawingFile, targetFormat: string, outputDir: string, options?: Record<string, unknown>) => {
    try {
      const task = await drawingConverter.startConversion(sourceFile, targetFormat as any, outputDir, options);
      return { success: true, data: task } as IpcResponse<ConvertTask>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CONVERT_CANCEL, async (_event, taskId: string) => {
    const cancelled = drawingConverter.cancelTask(taskId);
    return { success: cancelled } as IpcResponse;
  });

  setInterval(() => {
    const tasks = drawingConverter.getAllTasks();
    const active = tasks.filter((t) => t.status === 'processing');
    for (const task of active) {
      sendToRenderer(mainWindow, IPC_CHANNELS.CONVERT_PROGRESS, task);
    }
  }, 500);
}

function registerCompareHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.COMPARE_START, async (_event, drawingId: string, versionA: number, versionB: number) => {
    try {
      const result = await drawingComparator.compare(drawingId, versionA, versionB);
      sendToRenderer(mainWindow, IPC_CHANNELS.COMPARE_RESULT, result);
      return { success: true, data: result } as IpcResponse<DiffResult>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.COMPARE_HIGHLIGHT, async (_event, drawingId: string, versionA: number, versionB: number) => {
    try {
      const result = await drawingComparator.generateHighlight(drawingId, versionA, versionB);
      return { success: true, data: result } as IpcResponse<HighlightResult>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });
}

function registerSyncHandlers(mainWindow: BrowserWindow): void {
  cloudSyncService.setProgressHandler((task) => {
    sendToRenderer(mainWindow, IPC_CHANNELS.SYNC_PROGRESS, task);
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_STATUS, async () => {
    try {
      const status = await cloudSyncService.getStatus();
      return { success: true, data: status } as IpcResponse<SyncStatus>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_UPLOAD, async (_event, drawing: DrawingFile, localPath: string) => {
    try {
      const task = await cloudSyncService.upload(drawing, localPath);
      return { success: true, data: task } as IpcResponse;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_DOWNLOAD, async (_event, cloudDrawing: any, savePath: string) => {
    try {
      const task = await cloudSyncService.download(cloudDrawing, savePath);
      return { success: true, data: task } as IpcResponse;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });
}

function registerCacheHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CACHE_STATS, async () => {
    const stats = localCacheService.getStats();
    return { success: true, data: stats } as IpcResponse<CacheStats>;
  });

  ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR, async () => {
    await localCacheService.clear();
    return { success: true } as IpcResponse;
  });

  ipcMain.handle(IPC_CHANNELS.CACHE_GET, async (_event, key: string) => {
    const data = await localCacheService.get(key);
    if (data) {
      return { success: true, data: data.toString('base64') } as IpcResponse;
    }
    return { success: false, error: '缓存未命中' } as IpcResponse;
  });

  ipcMain.handle(IPC_CHANNELS.CACHE_SET, async (_event, key: string, data: string, ttl?: number) => {
    await localCacheService.set(key, Buffer.from(data, 'base64'), ttl);
    return { success: true } as IpcResponse;
  });
}

function registerDrawingHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DRAWING_LIST, async () => {
    return { success: true, data: [] } as IpcResponse;
  });

  ipcMain.handle(IPC_CHANNELS.DRAWING_OPEN, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '图纸文件', extensions: ['dwg', 'dxf', 'pdf', 'svg'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return { success: !result.canceled, data: result.filePaths } as IpcResponse<string[]>;
  });
}

function registerAppHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => {
    return { success: true, data: '1.0.0' } as IpcResponse<string>;
  });
}

function registerEncryptionHandlers(mainWindow: BrowserWindow): void {
  drawingEncryptionService.setProgressHandler((task) => {
    sendToRenderer(mainWindow, IPC_CHANNELS.ENCRYPT_PROGRESS, task);
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_START, async (_event, sourcePath: string, outputPath?: string, keyId?: string) => {
    try {
      const task = await drawingEncryptionService.encryptFile(sourcePath, outputPath, keyId);
      return { success: true, data: task } as IpcResponse<EncryptTask>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_BATCH, async (_event, sourcePaths: string[], outputDir?: string, keyId?: string) => {
    try {
      const tasks = await drawingEncryptionService.batchEncrypt(sourcePaths, outputDir, keyId);
      return { success: true, data: tasks } as IpcResponse<EncryptTask[]>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_DECRYPT, async (_event, sourcePath: string, outputPath?: string, keyId?: string) => {
    try {
      const task = await drawingEncryptionService.decryptFile(sourcePath, outputPath, keyId);
      return { success: true, data: task } as IpcResponse<DecryptTask>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_LIST_KEYS, () => {
    try {
      const keys = drawingEncryptionService.listKeys();
      return { success: true, data: keys } as IpcResponse<EncryptionKey[]>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_CREATE_KEY, async (_event, name: string) => {
    try {
      const key = await drawingEncryptionService.createKey(name);
      return { success: true, data: key } as IpcResponse<EncryptionKey>;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENCRYPT_DELETE_KEY, async (_event, keyId: string) => {
    try {
      const deleted = await drawingEncryptionService.deleteKey(keyId);
      return { success: deleted } as IpcResponse;
    } catch (err: any) {
      return { success: false, error: err.message } as IpcResponse;
    }
  });
}

function registerPlatformHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PLATFORM_GET_INFO, () => {
    return {
      success: true,
      data: {
        platform: process.platform,
        arch: process.arch,
        release: os.release(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        homedir: os.homedir(),
        tmpdir: os.tmpdir(),
      },
    } as IpcResponse;
  });
}
