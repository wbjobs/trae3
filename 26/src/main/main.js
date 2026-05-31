const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, setMainWindow } = require('../ipc/handlers');
const logger = require('../modules/logger');
const stateManager = require('../modules/stateManager');
const deviceDetector = require('../modules/deviceDetector');
const batchManager = require('../modules/batchTask');
const serialManager = require('../modules/serial');
const platform = require('../platform');

let mainWindow = null;
let isDev = process.argv.includes('--dev');
let isShuttingDown = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    },
    backgroundColor: '#f5f5f5',
    show: false
  });

  setMainWindow(mainWindow);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupMenu();
}

function setupMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '导入配置',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'JSON文件', extensions: ['json'] }]
            });
            if (!result.canceled && result.filePaths.length > 0) {
              try {
                const content = fs.readFileSync(result.filePaths[0], 'utf8');
                const config = JSON.parse(content);
                mainWindow.webContents.send('config:imported', config);
                logger.info('配置导入成功', { file: result.filePaths[0] });
              } catch (error) {
                logger.error('配置导入失败', error);
                dialog.showErrorBox('导入失败', '配置文件格式错误');
              }
            }
          }
        },
        {
          label: '导出配置',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              defaultPath: 'inspection-config.json',
              filters: [{ name: 'JSON文件', extensions: ['json'] }]
            });
            if (!result.canceled) {
              mainWindow.webContents.send('config:export-request', result.filePath);
            }
          }
        },
        { type: 'separator' },
        {
          label: '退出',
          role: 'quit'
        }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', role: 'reload' },
        { label: '强制刷新', role: 'forceReload' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '巡检仪参数配置工具',
              detail: `版本: ${app.getVersion()}\n平台: ${process.platform}\n架构: ${process.arch}`
            });
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  logger.init();
  logger.info(`应用启动 - 平台: ${platform.getPlatformName()}`);

  stateManager.init('inspection-instrument-config');
  deviceDetector.loadSavedDevices();
  batchManager.loadSavedTasks();
  batchManager.checkInterruptedTasks();

  const interruptedConfig = stateManager.checkInterruptedConfiguration();
  if (interruptedConfig) {
    logger.warn(`发现未完成的配置任务: ${interruptedConfig.operationType}`);
    try {
      await batchManager.startConfigurationRecovery();
    } catch (e) {
      logger.warn('配置恢复检查失败', e);
    }
  }

  const savedConnection = stateManager.getConnectionConfig();
  if (savedConnection && savedConnection.portPath) {
    logger.info(`保存的连接配置: ${savedConnection.portPath} @ ${savedConnection.baudRate} baud`);
  }

  setupIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('应用退出');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info('开始安全关闭...');

  try {
    deviceDetector.stopAutoScan();

    const isBatchRunning = batchManager.getStatus().isRunning;
    if (isBatchRunning) {
      logger.warn('批处理任务运行中，标记为中断状态');
      batchManager.interruptCurrentTasks();
      stateManager.interruptConfiguration('app-shutdown');
    }

    batchManager.saveTasks();
    stateManager.forceSave();

    const connectionStatus = serialManager.getStatus();
    if (connectionStatus.isConnected || connectionStatus.isConnecting) {
      serialManager.setAutoReconnect(false);
      await serialManager.disconnect();
    }

    logger.info('应用安全关闭完成');
  } catch (error) {
    logger.error('关闭过程中发生错误', error);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason: reason?.message, promise });
});
