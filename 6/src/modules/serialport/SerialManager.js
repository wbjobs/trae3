const { SerialPort } = require('serialport');
const logger = require('../logger');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const PLATFORM_CONFIG = {
  win32: {
    pathPattern: /^COM\d+$/i,
    defaultBaudRate: 115200,
    maxRetries: 3,
    retryDelay: 500
  },
  darwin: {
    pathPattern: /^\/dev\/tty\.(usbserial|usbmodem|cu\.)/i,
    defaultBaudRate: 115200,
    maxRetries: 3,
    retryDelay: 500
  },
  linux: {
    pathPattern: /^\/dev\/tty(USB|ACM|S)/i,
    defaultBaudRate: 115200,
    maxRetries: 3,
    retryDelay: 500
  }
};

class SerialManager {
  constructor() {
    this.connections = new Map();
    this.dataCallbacks = new Map();
    this.errorCallbacks = new Map();
    this.listPortsTimeout = 5000;
    this.connectTimeout = 10000;
    this.platform = process.platform;
    this.config = PLATFORM_CONFIG[this.platform] || PLATFORM_CONFIG.linux;
  }

  async listPorts() {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('listPorts timed out')), this.listPortsTimeout);
    });

    try {
      const ports = await Promise.race([SerialPort.list(), timeoutPromise]);
      
      const filteredPorts = ports.filter(port => {
        if (this.config.pathPattern && !this.config.pathPattern.test(port.path)) {
          return false;
        }
        if (isMac && port.path.includes('/dev/cu.')) {
          return false;
        }
        return true;
      });

      logger.debug(`Found ${filteredPorts.length} valid serial ports (platform: ${this.platform})`);
      return filteredPorts.map(port => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        pnpId: port.pnpId,
        vendorId: port.vendorId,
        productId: port.productId,
        friendlyName: port.friendlyName || null
      }));
    } catch (error) {
      logger.error('Failed to list serial ports:', error);
      if (error.message.includes('timed out')) {
        logger.warn('Serial port list timed out, returning empty list');
        return [];
      }
      throw error;
    }
  }

  async connect(portPath, options = {}) {
    const {
      baudRate = 115200,
      dataBits = 8,
      stopBits = 1,
      parity = 'none',
      flowControl = false,
      autoOpen = false,
      maxRetries = this.config.maxRetries,
      retryDelay = this.config.retryDelay
    } = options;

    const deviceId = this.generateDeviceId(portPath);

    if (this.connections.has(deviceId)) {
      const conn = this.connections.get(deviceId);
      if (conn.isOpen) {
        logger.warn(`Device ${deviceId} already connected, reusing connection`);
        return conn;
      } else {
        logger.warn(`Device ${deviceId} connection stale, reconnecting...`);
        await this.disconnect(deviceId).catch(() => {});
      }
    }

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this._attemptConnect(deviceId, portPath, {
          baudRate, dataBits, stopBits, parity, flowControl, autoOpen
        });
      } catch (error) {
        lastError = error;
        logger.warn(`Connection attempt ${attempt + 1}/${maxRetries} failed for ${portPath}: ${error.message}`);
        if (attempt < maxRetries - 1) {
          await this.delay(retryDelay);
        }
      }
    }

    logger.error(`All ${maxRetries} connection attempts failed for ${portPath}`);
    throw lastError;
  }

  async _attemptConnect(deviceId, portPath, options) {
    const { baudRate, dataBits, stopBits, parity, flowControl, autoOpen } = options;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Connection to ${portPath} timed out after ${this.connectTimeout}ms`));
      }, this.connectTimeout);

      try {
        const port = new SerialPort({
          path: portPath,
          baudRate,
          dataBits,
          stopBits,
          parity,
          rtscts: flowControl,
          autoOpen: false
        });

        const cleanup = () => {
          clearTimeout(timeoutId);
          port.removeAllListeners();
        };

        port.on('error', (err) => {
          logger.error(`Port ${portPath} error:`, err);
          cleanup();
          if (!this.connections.has(deviceId)) {
            reject(err);
          }
          const errorCallback = this.errorCallbacks.get(deviceId);
          if (errorCallback) {
            errorCallback(err);
          }
        });

        port.open((err) => {
          if (err) {
            cleanup();
            logger.error(`Failed to open port ${portPath}:`, err);
            reject(err);
          } else {
            clearTimeout(timeoutId);
            const connection = {
              port,
              isOpen: true,
              deviceId,
              portPath,
              baudRate,
              createdAt: Date.now()
            };
            this.connections.set(deviceId, connection);
            this.setupPortListeners(deviceId, port);
            logger.info(`Connected to ${portPath} at ${baudRate} baud`);
            resolve(connection);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  setupPortListeners(deviceId, port) {
    let buffer = Buffer.alloc(0);

    port.on('data', (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      const callback = this.dataCallbacks.get(deviceId);
      if (callback) {
        callback(data);
      }
    });

    port.on('close', () => {
      logger.info(`Port ${deviceId} closed`);
      const connection = this.connections.get(deviceId);
      if (connection) {
        connection.isOpen = false;
      }
    });

    port.on('error', (err) => {
      logger.error(`Port ${deviceId} error:`, err);
    });
  }

  async disconnect(deviceId) {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      logger.warn(`Device ${deviceId} not found for disconnection`);
      return;
    }

    return new Promise((resolve, reject) => {
      connection.port.close((err) => {
        if (err) {
          logger.error(`Failed to close port ${deviceId}:`, err);
          reject(err);
        } else {
          this.connections.delete(deviceId);
          this.dataCallbacks.delete(deviceId);
          this.errorCallbacks.delete(deviceId);
          logger.info(`Disconnected from ${deviceId}`);
          resolve();
        }
      });
    });
  }

  async disconnectAll() {
    const disconnections = [];
    for (const deviceId of this.connections.keys()) {
      disconnections.push(this.disconnect(deviceId));
    }
    await Promise.all(disconnections);
  }

  async write(deviceId, data) {
    const connection = this.connections.get(deviceId);
    if (!connection || !connection.isOpen) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    return new Promise((resolve, reject) => {
      connection.port.write(data, (err) => {
        if (err) {
          logger.error(`Failed to write to ${deviceId}:`, err);
          reject(err);
        } else {
          connection.port.drain((drainErr) => {
            if (drainErr) {
              logger.warn(`Drain error on ${deviceId}:`, drainErr);
            }
            resolve();
          });
        }
      });
    });
  }

  async writeAndWait(deviceId, data, timeout = 5000) {
    const connection = this.connections.get(deviceId);
    if (!connection || !connection.isOpen) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    return new Promise((resolve, reject) => {
      let responseBuffer = Buffer.alloc(0);
      let timeoutId;

      const dataHandler = (chunk) => {
        responseBuffer = Buffer.concat([responseBuffer, chunk]);
      };

      timeoutId = setTimeout(() => {
        connection.port.removeListener('data', dataHandler);
        reject(new Error(`Timeout waiting for response from ${deviceId}`));
      }, timeout);

      connection.port.on('data', dataHandler);

      connection.port.write(data, (err) => {
        if (err) {
          connection.port.removeListener('data', dataHandler);
          clearTimeout(timeoutId);
          reject(err);
        } else {
          connection.port.drain(() => {
            setTimeout(() => {
              connection.port.removeListener('data', dataHandler);
              clearTimeout(timeoutId);
              resolve(responseBuffer);
            }, 100);
          });
        }
      });
    });
  }

  onData(deviceId, callback) {
    this.dataCallbacks.set(deviceId, callback);
  }

  onError(deviceId, callback) {
    this.errorCallbacks.set(deviceId, callback);
  }

  isConnected(deviceId) {
    const connection = this.connections.get(deviceId);
    return connection && connection.isOpen;
  }

  getConnection(deviceId) {
    return this.connections.get(deviceId);
  }

  getAllConnections() {
    return Array.from(this.connections.values());
  }

  generateDeviceId(portPath) {
    return `device-${portPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  setBaudRate(deviceId, baudRate) {
    const connection = this.connections.get(deviceId);
    if (!connection || !connection.isOpen) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    return new Promise((resolve, reject) => {
      connection.port.update({ baudRate }, (err) => {
        if (err) {
          logger.error(`Failed to set baud rate for ${deviceId}:`, err);
          reject(err);
        } else {
          connection.baudRate = baudRate;
          logger.info(`Baud rate for ${deviceId} set to ${baudRate}`);
          resolve();
        }
      });
    });
  }

  flush(deviceId) {
    const connection = this.connections.get(deviceId);
    if (!connection || !connection.isOpen) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    return new Promise((resolve, reject) => {
      connection.port.flush((err) => {
        if (err) {
          logger.error(`Failed to flush ${deviceId}:`, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async healthCheck(deviceId) {
    const connection = this.connections.get(deviceId);
    if (!connection) return false;
    if (!connection.isOpen) return false;

    try {
      await this.flush(deviceId);
      return true;
    } catch (error) {
      logger.warn(`Health check failed for ${deviceId}:`, error);
      return false;
    }
  }

  async reconnect(deviceId) {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const portPath = connection.portPath;
    const baudRate = connection.baudRate;

    try {
      await this.disconnect(deviceId);
    } catch (error) {
      logger.warn(`Disconnect failed during reconnect for ${deviceId}:`, error);
    }

    return this.connect(portPath, { baudRate });
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const serialManager = new SerialManager();
module.exports = serialManager;
