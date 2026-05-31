const EventEmitter = require('events');
const logger = require('./logger');
const platform = require('../platform');
const WindowsSerialPort = require('../platform/windows-serial');
const MacSerialPort = require('../platform/mac-serial');

class SerialManager extends EventEmitter {
  constructor() {
    super();
    this.platform = platform.getPlatformName();
    this.impl = this.createImplementation();
    this.lastConfig = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.shouldAutoReconnect = true;

    this.forwardEvents();
  }

  createImplementation() {
    if (platform.isWindows) {
      logger.info(`SerialManager: Using Windows implementation`);
      return new WindowsSerialPort();
    } else if (platform.isMac) {
      logger.info(`SerialManager: Using macOS implementation`);
      return new MacSerialPort();
    } else {
      logger.info(`SerialManager: Using Linux implementation (fallback)`);
      return new MacSerialPort();
    }
  }

  forwardEvents() {
    const events = ['connected', 'disconnected', 'error', 'data', 
                    'buffer-overflow', 'reconnect-needed'];
    
    events.forEach(event => {
      this.impl.on(event, (...args) => {
        this.emit(event, ...args);
      });
    });

    this.impl.on('disconnected', (error) => {
      if (this.shouldAutoReconnect && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });

    this.impl.on('reconnect-needed', (error) => {
      logger.warn(`SerialManager: Reconnection requested due to: ${error?.message}`);
      if (this.shouldAutoReconnect && !this.isReconnecting) {
        this.scheduleReconnect();
      }
    });
  }

  async listPorts() {
    try {
      const ports = await this.impl.listPorts();
      logger.debug(`SerialManager: Found ${ports.length} ports`);
      return ports;
    } catch (error) {
      logger.error('SerialManager: Failed to list serial ports', error);
      throw error;
    }
  }

  async connect(portPath, options = {}) {
    try {
      this.cancelReconnect();

      const normalizedPath = platform.normalizePortPath(portPath);
      
      if (!platform.isPortPathValid(normalizedPath)) {
        throw new Error(`Invalid serial port path: ${portPath}`);
      }

      this.lastConfig = { portPath: normalizedPath, options };
      this.reconnectAttempts = 0;

      const result = await this.impl.connect(normalizedPath, options);
      
      this.emit('connection-success', { portPath: normalizedPath, options });
      
      return result;
    } catch (error) {
      logger.error('SerialManager: Connection failed', error);
      
      if (platform.shouldRetryOnError(error) && this.reconnectAttempts < platform.getMaxRetries()) {
        this.reconnectAttempts++;
        logger.info(`SerialManager: Retry connection (attempt ${this.reconnectAttempts}/${platform.getMaxRetries()})`);
        await new Promise(resolve => setTimeout(resolve, 500));
        return this.connect(portPath, options);
      }

      this.reconnectAttempts = 0;
      throw error;
    }
  }

  async scheduleReconnect() {
    if (!this.lastConfig) {
      logger.warn('SerialManager: No last config, cannot reconnect');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('SerialManager: Max reconnection attempts reached');
      this.emit('reconnect-failed', { attempts: this.reconnectAttempts });
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5);
    
    logger.info(`SerialManager: Scheduling reconnection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    this.emit('reconnect-scheduled', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        logger.info(`SerialManager: Attempting reconnection to ${this.lastConfig.portPath}`);
        await this.impl.connect(this.lastConfig.portPath, this.lastConfig.options);
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.emit('reconnected', { portPath: this.lastConfig.portPath });
        logger.info(`SerialManager: Reconnected successfully to ${this.lastConfig.portPath}`);
      } catch (error) {
        logger.warn(`SerialManager: Reconnection attempt ${this.reconnectAttempts} failed`, error);
        this.isReconnecting = false;
        this.emit('reconnect-attempt-failed', { attempt: this.reconnectAttempts, error: error.message });
        this.scheduleReconnect();
      }
    }, delay);
  }

  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  async disconnect() {
    this.cancelReconnect();
    this.shouldAutoReconnect = false;
    this.reconnectAttempts = 0;
    this.lastConfig = null;
    return this.impl.disconnect();
  }

  async write(data) {
    if (!this.isOpen()) {
      throw new Error('Serial port not connected');
    }
    return this.impl.write(data);
  }

  async sendAndReceive(data, timeout = null) {
    if (!this.isOpen()) {
      throw new Error('Serial port not connected');
    }

    const actualTimeout = timeout || platform.getDefaultCommandTimeout();
    
    let retries = 0;
    const maxRetries = platform.getMaxRetries();

    while (retries < maxRetries) {
      try {
        return await this.impl.sendAndReceive(data, actualTimeout);
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          logger.error(`SerialManager: sendAndReceive failed after ${maxRetries} retries`, error);
          throw error;
        }
        logger.warn(`SerialManager: sendAndReceive retry ${retries}/${maxRetries}: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  readBuffer() {
    return this.impl.readBuffer();
  }

  clearBuffer() {
    return this.impl.clearBuffer();
  }

  isOpen() {
    return this.impl.isOpen();
  }

  getPortInfo() {
    return this.impl.getPortInfo();
  }

  setAutoReconnect(enabled) {
    this.shouldAutoReconnect = enabled;
    if (!enabled) {
      this.cancelReconnect();
    }
  }

  setMaxReconnectAttempts(max) {
    this.maxReconnectAttempts = Math.max(0, max);
  }

  getReconnectStatus() {
    return {
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      shouldAutoReconnect: this.shouldAutoReconnect,
      lastConfig: this.lastConfig
    };
  }

  setCommandTimeout(timeout) {
    this.impl.setCommandTimeout(timeout);
  }

  getPlatform() {
    return this.platform;
  }
}

module.exports = new SerialManager();
module.exports.SerialManager = SerialManager;
