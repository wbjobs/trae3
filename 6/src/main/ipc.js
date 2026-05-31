const { ipcMain, dialog } = require('electron');
const path = require('path');
const logger = require('../modules/logger');
const serialManager = require('../modules/serialport');
const firmwareParser = require('../modules/firmware');
const { taskManager } = require('../modules/task-manager');
const deviceMonitor = require('../modules/device-monitor');
const { sendToRenderer, minimizeWindow, toggleMaximize, closeWindow } = require('./window');

const IPC_CHANNELS = {
  DEVICE_LIST: 'device:list',
  DEVICE_REFRESH: 'device:refresh',
  DEVICE_CHANGED: 'device:changed',
  DEVICES_UPDATED: 'devices:updated',

  FIRMWARE_LOAD: 'firmware:load',
  FIRMWARE_PARSED: 'firmware:parsed',

  TASK_CREATE: 'task:create',
  TASK_START: 'task:start',
  TASK_CANCEL: 'task:cancel',
  TASK_CANCEL_ALL: 'task:cancel-all',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETE: 'task:complete',
  TASK_LIST: 'task:list',
  TASK_CLEAR_COMPLETED: 'task:clear-completed',
  
  TASK_RESUMABLE_LIST: 'task:resumable:list',
  TASK_RESUME: 'task:resume',
  TASK_RESUME_BATCH: 'task:resume-batch',
  TASK_DISCARD_CHECKPOINT: 'task:discard-checkpoint',
  TASK_DISCARD_ALL_CHECKPOINTS: 'task:discard-all-checkpoints',
  CHECKPOINTS_LOADED: 'checkpoints:loaded',
  CHECKPOINT_DISCARDED: 'checkpoint:discarded',

  FIRMWARE_VERIFY: 'firmware:verify',
  FIRMWARE_CALCULATE_HASH: 'firmware:calculate-hash',

  PERFORMANCE_GET_METRICS: 'performance:get-metrics',
  MEMORY_GET_STATS: 'memory:get-stats',

  LOG_QUERY: 'log:query',
  LOG_EXPORT: 'log:export',
  LOG_CLEAR: 'log:clear',

  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',

  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close'
};

