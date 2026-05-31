const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  serial: {
    listPorts: () => ipcRenderer.invoke('serial:listPorts'),
    connect: (portPath, options) => ipcRenderer.invoke('serial:connect', portPath, options),
    disconnect: () => ipcRenderer.invoke('serial:disconnect'),
    getPortInfo: () => ipcRenderer.invoke('serial:getPortInfo'),
    isOpen: () => ipcRenderer.invoke('serial:isOpen'),
    exportConfig: (filePath, config) => ipcRenderer.invoke('serial:exportConfig', filePath, config),
    getReconnectStatus: () => ipcRenderer.invoke('serial:getReconnectStatus'),
    setAutoReconnect: (enabled) => ipcRenderer.invoke('serial:setAutoReconnect', enabled),
    setMaxReconnectAttempts: (max) => ipcRenderer.invoke('serial:setMaxReconnectAttempts', max),
    onConnected: (callback) => ipcRenderer.on('serial:connected', (_e, ...args) => callback(...args)),
    onDisconnected: (callback) => ipcRenderer.on('serial:disconnected', (_e) => callback()),
    onError: (callback) => ipcRenderer.on('serial:error', (_e, ...args) => callback(...args)),
    onData: (callback) => ipcRenderer.on('serial:data', (_e, ...args) => callback(...args)),
    onReconnectScheduled: (callback) => ipcRenderer.on('serial:reconnect-scheduled', (_e, ...args) => callback(...args)),
    onReconnected: (callback) => ipcRenderer.on('serial:reconnected', (_e, ...args) => callback(...args)),
    onReconnectAttemptFailed: (callback) => ipcRenderer.on('serial:reconnect-attempt-failed', (_e, ...args) => callback(...args)),
    onReconnectFailed: (callback) => ipcRenderer.on('serial:reconnect-failed', (_e, ...args) => callback(...args)),
    onConnectionSuccess: (callback) => ipcRenderer.on('serial:connection-success', (_e, ...args) => callback(...args)),
    onBufferOverflow: (callback) => ipcRenderer.on('serial:buffer-overflow', (_e) => callback()),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('serial:connected');
      ipcRenderer.removeAllListeners('serial:disconnected');
      ipcRenderer.removeAllListeners('serial:error');
      ipcRenderer.removeAllListeners('serial:data');
      ipcRenderer.removeAllListeners('serial:reconnect-scheduled');
      ipcRenderer.removeAllListeners('serial:reconnected');
      ipcRenderer.removeAllListeners('serial:reconnect-attempt-failed');
      ipcRenderer.removeAllListeners('serial:reconnect-failed');
      ipcRenderer.removeAllListeners('serial:connection-success');
      ipcRenderer.removeAllListeners('serial:buffer-overflow');
    }
  },

  param: {
    getConfig: () => ipcRenderer.invoke('param:getConfig'),
    validate: (key, value) => ipcRenderer.invoke('param:validate', key, value),
    validateAll: (params) => ipcRenderer.invoke('param:validateAll', params)
  },

  device: {
    readParam: (deviceId, paramKey) => ipcRenderer.invoke('device:readParam', deviceId, paramKey),
    writeParam: (deviceId, paramKey, value) => ipcRenderer.invoke('device:writeParam', deviceId, paramKey, value),
    readAllParams: (deviceId) => ipcRenderer.invoke('device:readAllParams', deviceId),
    writeAllParams: (deviceId, params) => ipcRenderer.invoke('device:writeAllParams', deviceId, params),
    checkStatus: (portPath, deviceId) => ipcRenderer.invoke('device:checkStatus', portPath, deviceId),
    checkAllStatus: () => ipcRenderer.invoke('device:checkAllStatus'),
    scanPorts: () => ipcRenderer.invoke('device:scanPorts'),
    scanDevices: (portPath, startId, endId, options) =>
      ipcRenderer.invoke('device:scanDevices', portPath, startId, endId, options),
    quickScan: (portPath, deviceIds, options) =>
      ipcRenderer.invoke('device:quickScan', portPath, deviceIds, options),
    getAllDevices: () => ipcRenderer.invoke('device:getAllDevices'),
    getOnlineDevices: () => ipcRenderer.invoke('device:getOnlineDevices'),
    addDevice: (portPath, deviceId, info) => ipcRenderer.invoke('device:addDevice', portPath, deviceId, info),
    removeDevice: (portPath, deviceId) => ipcRenderer.invoke('device:removeDevice', portPath, deviceId),
    onScanProgress: (callback) => ipcRenderer.on('device:scan-progress', (_e, ...args) => callback(...args)),
    onDeviceStatus: (callback) => ipcRenderer.on('device:status', (_e, ...args) => callback(...args)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('device:scan-progress');
      ipcRenderer.removeAllListeners('device:status');
    }
  },

  batch: {
    addReadTasks: (deviceIds, paramKeys, options) =>
      ipcRenderer.invoke('batch:addReadTasks', deviceIds, paramKeys, options),
    addWriteTasks: (deviceIds, params, options) =>
      ipcRenderer.invoke('batch:addWriteTasks', deviceIds, params, options),
    addBatchTasks: (type, deviceIds, params, options) =>
      ipcRenderer.invoke('batch:addBatchTasks', type, deviceIds, params, options),
    removeTask: (taskId) => ipcRenderer.invoke('batch:removeTask', taskId),
    clearTasks: () => ipcRenderer.invoke('batch:clearTasks'),
    start: () => ipcRenderer.invoke('batch:start'),
    pause: () => ipcRenderer.invoke('batch:pause'),
    resume: () => ipcRenderer.invoke('batch:resume'),
    stop: () => ipcRenderer.invoke('batch:stop'),
    checkRecovery: () => ipcRenderer.invoke('batch:checkRecovery'),
    resumeRecovery: () => ipcRenderer.invoke('batch:resumeRecovery'),
    discardRecovery: () => ipcRenderer.invoke('batch:discardRecovery'),
    getStatus: () => ipcRenderer.invoke('batch:getStatus'),
    getTasks: () => ipcRenderer.invoke('batch:getTasks'),
    exportResults: () => ipcRenderer.invoke('batch:exportResults'),
    setConcurrency: (count) => ipcRenderer.invoke('batch:setConcurrency', count),
    setStrategy: (strategy) => ipcRenderer.invoke('batch:setStrategy', strategy),
    setOptimizedMode: (enabled) => ipcRenderer.invoke('batch:setOptimizedMode', enabled),
    getPoolStats: () => ipcRenderer.invoke('batch:getPoolStats'),
    resetStats: () => ipcRenderer.invoke('batch:resetStats'),
    onTaskStart: (callback) => ipcRenderer.on('batch:task-start', (_e, ...args) => callback(...args)),
    onTaskComplete: (callback) => ipcRenderer.on('batch:task-complete', (_e, ...args) => callback(...args)),
    onTaskFailed: (callback) => ipcRenderer.on('batch:task-failed', (_e, ...args) => callback(...args)),
    onProgress: (callback) => ipcRenderer.on('batch:progress', (_e, ...args) => callback(...args)),
    onStart: (callback) => ipcRenderer.on('batch:start', (_e, ...args) => callback(...args)),
    onComplete: (callback) => ipcRenderer.on('batch:complete', (_e, ...args) => callback(...args)),
    onRecoveryReady: (callback) => ipcRenderer.on('batch:recovery-ready', (_e, ...args) => callback(...args)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('batch:task-start');
      ipcRenderer.removeAllListeners('batch:task-complete');
      ipcRenderer.removeAllListeners('batch:task-failed');
      ipcRenderer.removeAllListeners('batch:progress');
      ipcRenderer.removeAllListeners('batch:start');
      ipcRenderer.removeAllListeners('batch:complete');
      ipcRenderer.removeAllListeners('batch:recovery-ready');
    }
  },

  crypto: {
    encrypt: (data) => ipcRenderer.invoke('crypto:encrypt', data),
    decrypt: (base64Data) => ipcRenderer.invoke('crypto:decrypt', base64Data),
    generateChecksum: (...args) => ipcRenderer.invoke('crypto:generateChecksum', ...args),
    verifyChecksum: (expected, ...args) => ipcRenderer.invoke('crypto:verifyChecksum', expected, ...args),
    getAlgorithmInfo: () => ipcRenderer.invoke('crypto:getAlgorithmInfo'),
    signFrame: (frameBuffer) => ipcRenderer.invoke('crypto:signFrame', frameBuffer),
    verifyFrame: (signedBuffer) => ipcRenderer.invoke('crypto:verifyFrame', signedBuffer)
  },

  pool: {
    getTaskPoolStats: () => ipcRenderer.invoke('pool:getTaskPoolStats'),
    getBufferPoolStats: () => ipcRenderer.invoke('pool:getBufferPoolStats')
  },

  state: {
    getState: () => ipcRenderer.invoke('state:getState'),
    reset: () => ipcRenderer.invoke('state:reset'),
    getParamValues: () => ipcRenderer.invoke('state:getParamValues'),
    setParamValues: (params) => ipcRenderer.invoke('state:setParamValues', params),
    getConnectionConfig: () => ipcRenderer.invoke('state:getConnectionConfig'),
    setConnectionConfig: (config) => ipcRenderer.invoke('state:setConnectionConfig', config),
    onLoaded: (callback) => ipcRenderer.on('state:loaded', (_e, ...args) => callback(...args)),
    onCheckpointSaved: (callback) => ipcRenderer.on('state:checkpoint-saved', (_e, ...args) => callback(...args)),
    onConfigurationInterrupted: (callback) => ipcRenderer.on('state:configuration-interrupted', (_e, ...args) => callback(...args)),
    onConfigurationCompleted: (callback) => ipcRenderer.on('state:configuration-completed', (_e, ...args) => callback(...args)),
    onRecoveryStarted: (callback) => ipcRenderer.on('state:recovery-started', (_e, ...args) => callback(...args)),
    onRecoveryProgress: (callback) => ipcRenderer.on('state:recovery-progress', (_e, ...args) => callback(...args)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('state:loaded');
      ipcRenderer.removeAllListeners('state:checkpoint-saved');
      ipcRenderer.removeAllListeners('state:configuration-interrupted');
      ipcRenderer.removeAllListeners('state:configuration-completed');
      ipcRenderer.removeAllListeners('state:recovery-started');
      ipcRenderer.removeAllListeners('state:recovery-progress');
    }
  },

  platform: {
    getInfo: () => ipcRenderer.invoke('platform:getInfo')
  },

  logger: {
    info: (message, meta) => ipcRenderer.invoke('logger:info', message, meta),
    error: (message, error) => ipcRenderer.invoke('logger:error', message, error),
    getLogFiles: () => ipcRenderer.invoke('logger:getLogFiles'),
    readLogFile: (filename) => ipcRenderer.invoke('logger:readLogFile', filename)
  },

  config: {
    onImported: (callback) => ipcRenderer.on('config:imported', (_e, ...args) => callback(...args)),
    onExportRequest: (callback) => ipcRenderer.on('config:export-request', (_e, ...args) => callback(...args)),
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('config:imported');
      ipcRenderer.removeAllListeners('config:export-request');
    }
  }
});
