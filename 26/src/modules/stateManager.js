const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const platform = require('../platform');

const STATE_FILENAME = 'app-state.json';
const CHECKPOINT_FILENAME = 'checkpoint.json';
const MAX_CHECKPOINTS = 10;

class StateManager extends EventEmitter {
  constructor() {
    super();
    this.stateDir = null;
    this.currentState = this.getDefaultState();
    this.checkpoints = [];
    this.isRestoring = false;
    this.autoSaveInterval = null;
    this.autoSaveEnabled = true;
    this.autoSaveDelay = 10000;
  }

  getDefaultState() {
    return {
      version: '1.0.0',
      lastSaved: null,
      connection: {
        portPath: null,
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        lastConnected: null,
        wasConnected: false
      },
      devices: [],
      selectedDeviceIds: [],
      params: {},
      batchTasks: [],
      lastBatchResults: null,
      ui: {
        activeTab: 'device',
        lastDeviceId: 1,
        theme: 'default'
      },
      configurationInProgress: null,
      pendingOperations: []
    };
  }

  init(appName = 'inspection-instrument-config') {
    if (this.stateDir) return;

    this.stateDir = platform.getConfigDirectory(appName);
    
    if (!fs.existsSync(this.stateDir)) {
      try {
        fs.mkdirSync(this.stateDir, { recursive: true });
      } catch (error) {
        logger.error('StateManager: Failed to create state directory', error);
        this.stateDir = null;
        return;
      }
    }

    this.loadState();
    this.loadCheckpoints();
    this.startAutoSave();

    logger.info(`StateManager: Initialized with state directory: ${this.stateDir}`);
  }

  getStateFilePath() {
    return this.stateDir ? path.join(this.stateDir, STATE_FILENAME) : null;
  }

  getCheckpointDir() {
    return this.stateDir ? path.join(this.stateDir, 'checkpoints') : null;
  }

  loadState() {
    const filePath = this.getStateFilePath();
    if (!filePath || !fs.existsSync(filePath)) {
      logger.info('StateManager: No existing state file found');
      return false;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const savedState = JSON.parse(content);
      
      this.currentState = {
        ...this.getDefaultState(),
        ...savedState,
        configurationInProgress: null
      };

      logger.info('StateManager: State loaded successfully');
      this.emit('state-loaded', this.currentState);
      return true;
    } catch (error) {
      logger.error('StateManager: Failed to load state', error);
      this.backupCorruptedState(filePath);
      return false;
    }
  }

  backupCorruptedState(filePath) {
    try {
      const backupPath = filePath + '.corrupted.' + Date.now();
      fs.copyFileSync(filePath, backupPath);
      logger.warn(`StateManager: Corrupted state backed up to ${backupPath}`);
    } catch (e) {
      logger.error('StateManager: Failed to backup corrupted state', e);
    }
  }

