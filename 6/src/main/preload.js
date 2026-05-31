const { contextBridge, ipcRenderer } = require('electron');

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

  LOG_QUERY: 'log:query',
  LOG_EXPORT: 'log:export',
  LOG_CLEAR: 'log:clear',

  HISTORY_GET: 'history:get',
  HISTORY_CLEAR: 'history:clear',

  APP_MINIMIZE: 'app:minimize',
  APP_MAXIMIZE: 'app:maximize',
  APP_CLOSE: 'app:close',
  WINDOW_STATE_CHANGED: 'window:state-changed'
};

contextBridge.exposeInMainWorld('electronAPI', {
  getDevices: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_LIST),
  refreshDevices: () => ipcRenderer.invoke(IPC_CHANNELS.DEVICE_REFRESH),
  onDeviceChanged: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.DEVICE_CHANGED, (_, data) => callback(data));
  },
  onDevicesUpdated: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.DEVICES_UPDATED, (_, data) => callback(data));
  },

  loadFirmware: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_LOAD, filePath),

  createTask: (config) => ipcRenderer.invoke(IPC_CHANNELS.TASK_CREATE, config),
  startTasks: (taskIds, concurrency) => ipcRenderer.invoke(IPC_CHANNELS.TASK_START, { taskIds, concurrency }),
  cancelTask: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.TASK_CANCEL, taskId),
  cancelAllTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_CANCEL_ALL),
  getTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST),
  clearCompletedTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_CLEAR_COMPLETED),
  getResumableTasks: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_RESUMABLE_LIST),
  resumeTask: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.TASK_RESUME, taskId),
  resumeBatch: (taskIds, concurrency) => ipcRenderer.invoke(IPC_CHANNELS.TASK_RESUME_BATCH, { taskIds, concurrency }),
  discardCheckpoint: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.TASK_DISCARD_CHECKPOINT, taskId),
  discardAllCheckpoints: () => ipcRenderer.invoke(IPC_CHANNELS.TASK_DISCARD_ALL_CHECKPOINTS),
  onTaskProgress: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, (_, data) => callback(data));
  },
  onTaskComplete: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.TASK_COMPLETE, (_, data) => callback(data));
  },
  onCheckpointsLoaded: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.CHECKPOINTS_LOADED, (_, data) => callback(data));
  },
  onCheckpointDiscarded: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.CHECKPOINT_DISCARDED, (_, data) => callback(data));
  },

  queryLogs: (options) => ipcRenderer.invoke(IPC_CHANNELS.LOG_QUERY, options),
  exportLogs: (taskId, exportPath) => ipcRenderer.invoke(IPC_CHANNELS.LOG_EXPORT, { taskId, exportPath }),
  clearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.LOG_CLEAR),

  getHistory: (options) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, options),
  clearHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CLEAR),

  minimizeApp: () => ipcRenderer.send(IPC_CHANNELS.APP_MINIMIZE),
  toggleMaximize: () => ipcRenderer.send(IPC_CHANNELS.APP_MAXIMIZE),
  closeApp: () => ipcRenderer.send(IPC_CHANNELS.APP_CLOSE),
  onWindowStateChanged: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE_CHANGED, (_, data) => callback(data));
  },

  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

contextBridge.exposeInMainWorld('IPC_CHANNELS', IPC_CHANNELS);