function setupIpcHandlers() {
  logger.info('Setting up IPC handlers...');

  ipcMain.handle(IPC_CHANNELS.DEVICE_LIST, async () => {
    try {
      return deviceMonitor.getDevices();
    } catch (error) {
      logger.error('Error getting device list:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DEVICE_REFRESH, async () => {
    try {
      await deviceMonitor.scanDevices();
      return deviceMonitor.getDevices();
    } catch (error) {
      logger.error('Error refreshing devices:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FIRMWARE_LOAD, async (_, filePath) => {
    try {
      const firmware = await firmwareParser.parse(filePath);
      const isValid = firmwareParser.validate(firmware);
      const info = firmwareParser.getFirmwareInfo(firmware);
      
      return {
        success: true,
        firmware: {
          ...firmware,
          data: undefined,
          segments: firmware.segments.map(s => ({
            ...s,
            data: undefined
          }))
        },
        info,
        isValid
      };
    } catch (error) {
      logger.error('Error loading firmware:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_CREATE, async (_, config) => {
    try {
      let fullFirmware = null;
      if (config.firmware && config.firmware.filePath) {
        fullFirmware = await firmwareParser.parse(config.firmware.filePath);
      }

      const task = taskManager.createTask({
        ...config,
        firmware: fullFirmware
      });

      return task.getProgressInfo();
    } catch (error) {
      logger.error('Error creating task:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_START, async (_, { taskIds, concurrency }) => {
    try {
      const results = await taskManager.startBatch(taskIds, concurrency);
      return results;
    } catch (error) {
      logger.error('Error starting tasks:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_CANCEL, async (_, taskId) => {
    try {
      return taskManager.cancelTask(taskId);
    } catch (error) {
      logger.error('Error cancelling task:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_CANCEL_ALL, async () => {
    try {
      taskManager.cancelAll();
      return true;
    } catch (error) {
      logger.error('Error cancelling all tasks:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_LIST, async () => {
    try {
      return taskManager.getAllTasks();
    } catch (error) {
      logger.error('Error getting task list:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_CLEAR_COMPLETED, async () => {
    try {
      return taskManager.clearCompletedTasks();
    } catch (error) {
      logger.error('Error clearing completed tasks:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_RESUMABLE_LIST, async () => {
    try {
      return taskManager.getResumableTasks();
    } catch (error) {
      logger.error('Error getting resumable tasks:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_RESUME, async (_, taskId) => {
    try {
      return await taskManager.resumeTask(taskId, firmwareParser);
    } catch (error) {
      logger.error('Error resuming task:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_RESUME_BATCH, async (_, { taskIds, concurrency }) => {
    try {
      return await taskManager.resumeBatch(taskIds, concurrency, firmwareParser);
    } catch (error) {
      logger.error('Error resuming batch:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_DISCARD_CHECKPOINT, async (_, taskId) => {
    try {
      return await taskManager.discardCheckpoint(taskId);
    } catch (error) {
      logger.error('Error discarding checkpoint:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.TASK_DISCARD_ALL_CHECKPOINTS, async () => {
    try {
      return await taskManager.discardAllCheckpoints();
    } catch (error) {
      logger.error('Error discarding all checkpoints:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOG_QUERY, async (_, options) => {
    try {
      return logger.queryLogs(options);
    } catch (error) {
      logger.error('Error querying logs:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOG_EXPORT, async (_, { taskId, exportPath }) => {
    try {
      return taskManager.exportTaskReport(taskId, exportPath);
    } catch (error) {
      logger.error('Error exporting logs:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CLEAR, async () => {
    try {
      logger.clearLogs();
      return true;
    } catch (error) {
      logger.error('Error clearing logs:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, async (_, options) => {
    try {
      return taskManager.getHistory(options);
    } catch (error) {
      logger.error('Error getting history:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_CLEAR, async () => {
    try {
      taskManager.clearHistory();
      return true;
    } catch (error) {
      logger.error('Error clearing history:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FIRMWARE_VERIFY, async (_, filePath) => {
    try {
      const firmware = await firmwareParser.parse(filePath);
      return {
        valid: firmware.integrityCheck?.valid ?? true,
        hashes: firmware.hashes,
        crc32: firmware.crc32,
        integrityCheck: firmware.integrityCheck
      };
    } catch (error) {
      logger.error('Error verifying firmware:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.FIRMWARE_CALCULATE_HASH, async (_, { filePath, algorithm }) => {
    try {
      return firmwareParser.verifier.calculateHash(filePath, algorithm);
    } catch (error) {
      logger.error('Error calculating hash:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.PERFORMANCE_GET_METRICS, async () => {
    try {
      return taskManager.getPerformanceMetrics();
    } catch (error) {
      logger.error('Error getting performance metrics:', error);
      throw error;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MEMORY_GET_STATS, async () => {
    try {
      return memoryManager.getMemoryStats();
    } catch (error) {
      logger.error('Error getting memory stats:', error);
      throw error;
    }
  });

  ipcMain.on(IPC_CHANNELS.APP_MINIMIZE, () => {
    minimizeWindow();
  });

  ipcMain.on(IPC_CHANNELS.APP_MAXIMIZE, () => {
    toggleMaximize();
  });

  ipcMain.on(IPC_CHANNELS.APP_CLOSE, () => {
    closeWindow();
  });

  setupModuleEventForwarding();

  logger.info('IPC handlers setup complete');
}

function setupModuleEventForwarding() {
  deviceMonitor.onDeviceAdded((device) => {
    sendToRenderer(IPC_CHANNELS.DEVICE_CHANGED, { type: 'added', device });
  });

  deviceMonitor.onDeviceRemoved((device) => {
    sendToRenderer(IPC_CHANNELS.DEVICE_CHANGED, { type: 'removed', device });
  });

  deviceMonitor.onDeviceChanged((device) => {
    sendToRenderer(IPC_CHANNELS.DEVICE_CHANGED, { type: 'changed', device });
  });

  deviceMonitor.onDevicesUpdated((devices) => {
    sendToRenderer(IPC_CHANNELS.DEVICES_UPDATED, devices);
  });

  taskManager.on('task:progress', (progress) => {
    sendToRenderer(IPC_CHANNELS.TASK_PROGRESS, progress);
  });

  taskManager.on('task:complete', (result) => {
    sendToRenderer(IPC_CHANNELS.TASK_COMPLETE, result);
  });

  taskManager.on('checkpoints:loaded', (data) => {
    sendToRenderer(IPC_CHANNELS.CHECKPOINTS_LOADED, data);
  });

  taskManager.on('checkpoint:discarded', (data) => {
    sendToRenderer(IPC_CHANNELS.CHECKPOINT_DISCARDED, data);
  });
}

module.exports = {
  setupIpcHandlers,
  IPC_CHANNELS
};