  saveState(immediate = false) {
    if (!this.stateDir) return false;

    this.currentState.lastSaved = new Date().toISOString();

    if (immediate) {
      return this.writeState();
    }

    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.writeState();
    }, 500);

    return true;
  }

  writeState() {
    const filePath = this.getStateFilePath();
    if (!filePath) return false;

    try {
      const tempPath = filePath + '.tmp';
      const content = JSON.stringify(this.currentState, null, 2);
      
      fs.writeFileSync(tempPath, content, 'utf8');
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tempPath, filePath);

      logger.debug('StateManager: State saved');
      this.emit('state-saved', this.currentState);
      return true;
    } catch (error) {
      logger.error('StateManager: Failed to save state', error);
      return false;
    }
  }

  saveCheckpoint(operationType, context = {}) {
    if (!this.stateDir) return null;

    const checkpointDir = this.getCheckpointDir();
    if (!checkpointDir) return null;

    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    const checkpoint = {
      id: `cp_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operationType,
      context,
      state: JSON.parse(JSON.stringify(this.currentState))
    };

    const filePath = path.join(checkpointDir, `${checkpoint.id}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
      
      this.checkpoints.unshift(checkpoint);
      if (this.checkpoints.length > MAX_CHECKPOINTS) {
        const oldCheckpoint = this.checkpoints.pop();
        const oldPath = path.join(checkpointDir, `${oldCheckpoint.id}.json`);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      logger.info(`StateManager: Checkpoint saved: ${operationType}`);
      this.emit('checkpoint-saved', checkpoint);
      return checkpoint;
    } catch (error) {
      logger.error('StateManager: Failed to save checkpoint', error);
      return null;
    }
  }

  loadCheckpoints() {
    const checkpointDir = this.getCheckpointDir();
    if (!checkpointDir || !fs.existsSync(checkpointDir)) {
      this.checkpoints = [];
      return;
    }

    try {
      const files = fs.readdirSync(checkpointDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, MAX_CHECKPOINTS);

      this.checkpoints = files.map(f => {
        try {
          const content = fs.readFileSync(path.join(checkpointDir, f), 'utf8');
          return JSON.parse(content);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);

      logger.info(`StateManager: Loaded ${this.checkpoints.length} checkpoints`);
    } catch (error) {
      logger.error('StateManager: Failed to load checkpoints', error);
      this.checkpoints = [];
    }
  }

  restoreFromCheckpoint(checkpointId) {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this.isRestoring = true;
    try {
      this.currentState = JSON.parse(JSON.stringify(checkpoint.state));
      this.saveState(true);
      logger.info(`StateManager: Restored from checkpoint: ${checkpointId}`);
      this.emit('restored-from-checkpoint', checkpoint);
      return this.currentState;
    } finally {
      this.isRestoring = false;
    }
  }

  getLatestCheckpoint() {
    return this.checkpoints.length > 0 ? this.checkpoints[0] : null;
  }

  startAutoSave() {
    if (this.autoSaveInterval) return;
    
    this.autoSaveInterval = setInterval(() => {
      if (this.autoSaveEnabled && !this.isRestoring) {
        this.saveState();
      }
    }, this.autoSaveDelay);
  }

  stopAutoSave() {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  setConnectionConfig(config) {
    this.currentState.connection = {
      ...this.currentState.connection,
      ...config
    };
    if (config.portPath) {
      this.currentState.connection.lastConnected = new Date().toISOString();
      this.currentState.connection.wasConnected = true;
    }
    this.saveState();
  }

  getConnectionConfig() {
    return { ...this.currentState.connection };
  }

  setDevices(devices) {
    this.currentState.devices = devices.map(d => ({
      portPath: d.portPath,
      deviceId: d.deviceId,
      online: d.online,
      lastSeen: d.lastSeen
    }));
    this.saveState();
  }

  getDevices() {
    return [...this.currentState.devices];
  }

  setParamValues(params) {
    this.currentState.params = { ...this.currentState.params, ...params };
    this.saveState();
  }

  getParamValues() {
    return { ...this.currentState.params };
  }

  setBatchTasks(tasks) {
    this.currentState.batchTasks = tasks.map(t => ({
      id: t.id,
      type: t.type,
      deviceId: t.deviceId,
      params: t.params,
      status: t.status,
      createdAt: t.createdAt
    }));
    this.saveState();
  }

  getBatchTasks() {
    return [...this.currentState.batchTasks];
  }

  startConfiguration(operationType, deviceIds, params = {}) {
    const checkpoint = this.saveCheckpoint(operationType, { deviceIds, params });
    
    this.currentState.configurationInProgress = {
      operationType,
      deviceIds,
      params,
      startedAt: new Date().toISOString(),
      completedDevices: [],
      failedDevices: []
    };
    
    this.saveState(true);
    logger.info(`StateManager: Configuration started: ${operationType} for ${deviceIds.length} devices`);
    
    return checkpoint;
  }

  markDeviceConfigured(deviceId, success = true, result = null) {
    if (!this.currentState.configurationInProgress) return;

    if (success) {
      this.currentState.configurationInProgress.completedDevices.push({
        deviceId,
        result,
        completedAt: new Date().toISOString()
      });
    } else {
      this.currentState.configurationInProgress.failedDevices.push({
        deviceId,
        error: result,
        failedAt: new Date().toISOString()
      });
    }

    this.saveState(true);
  }

  completeConfiguration() {
    if (!this.currentState.configurationInProgress) return null;

    const config = this.currentState.configurationInProgress;
    config.completedAt = new Date().toISOString();
    config.status = 'completed';

    this.emit('configuration-completed', config);
    logger.info(`StateManager: Configuration completed: ${config.operationType}`);

    this.currentState.configurationInProgress = null;
    this.saveState(true);

    return config;
  }

  interruptConfiguration(reason = 'unknown') {
    if (!this.currentState.configurationInProgress) return null;

    const config = this.currentState.configurationInProgress;
    config.interruptedAt = new Date().toISOString();
    config.interruptReason = reason;
    config.status = 'interrupted';

    this.emit('configuration-interrupted', config);
    logger.warn(`StateManager: Configuration interrupted: ${config.operationType}, reason: ${reason}`);

    this.saveState(true);

    return config;
  }

  checkInterruptedConfiguration() {
    if (this.currentState.configurationInProgress && 
        this.currentState.configurationInProgress.status !== 'completed') {
      return this.currentState.configurationInProgress;
    }
    return null;
  }

  async recoverConfiguration(onProgress = null) {
    const interrupted = this.checkInterruptedConfiguration();
    if (!interrupted) {
      return { recovered: false, message: 'No interrupted configuration found' };
    }

    this.isRestoring = true;
    this.emit('recovery-started', interrupted);
    logger.info(`StateManager: Starting recovery for: ${interrupted.operationType}`);

    try {
      const pendingDevices = interrupted.deviceIds.filter(id => 
        !interrupted.completedDevices.some(d => d.deviceId === id) &&
        !interrupted.failedDevices.some(d => d.deviceId === id)
      );

      const recoveryResult = {
        recovered: true,
        operationType: interrupted.operationType,
        alreadyCompleted: interrupted.completedDevices.length,
        previouslyFailed: interrupted.failedDevices.length,
        pendingDevices,
        resumedAt: new Date().toISOString()
      };

      this.emit('recovery-progress', {
        completed: interrupted.completedDevices.length,
        failed: interrupted.failedDevices.length,
        pending: pendingDevices.length
      });

      logger.info(`StateManager: Recovery ready: ${pendingDevices.length} pending devices`);
      return recoveryResult;
    } finally {
      this.isRestoring = false;
    }
  }

  clearInterruptedConfiguration() {
    this.currentState.configurationInProgress = null;
    this.saveState(true);
  }

  setActiveTab(tab) {
    this.currentState.ui.activeTab = tab;
    this.saveState();
  }

  getActiveTab() {
    return this.currentState.ui.activeTab;
  }

  setLastDeviceId(deviceId) {
    this.currentState.ui.lastDeviceId = deviceId;
    this.saveState();
  }

  getLastDeviceId() {
    return this.currentState.ui.lastDeviceId || 1;
  }

  addPendingOperation(operation) {
    const op = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...operation,
      createdAt: new Date().toISOString()
    };
    this.currentState.pendingOperations.push(op);
    this.saveState();
    return op;
  }

  removePendingOperation(operationId) {
    const index = this.currentState.pendingOperations.findIndex(op => op.id === operationId);
    if (index !== -1) {
      this.currentState.pendingOperations.splice(index, 1);
      this.saveState();
      return true;
    }
    return false;
  }

  getPendingOperations() {
    return [...this.currentState.pendingOperations];
  }

  getState() {
    return JSON.parse(JSON.stringify(this.currentState));
  }

  reset() {
    this.currentState = this.getDefaultState();
    this.saveState(true);
    this.emit('state-reset');
    logger.info('StateManager: State reset to default');
  }

  destroy() {
    this.stopAutoSave();
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }
    this.saveState(true);
    logger.info('StateManager: Destroyed');
  }
}

module.exports = new StateManager();
module.exports.StateManager = StateManager;
