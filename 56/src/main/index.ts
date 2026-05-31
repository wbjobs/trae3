import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { localCacheService } from './services/cache';
import { drawingComparator } from './services/comparator';
import { drawingEncryptionService } from './services/encryption';
import { cloudSyncService } from './services/sync';
import { registerIpcHandlers } from './ipc';
import { APP_NAME } from '@shared/constants';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  registerIpcHandlers(mainWindow);
}

app.whenReady().then(async () => {
  const userDataPath = app.getPath('userData');
  await Promise.all([
    localCacheService.initialize(userDataPath),
    drawingComparator.initialize(userDataPath),
    drawingEncryptionService.initialize(userDataPath),
  ]);

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
  await Promise.all([
    localCacheService.cleanupExpired(),
    cloudSyncService.destroy(),
  ]);
});
