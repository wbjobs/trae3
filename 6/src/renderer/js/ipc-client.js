class IpcClient {
  constructor() {
    this.api = window.electronAPI;
    this.channels = window.IPC_CHANNELS;
    this.eventListeners = new Map();
  }

  async getDevices() {
    return this.api.getDevices();
  }

  async refreshDevices() {
    return this.api.refreshDevices();
  }

  onDeviceChanged(callback) {
    this.api.onDeviceChanged(callback);
  }

  onDevicesUpdated(callback) {
    this.api.onDevicesUpdated(callback);
  }

  async loadFirmware(filePath) {
    return this.api.loadFirmware(filePath);
  }

  async createTask(config) {
    return this.api.createTask(config);
  }

  async startTasks(taskIds, concurrency) {
    return this.api.startTasks(taskIds, concurrency);
  }

  async cancelTask(taskId) {
    return this.api.cancelTask(taskId);
  }

  async cancelAllTasks() {
    return this.api.cancelAllTasks();
  }

  async getTasks() {
    return this.api.getTasks();
  }

  async clearCompletedTasks() {
    return this.api.clearCompletedTasks();
  }

  async getResumableTasks() {
    return this.api.getResumableTasks();
  }

  async resumeTask(taskId) {
    return this.api.resumeTask(taskId);
  }

  async resumeBatch(taskIds, concurrency) {
    return this.api.resumeBatch(taskIds, concurrency);
  }

  async discardCheckpoint(taskId) {
    return this.api.discardCheckpoint(taskId);
  }

  async discardAllCheckpoints() {
    return this.api.discardAllCheckpoints();
  }

  onTaskProgress(callback) {
    this.api.onTaskProgress(callback);
  }

  onTaskComplete(callback) {
    this.api.onTaskComplete(callback);
  }

  onCheckpointsLoaded(callback) {
    this.api.onCheckpointsLoaded(callback);
  }

  onCheckpointDiscarded(callback) {
    this.api.onCheckpointDiscarded(callback);
  }

  async queryLogs(options) {
    return this.api.queryLogs(options);
  }

  async exportLogs(taskId, exportPath) {
    return this.api.exportLogs(taskId, exportPath);
  }

  async clearLogs() {
    return this.api.clearLogs();
  }

  async getHistory(options) {
    return this.api.getHistory(options);
  }

  async clearHistory() {
    return this.api.clearHistory();
  }

  minimizeApp() {
    this.api.minimizeApp();
  }

  toggleMaximize() {
    this.api.toggleMaximize();
  }

  closeApp() {
    this.api.closeApp();
  }

  onWindowStateChanged(callback) {
    this.api.onWindowStateChanged(callback);
  }

  removeAllListeners(channel) {
    this.api.removeAllListeners(channel);
  }
}

const ipcClient = new IpcClient();
