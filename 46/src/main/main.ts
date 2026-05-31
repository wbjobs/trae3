import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { Application } from './application';

let mainWindow: BrowserWindow | null = null;
let application: Application | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: '数控程序管理器',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  application = new Application();
  await application.initialize();

  registerIpcHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (application) {
    await application.shutdown();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle('parser:parse', async (_event, content: string, format: string) => {
    return application!.parseProgram(content, format);
  });

  ipcMain.handle('parser:validate', async (_event, content: string, format: string) => {
    return application!.validateProgram(content, format);
  });

  ipcMain.handle('converter:convert', async (_event, content: string, sourceFormat: string, targetFormat: string) => {
    return application!.convertFormat(content, sourceFormat, targetFormat);
  });

  ipcMain.handle('files:import', async (_event, name: string, content: string, format: string) => {
    return application!.importFile(name, content, format);
  });

  ipcMain.handle('files:list', async () => {
    return application!.listFiles();
  });

  ipcMain.handle('files:get', async (_event, id: string) => {
    return application!.getFile(id);
  });

  ipcMain.handle('files:read', async (_event, id: string) => {
    return application!.readFileContent(id);
  });

  ipcMain.handle('files:readVersion', async (_event, id: string, version: number) => {
    return application!.readFileVersion(id, version);
  });

  ipcMain.handle('files:update', async (_event, id: string, content: string, description: string) => {
    return application!.updateFileContent(id, content, description);
  });

  ipcMain.handle('files:delete', async (_event, id: string) => {
    return application!.deleteFile(id);
  });

  ipcMain.handle('files:versions', async (_event, id: string) => {
    return application!.getFileVersions(id);
  });

  ipcMain.handle('files:search', async (_event, query: string, format?: string) => {
    return application!.searchFiles(query, format);
  });

  ipcMain.handle('files:openDialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '数控程序', extensions: ['nc', 'gcode', 'tap', 'txt', 'ngc', 'cnc'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return result;
  });

  ipcMain.handle('files:saveDialog', async () => {
    const result = await dialog.showSaveDialog(mainWindow!, {
      filters: [
        { name: '数控程序', extensions: ['nc', 'gcode', 'tap', 'txt', 'ngc', 'cnc'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    });
    return result;
  });

  ipcMain.handle('sync:start', async () => {
    return application!.startSync();
  });

  ipcMain.handle('sync:stop', async () => {
    return application!.stopSync();
  });

  ipcMain.handle('sync:status', async () => {
    return application!.getSyncStatus();
  });

  ipcMain.handle('sync:resolveConflict', async (_event, conflictId: string, resolution: string) => {
    return application!.resolveConflict(conflictId, resolution as any);
  });

  ipcMain.handle('config:get', async () => {
    return application!.getConfig();
  });

  ipcMain.handle('config:update', async (_event, updates: any) => {
    return application!.updateConfig(updates);
  });

  ipcMain.handle('config:reset', async () => {
    return application!.resetConfig();
  });

  ipcMain.handle('stats:get', async () => {
    return application!.getStorageStats();
  });
}
