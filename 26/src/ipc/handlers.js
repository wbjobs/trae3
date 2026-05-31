const { ipcMain } = require('electron');
const fs = require('fs');
const serialManager = require('../modules/serial');
const parser = require('../modules/parser');
const batchManager = require('../modules/batchTask');
const deviceDetector = require('../modules/deviceDetector');
const stateManager = require('../modules/stateManager');
const logger = require('../modules/logger');
const platform = require('../platform');
const cryptoManager = require('../modules/crypto');
const { ObjectPool, BufferPool, bufferPool, taskPool } = require('../modules/objectPool');

function setupIpcHandlers() {
  ipcMain.handle('serial:listPorts', async () => {
    try {
      const ports = await serialManager.listPorts();
      return { success: true, data: ports };
    } catch (error) {
      logger.error('获取串口列表失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('serial:connect', async (event, portPath, options) => {
    try {
      await serialManager.connect(portPath, options);
      logger.info(`串口连接成功: ${portPath}`);
      return { success: true, data: serialManager.getPortInfo() };
    } catch (error) {
      logger.error('串口连接失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('serial:disconnect', async () => {
    try {
      await serialManager.disconnect();
      logger.info('串口已断开');
      return { success: true };
    } catch (error) {
      logger.error('串口断开失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('serial:getPortInfo', () => {
    return { success: true, data: serialManager.getPortInfo() };
  });

  ipcMain.handle('serial:isOpen', () => {
    return { success: true, data: serialManager.isOpen() };
  });

  ipcMain.handle('serial:exportConfig', async (event, filePath, config) => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
      logger.info('配置导出成功', { filePath });
      return { success: true };
    } catch (error) {
      logger.error('配置导出失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('param:getConfig', () => {
    return { success: true, data: parser.getParamList() };
  });

  ipcMain.handle('param:validate', (event, key, value) => {
    const result = parser.validateParam(key, value);
    return { success: result.valid, error: result.error };
  });

  ipcMain.handle('param:validateAll', (event, params) => {
    const result = parser.validateAllParams(params);
    return { success: result.valid, errors: result.errors };
  });

  ipcMain.handle('device:readParam', async (event, deviceId, paramKey) => {
    try {
      const command = parser.buildReadCommand(deviceId, paramKey);
      const response = await serialManager.sendAndReceive(command, 3000);
      const result = parser.parseReadResponse(response);

      if (result.valid) {
        logger.operation('READ_PARAM', deviceId, { paramKey, value: result.value });
        return { success: true, data: result };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error(`读取参数失败 ${paramKey}`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:writeParam', async (event, deviceId, paramKey, value) => {
    try {
      const validation = parser.validateParam(paramKey, value);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const command = parser.buildWriteCommand(deviceId, paramKey, value);
      const response = await serialManager.sendAndReceive(command, 3000);
      const result = parser.parseWriteResponse(response);

      if (result.valid && result.success) {
        logger.operation('WRITE_PARAM', deviceId, { paramKey, value });
        return { success: true, data: result };
      } else {
        return { success: false, error: result.error || result.message };
      }
    } catch (error) {
      logger.error(`写入参数失败 ${paramKey}`, error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:readAllParams', async (event, deviceId) => {
    try {
      const command = parser.buildReadAllCommand(deviceId);
      const response = await serialManager.sendAndReceive(command, 5000);
      const result = parser.parseReadAllResponse(response);

      if (result.valid) {
        logger.operation('READ_ALL_PARAMS', deviceId, { count: Object.keys(result.params).length });
        return { success: true, data: result };
      } else {
        return { success: false, error: result.error };
      }
    } catch (error) {
      logger.error('读取全部参数失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:writeAllParams', async (event, deviceId, params) => {
    try {
      const validation = parser.validateAllParams(params);
      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      const command = parser.buildWriteAllCommand(deviceId, params);
      const response = await serialManager.sendAndReceive(command, 5000);
      const result = parser.parseWriteResponse(response);

      if (result.valid && result.success) {
        logger.operation('WRITE_ALL_PARAMS', deviceId, { count: Object.keys(params).length });
        return { success: true, data: result };
      } else {
        return { success: false, error: result.error || result.message };
      }
    } catch (error) {
      logger.error('写入全部参数失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:checkStatus', async (event, portPath, deviceId) => {
    try {
      const result = await deviceDetector.checkDeviceStatus(portPath, deviceId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:scanPorts', async () => {
    try {
      const ports = await deviceDetector.scanPorts();
      return { success: true, data: ports };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:scanDevices', async (event, portPath, startId, endId, options) => {
    try {
      const devices = await deviceDetector.scanDevices(portPath, startId, endId, options);
      return { success: true, data: devices };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:getAllDevices', () => {
    return { success: true, data: deviceDetector.getAllDevices() };
  });

  ipcMain.handle('device:getOnlineDevices', () => {
    return { success: true, data: deviceDetector.getOnlineDevices() };
  });

  ipcMain.handle('device:addDevice', (event, portPath, deviceId, info) => {
    const device = deviceDetector.addDevice(portPath, deviceId, info);
    return { success: true, data: device };
  });

  ipcMain.handle('device:removeDevice', (event, portPath, deviceId) => {
    const result = deviceDetector.removeDevice(portPath, deviceId);
    return { success: true, data: result };
  });

  ipcMain.handle('batch:addReadTasks', (event, deviceIds, paramKeys, options) => {
    const tasks = batchManager.addReadTasks(deviceIds, paramKeys, options);
    return { success: true, data: tasks };
  });

  ipcMain.handle('batch:addWriteTasks', (event, deviceIds, params, options) => {
    const tasks = batchManager.addWriteTasks(deviceIds, params, options);
    return { success: true, data: tasks };
  });

  ipcMain.handle('batch:addBatchTasks', (event, type, deviceIds, params, options) => {
    const tasks = batchManager.addBatchTasks(type, deviceIds, params, options);
    return { success: true, data: tasks };
  });

  ipcMain.handle('batch:removeTask', (event, taskId) => {
    const task = batchManager.removeTask(taskId);
    return { success: true, data: task };
  });

  ipcMain.handle('batch:clearTasks', () => {
    try {
      batchManager.clearTasks();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:start', async () => {
    try {
      const results = await batchManager.start();
      return { success: true, data: results };
    } catch (error) {
      logger.error('批量任务启动失败', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:pause', () => {
    try {
      batchManager.pause();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:resume', () => {
    try {
      batchManager.resume();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:stop', () => {
    batchManager.stop();
    return { success: true };
  });

  ipcMain.handle('batch:getStatus', () => {
    return { success: true, data: batchManager.getStatus() };
  });

  ipcMain.handle('batch:getTasks', () => {
    return { success: true, data: batchManager.getTasks() };
  });

  ipcMain.handle('batch:exportResults', () => {
    return { success: true, data: batchManager.exportResults() };
  });

  ipcMain.handle('batch:setConcurrency', (event, count) => {
    try {
      batchManager.setConcurrency(count);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:checkRecovery', async () => {
    try {
      const recovery = await batchManager.startConfigurationRecovery();
      return { success: true, data: recovery };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:resumeRecovery', async () => {
    try {
      const results = await batchManager.resumeInterruptedConfiguration();
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:discardRecovery', () => {
    try {
      batchManager.discardInterruptedRecovery();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('state:getState', () => {
    try {
      return { success: true, data: stateManager.getState() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('state:reset', () => {
    try {
      stateManager.reset();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('state:getParamValues', () => {
    return { success: true, data: stateManager.getParamValues() };
  });

  ipcMain.handle('state:setParamValues', (event, params) => {
    stateManager.setParamValues(params);
    return { success: true };
  });

  ipcMain.handle('state:getConnectionConfig', () => {
    return { success: true, data: stateManager.getConnectionConfig() };
  });

  ipcMain.handle('state:setConnectionConfig', (event, config) => {
    stateManager.setConnectionConfig(config);
    return { success: true };
  });

  ipcMain.handle('serial:getReconnectStatus', () => {
    return { success: true, data: serialManager.getReconnectStatus() };
  });

  ipcMain.handle('serial:setAutoReconnect', (event, enabled) => {
    serialManager.setAutoReconnect(enabled);
    return { success: true };
  });

  ipcMain.handle('serial:setMaxReconnectAttempts', (event, max) => {
    serialManager.setMaxReconnectAttempts(max);
    return { success: true };
  });

  ipcMain.handle('platform:getInfo', () => {
    return {
      success: true,
      data: {
        name: platform.getPlatformName(),
        isWindows: platform.isWindows,
        isMac: platform.isMac,
        isLinux: platform.isLinux,
        defaultTimeout: platform.getDefaultCommandTimeout(),
        defaultScanTimeout: platform.getDefaultScanTimeout(),
        maxRetries: platform.getMaxRetries()
      }
    };
  });

  ipcMain.handle('device:quickScan', async (event, portPath, deviceIds, options) => {
    try {
      const devices = await deviceDetector.quickScan(portPath, deviceIds, options);
      return { success: true, data: devices };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('device:checkAllStatus', async () => {
    try {
      const results = await deviceDetector.checkAllDevicesStatus();
      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:setStrategy', (event, strategy) => {
    try {
      batchManager.setBatchStrategy(strategy);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:setOptimizedMode', (event, enabled) => {
    try {
      batchManager.setOptimizedMode(enabled);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('batch:getPoolStats', () => {
    return { success: true, data: batchManager.getPoolStats() };
  });

  ipcMain.handle('batch:resetStats', () => {
    batchManager.resetStats();
    return { success: true };
  });

  ipcMain.handle('crypto:encrypt', (event, data) => {
    try {
      const encrypted = cryptoManager.encryptWithCRC(data);
      return { success: true, data: encrypted.toString('base64') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('crypto:decrypt', (event, base64Data) => {
    try {
      const encrypted = Buffer.from(base64Data, 'base64');
      const result = cryptoManager.decryptWithCRC(encrypted);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('crypto:generateChecksum', (event, ...args) => {
    try {
      const checksum = cryptoManager.generateChecksum(...args);
      return { success: true, data: checksum };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('crypto:verifyChecksum', (event, expected, ...args) => {
    try {
      const valid = cryptoManager.verifyChecksum(expected, ...args);
      return { success: true, data: valid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('crypto:getAlgorithmInfo', () => {
    return { success: true, data: cryptoManager.getAlgorithmInfo() };
  });

  ipcMain.handle('crypto:signFrame', (event, frameBuffer) => {
    try {
      const signed = cryptoManager.signFrame(Buffer.from(frameBuffer));
      return { success: true, data: Array.from(signed) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('crypto:verifyFrame', (event, signedBuffer) => {
    try {
      const result = cryptoManager.verifyFrame(Buffer.from(signedBuffer));
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('pool:getTaskPoolStats', () => {
    return { success: true, data: taskPool.getStats() };
  });

  ipcMain.handle('pool:getBufferPoolStats', () => {
    return { success: true, data: bufferPool.getStats() };
  });

  ipcMain.handle('logger:info', (event, message, meta) => {
    logger.info(message, meta);
    return { success: true };
  });

  ipcMain.handle('logger:error', (event, message, error) => {
    logger.error(message, error);
    return { success: true };
  });

  ipcMain.handle('logger:getLogFiles', () => {
    return { success: true, data: logger.getLogFiles() };
  });

  ipcMain.handle('logger:readLogFile', (event, filename) => {
    return { success: true, data: logger.readLogFile(filename) };
  });

  batchManager.on('task-start', (task) => {
    sendToAllWindows('batch:task-start', task);
  });

  batchManager.on('task-complete', (task) => {
    sendToAllWindows('batch:task-complete', task);
  });

  batchManager.on('task-failed', (task, error) => {
    sendToAllWindows('batch:task-failed', { task, error: error.message });
  });

  batchManager.on('batch-progress', (progress) => {
    sendToAllWindows('batch:progress', progress);
  });

  batchManager.on('batch-start', (info) => {
    sendToAllWindows('batch:start', info);
  });

  batchManager.on('batch-complete', (results) => {
    sendToAllWindows('batch:complete', results);
  });

  deviceDetector.on('scan-progress', (progress) => {
    sendToAllWindows('device:scan-progress', progress);
  });

  deviceDetector.on('device-status', (device) => {
    sendToAllWindows('device:status', device);
  });

  serialManager.on('connected', (portPath) => {
    sendToAllWindows('serial:connected', portPath);
  });

  serialManager.on('disconnected', () => {
    sendToAllWindows('serial:disconnected');
  });

  serialManager.on('error', (error) => {
    sendToAllWindows('serial:error', error.message);
  });

  serialManager.on('data', (data) => {
    sendToAllWindows('serial:data', data.toString('hex'));
  });

  serialManager.on('reconnect-scheduled', (info) => {
    sendToAllWindows('serial:reconnect-scheduled', info);
  });

  serialManager.on('reconnected', (info) => {
    sendToAllWindows('serial:reconnected', info);
  });

  serialManager.on('reconnect-attempt-failed', (info) => {
    sendToAllWindows('serial:reconnect-attempt-failed', info);
  });

  serialManager.on('reconnect-failed', (info) => {
    sendToAllWindows('serial:reconnect-failed', info);
  });

  serialManager.on('connection-success', (info) => {
    sendToAllWindows('serial:connection-success', info);
  });

  serialManager.on('buffer-overflow', () => {
    sendToAllWindows('serial:buffer-overflow');
  });

  stateManager.on('state-loaded', (state) => {
    sendToAllWindows('state:loaded', state);
  });

  stateManager.on('checkpoint-saved', (checkpoint) => {
    sendToAllWindows('state:checkpoint-saved', checkpoint);
  });

  stateManager.on('configuration-interrupted', (config) => {
    sendToAllWindows('state:configuration-interrupted', config);
  });

  stateManager.on('configuration-completed', (config) => {
    sendToAllWindows('state:configuration-completed', config);
  });

  stateManager.on('recovery-started', (recovery) => {
    sendToAllWindows('state:recovery-started', recovery);
  });

  stateManager.on('recovery-progress', (progress) => {
    sendToAllWindows('state:recovery-progress', progress);
  });

  batchManager.on('recovery-ready', (recovery) => {
    sendToAllWindows('batch:recovery-ready', recovery);
  });
}

let mainWindow = null;

function setMainWindow(win) {
  mainWindow = win;
}

function sendToAllWindows(channel, ...args) {
  const { BrowserWindow } = require('electron');
  const windows = BrowserWindow.getAllWindows();
  windows.forEach(win => {
    if (win.webContents) {
      win.webContents.send(channel, ...args);
    }
  });
}

module.exports = { setupIpcHandlers, setMainWindow };
