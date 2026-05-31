const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createWindow } = require('./window');
const { setupIpcHandlers } = require('./ipc');
const logger = require('../modules/logger');
const deviceMonitor = require('../modules/device-monitor');
const serialManager = require('../modules/serialport');
const { taskManager } = require('../modules/task-manager');
const firmwareParser = require('../modules/firmware');
const memoryManager = require('../modules/utils/MemoryManager');

const isMac = process.platform === 'darwin';
const isDev = process.argv.includes('--dev');
const isShuttingDown = false;

if (isDev) {
  app.commandLine.appendSwitch('js-flags', '--expose-gc');
}

logger.info('='.repeat(60));
logger.info('Firmware Flasher Application Starting');
logger.info(`Platform: ${process.platform}`);
logger.info(`Node version: ${process.version}`);
logger.info(`Electron version: ${process.versions.electron}`);
logger.info(`Dev mode: ${isDev}`);
logger.info('='.repeat(60));

app.whenReady().then(async () => {
  logger.info('App ready, initializing modules...');

  try {
    memoryManager.startMonitoring(10000);
    logger.info('Memory manager started');
    
    taskManager.loadHistory();
    
    const checkpointCount = await taskManager.loadCheckpoints();
    if (checkpointCount > 0) {
      logger.info(`Found ${checkpointCount} interrupted tasks from previous session`);
    }
    
    setupIpcHandlers();
    createWindow();
    deviceMonitor.start(2000);
    logger.info('Device monitor started with 2000ms interval');

    if (checkpointCount > 0 && taskManager.autoResumeOnStartup) {
      setTimeout(async () => {
        try {
          const resumedCount = await taskManager.autoResumeTasks(firmwareParser);
          if (resumedCount > 0) {
            logger.info(`Auto-resumed ${resumedCount} interrupted tasks`);
          }
        } catch (error) {
          logger.error('Failed to auto-resume tasks:', error);
        }
      }, 3000);
    }

  } catch (error) {
    logger.error('Failed to initialize application:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  logger.info('All windows closed, performing cleanup...');

  try {
    deviceMonitor.stop();
    logger.info('Device monitor stopped');

    await serialManager.disconnectAll();
    logger.info('All serial connections closed');

    if (taskManager.isRunning) {
      logger.info('Tasks still running, saving checkpoints before shutdown...');
      await taskManager.cancelAll(true);
    } else {
      await taskManager.cancelAll(false);
    }

  } catch (error) {
    logger.error('Error during shutdown:', error);
  }

  if (!isMac) {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  logger.info('Application about to quit');
});

app.on('quit', (event, exitCode) => {
  logger.info(`Application exited with code: ${exitCode}`);
});

app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol !== 'file:' && !isDev) {
      event.preventDefault();
      logger.warn(`Blocked navigation to: ${navigationUrl}`);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    logger.info(`Opening external URL: ${url}`);
    return { action: 'deny' };
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});
