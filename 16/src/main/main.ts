import 'reflect-metadata';
import { app, BrowserWindow, ipcMain, shell, Menu, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { createBackendServer } from '../backend/server';
import { serviceContainer } from '../backend/services/ServiceContainer';
import { createModuleLogger } from '../shared/modules/logger';
import { AppDataSource } from '../backend/database/data-source';
import { TaskStatus, TerminalStatus } from '@shared/types';
import { getDatabasePath } from '../backend/database/data-source';

const logger = createModuleLogger('ElectronMain');

let mainWindow: BrowserWindow | null = null;
let backendStarted = false;
const startTime = Date.now();

const loadConfig = (): { backendPort: number } => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      return { backendPort: 3000 };
    }
  }
  return { backendPort: 3000 };
};

const saveConfigFile = (config: Partial<{ backendPort: number }>): void => {
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const existingConfig = loadConfig();
  const newConfig = { ...existingConfig, ...config };
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
};

const savedConfig = loadConfig();
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || savedConfig.backendPort || 3000;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 768,
    show: false,
    frame: true,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (process.env.NODE_ENV === 'development') {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  createMenu();
};

const createMenu = (): void => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开日志目录',
          click: () => {
            const logDir = process.env.NODE_ENV === 'development'
              ? path.join(process.cwd(), 'logs')
              : path.join(app.getPath('userData'), 'logs');
            shell.openPath(logDir);
          }
        },
        {
          label: '打开固件目录',
          click: () => {
            const firmwareDir = process.env.NODE_ENV === 'development'
              ? path.join(process.cwd(), 'firmwares')
              : path.join(app.getPath('userData'), 'firmwares');
            shell.openPath(firmwareDir);
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '工具',
      submenu: [
        {
          label: '选择固件文件',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openFile'],
              filters: [
                { name: '固件文件', extensions: ['bin', 'img', 'hex', 'zip'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('firmware:selected', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: '导出日志',
          click: async () => {
            const result = await dialog.showSaveDialog({
              title: '导出日志',
              defaultPath: `firmware-manager-logs-${Date.now()}.json`,
              filters: [{ name: 'JSON', extensions: ['json'] }]
            });

            if (!result.canceled && result.filePath) {
              mainWindow?.webContents.send('logs:export', result.filePath);
            }
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: '文档',
          click: () => shell.openExternal('https://github.com/firmware-manager/docs')
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

const getStoragePath = (type: 'database' | 'firmware' | 'logs'): string => {
  const isDev = process.env.NODE_ENV === 'development';
  const userDataPath = app.getPath('userData');
  
  switch (type) {
    case 'database':
      return getDatabasePath();
    case 'firmware':
      return isDev
        ? path.join(process.cwd(), 'firmwares')
        : path.join(userDataPath, 'firmwares');
    case 'logs':
      return isDev
        ? path.join(process.cwd(), 'logs')
        : path.join(userDataPath, 'logs');
    default:
      return userDataPath;
  }
};

const setupIpcHandlers = (): void => {
  ipcMain.handle('app:get-config', () => {
    return {
      backendPort: BACKEND_PORT,
      isDevelopment: process.env.NODE_ENV === 'development',
      appVersion: app.getVersion(),
      platform: process.platform,
      userDataPath: app.getPath('userData')
    };
  });

  ipcMain.handle('app:save-config', (_event, config: { backendPort?: number }) => {
    try {
      saveConfigFile(config);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('app:get-system-info', () => {
    const uptime = (Date.now() - startTime) / 1000;
    return {
      platform: process.platform,
      nodeVersion: process.version,
      appVersion: app.getVersion(),
      databasePath: getStoragePath('database'),
      firmwareStoragePath: getStoragePath('firmware'),
      logStoragePath: getStoragePath('logs'),
      uptime
    };
  });

  ipcMain.handle('app:select-firmware-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '固件文件', extensions: ['bin', 'img', 'hex', 'zip'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, filePath: result.filePaths[0] };
    }
    return { success: false, error: '用户取消选择' };
  });

  ipcMain.handle('app:open-path', (_event, typeOrPath: string) => {
    let targetPath: string;
    if (typeOrPath === 'database' || typeOrPath === 'firmware' || typeOrPath === 'logs') {
      targetPath = getStoragePath(typeOrPath);
    } else {
      targetPath = typeOrPath;
    }
    
    const dirPath = path.dirname(targetPath);
    shell.openPath(dirPath);
    return { success: true };
  });

  ipcMain.handle('app:show-message-box', (_event, options: Electron.MessageBoxOptions) => {
    return dialog.showMessageBox(options);
  });

  ipcMain.handle('backend:status', () => {
    return {
      started: backendStarted,
      port: BACKEND_PORT,
      databaseInitialized: AppDataSource.isInitialized
    };
  });

  ipcMain.handle('app:get-stats', async () => {
    try {
      if (!serviceContainer.isInitialized()) {
        return { success: false, error: '服务未初始化' };
      }

      const terminalStats = await serviceContainer.terminalManager.getTerminalCountByStatus();
      const taskStats = await serviceContainer.taskManager.getTaskList({ page: 1, pageSize: 100 });

      const stats = {
        terminals: terminalStats,
        tasks: {
          total: taskStats.total,
          pending: taskStats.items.filter(t => t.status === TaskStatus.PENDING).length,
          running: taskStats.items.filter(t => t.status === TaskStatus.RUNNING).length,
          completed: taskStats.items.filter(t => t.status === TaskStatus.COMPLETED).length,
          failed: taskStats.items.filter(t => t.status === TaskStatus.FAILED).length
        }
      };

      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });
};

const initializeApp = async (): Promise<void> => {
  try {
    logger.info('app_init', '应用程序初始化开始');

    await createBackendServer(BACKEND_PORT);
    backendStarted = true;
    logger.info('backend_ready', '后端服务初始化完成');

    setupIpcHandlers();
    logger.info('ipc_ready', 'IPC通信处理器初始化完成');

    createWindow();
    logger.info('window_ready', '主窗口创建完成');

  } catch (error) {
    logger.error('app_init_failed', '应用程序初始化失败', { error: (error as Error).message });
    dialog.showErrorBox(
      '应用启动失败',
      `无法启动应用程序: ${(error as Error).message}`
    );
    app.quit();
  }
};

app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  logger.info('app_quit', '应用程序即将退出');
});

process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', '未捕获的异常', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', '未处理的Promise拒绝', { reason: String(reason) });
});
