const { BrowserWindow, app } = require('electron');
const path = require('path');
const logger = require('../modules/logger');

let mainWindow = null;

function createWindow() {
  logger.info('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#1D2129',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false
    },
    icon: process.platform === 'win32' 
      ? path.join(__dirname, '../../build/icon.ico')
      : path.join(__dirname, '../../build/icon.icns')
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    logger.info('Main window ready to show');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    logger.info('Main window closed');
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window:state-changed', { isMaximized: true });
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window:state-changed', { isMaximized: false });
  });

  mainWindow.on('focus', () => {
    mainWindow.webContents.send('window:focus');
  });

  mainWindow.on('blur', () => {
    mainWindow.webContents.send('window:blur');
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

function getMainWindow() {
  return mainWindow;
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function minimizeWindow() {
  if (mainWindow) {
    mainWindow.minimize();
  }
}

function toggleMaximize() {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
}

function closeWindow() {
  if (mainWindow) {
    mainWindow.close();
  }
}

module.exports = {
  createWindow,
  getMainWindow,
  sendToRenderer,
  minimizeWindow,
  toggleMaximize,
  closeWindow
};
