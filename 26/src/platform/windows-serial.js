const { SerialPort } = require('serialport');
const { InterByteTimeoutParser } = require('@serialport/parser-inter-byte-timeout');
const EventEmitter = require('events');
const logger = require('../modules/logger');
const platform = require('./index');

class WindowsSerialPort extends EventEmitter {
  constructor() {
    super();
    this.port = null;
    this.parser = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.receiveBuffer = Buffer.alloc(0);
    this.connectionLock = false;
    this.writeQueue = [];
    this.isWriting = false;
    this.commandTimeout = platform.getDefaultCommandTimeout();
  }

  async listPorts() {
    try {
      const ports = await SerialPort.list();
      return ports.map(p => ({
        path: p.path.toUpperCase(),
        manufacturer: p.manufacturer,
        serialNumber: p.serialNumber,
        vendorId: p.vendorId,
        productId: p.productId,
        friendlyName: p.friendlyName || p.path
      }));
    } catch (error) {
      logger.error('Windows: Failed to list serial ports', error);
      if (error.message.includes('permission')) {
        logger.warn('Windows: Try running with administrator privileges');
      }
      return [];
    }
  }

  connect(portPath, options = {}) {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.connectionLock) {
        reject(new Error('Connection in progress'));
        return;
      }

      if (this.isConnected && this.port && this.port.isOpen) {
        resolve(this);
        return;
      }

      this.isConnecting = true;
      this.connectionLock = true;

      const config = platform.getSerialPortOptions(options);
      config.path = portPath;

      let timeoutId = null;
      const connectionTimeout = options.connectionTimeout || 5000;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.isConnecting = false;
        this.connectionLock = false;
      };

      timeoutId = setTimeout(() => {
        cleanup();
        if (this.port) {
          this.port.destroy();
          this.port = null;
        }
        reject(new Error(`Connection timeout after ${connectionTimeout}ms`));
      }, connectionTimeout);

      try {
        this.port = new SerialPort(config);
      } catch (error) {
        cleanup();
        logger.error('Windows: Failed to create serial port instance', error);
        reject(error);
        return;
      }

      this.port.on('open', () => {
        try {
          this.isConnected = true;
          this.isConnecting = false;
          this.connectionLock = false;
          clearTimeout(timeoutId);

          this.parser = this.port.pipe(
            new InterByteTimeoutParser({ 
              interval: options.parserInterval || 50,
              maxBufferSize: 65536
            })
          );

          this.parser.on('data', (data) => {
            this.handleData(data);
          });

          this.port.on('error', (error) => {
            logger.error('Windows: Serial port error', error);
            this.handleError(error);
          });

          this.port.on('close', (error) => {
            this.handleClose(error);
          });

          this.port.on('drain', () => {
            this.processWriteQueue();
          });

          logger.info(`Windows: Serial port connected: ${portPath}`);
          this.emit('connected', portPath);
          resolve(this);
        } catch (error) {
          cleanup();
          reject(error);
        }
      });

      this.port.on('error', (error) => {
        cleanup();
        logger.error(`Windows: Failed to open serial port ${portPath}`, error);
        reject(error);
      });

      this.port.open((err) => {
        if (err) {
          cleanup();
          logger.error(`Windows: Open callback error for ${portPath}`, err);
          reject(err);
        }
      });
    });
  }

  handleData(data) {
    try {
      this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);

      if (this.receiveBuffer.length > 1048576) {
        logger.warn('Windows: Receive buffer overflow, clearing');
        this.receiveBuffer = Buffer.alloc(0);
        this.emit('buffer-overflow');
      }

      this.emit('data', this.receiveBuffer);
      logger.debug(`Windows: Received ${data.length} bytes: ${data.toString('hex')}`);
    } catch (error) {
      logger.error('Windows: Error handling received data', error);
    }
  }

  handleError(error) {
    this.isConnected = false;
    this.emit('error', error);

    if (platform.shouldRetryOnError(error)) {
      this.emit('reconnect-needed', error);
    }
  }

  handleClose(error) {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.connectionLock = false;
    this.isConnecting = false;
    this.clearWriteQueue();

    if (wasConnected) {
      logger.info(`Windows: Serial port closed ${error ? 'with error: ' + error.message : ''}`);
      this.emit('disconnected', error);
    }

    this.port = null;
    this.parser = null;
  }

  async write(data) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.port) {
        reject(new Error('Serial port not connected'));
        return;
      }

      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);

      if (buffer.length === 0) {
        resolve();
        return;
      }

      this.writeQueue.push({
        buffer,
        resolve,
        reject,
        timestamp: Date.now()
      });

      this.processWriteQueue();
    });
  }

  async processWriteQueue() {
    if (this.isWriting || this.writeQueue.length === 0) return;
    if (!this.isConnected || !this.port) {
      this.clearWriteQueue(new Error('Port disconnected'));
      return;
    }

    this.isWriting = true;
    const item = this.writeQueue.shift();

    try {
      const writeInterval = platform.getDefaultWriteInterval();

      await new Promise((resolve, reject) => {
        if (!this.port || !this.port.isOpen) {
          reject(new Error('Port not open'));
          return;
        }

        this.port.write(item.buffer, (err) => {
          if (err) {
            reject(err);
            return;
          }

          this.port.drain((drainErr) => {
            if (drainErr) {
              reject(drainErr);
              return;
            }
            resolve();
          });
        });
      });

      logger.debug(`Windows: Sent ${item.buffer.length} bytes: ${item.buffer.toString('hex')}`);

      await new Promise(resolve => setTimeout(resolve, writeInterval));

      item.resolve();
    } catch (error) {
      logger.error('Windows: Write error', error);
      item.reject(error);
    } finally {
      this.isWriting = false;
      if (this.writeQueue.length > 0) {
        setImmediate(() => this.processWriteQueue());
      }
    }
  }

  clearWriteQueue(error = null) {
    while (this.writeQueue.length > 0) {
      const item = this.writeQueue.shift();
      if (error) {
        item.reject(error);
      } else {
        item.resolve();
      }
    }
    this.isWriting = false;
  }

  async sendAndReceive(data, timeout = null) {
    if (!this.isConnected) {
      throw new Error('Serial port not connected');
    }

    const actualTimeout = timeout || this.commandTimeout;

    this.clearBuffer();

    await this.write(data);

    return new Promise((resolve, reject) => {
      let receivedData = Buffer.alloc(0);
      let timeoutId = null;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.removeListener('data', dataHandler);
      };

      const complete = (error, result) => {
        if (resolved) return;
        resolved = true;
        cleanup();

        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };

      timeoutId = setTimeout(() => {
        if (receivedData.length > 0) {
          complete(null, receivedData);
        } else {
          complete(new Error(`Response timeout after ${actualTimeout}ms`), null);
        }
      }, actualTimeout);

      const dataHandler = (buffer) => {
        if (resolved) return;

        receivedData = Buffer.concat([receivedData, buffer]);

        if (receivedData.length >= 7) {
          const hasCompleteFrame = this.checkForCompleteFrame(receivedData);
          if (hasCompleteFrame) {
            complete(null, receivedData);
          }
        }
      };

      this.on('data', dataHandler);
    });
  }

  checkForCompleteFrame(buffer) {
    if (buffer.length < 7) return false;

    if (buffer[0] === 0xAA && buffer[1] === 0x55) {
      const length = buffer.readUInt16BE(5);
      const expectedLength = 7 + length + 2;

      if (buffer.length >= expectedLength) {
        return true;
      }
    } else {
      for (let i = 0; i < buffer.length - 1; i++) {
        if (buffer[i] === 0xAA && buffer[i + 1] === 0x55) {
          if (i > 0) {
            logger.debug(`Windows: Found frame header at offset ${i}, discarding ${i} bytes`);
          }
          return true;
        }
      }
    }

    return false;
  }

  readBuffer() {
    const data = Buffer.from(this.receiveBuffer);
    this.receiveBuffer = Buffer.alloc(0);
    return data;
  }

  clearBuffer() {
    this.receiveBuffer = Buffer.alloc(0);
  }

  async disconnect() {
    return new Promise((resolve) => {
      this.clearWriteQueue(new Error('Disconnecting'));

      if (this.port && (this.isConnected || this.port.isOpen)) {
        try {
          this.port.close((err) => {
            if (err) {
              logger.error('Windows: Error closing serial port', err);
            }
            this.isConnected = false;
            this.port = null;
            this.parser = null;
            this.connectionLock = false;
            this.isConnecting = false;
            resolve();
          });
        } catch (error) {
          logger.error('Windows: Exception during disconnect', error);
          this.isConnected = false;
          this.port = null;
          this.parser = null;
          this.connectionLock = false;
          this.isConnecting = false;
          resolve();
        }
      } else {
        this.isConnected = false;
        this.port = null;
        this.parser = null;
        this.connectionLock = false;
        this.isConnecting = false;
        resolve();
      }
    });
  }

  isOpen() {
    return this.isConnected && this.port && this.port.isOpen;
  }

  getPortInfo() {
    if (!this.port) return null;
    return {
      path: this.port.path,
      baudRate: this.port.baudRate,
      dataBits: this.port.dataBits,
      stopBits: this.port.stopBits,
      parity: this.port.parity,
      isOpen: this.isOpen(),
      platform: 'windows'
    };
  }

  setCommandTimeout(timeout) {
    this.commandTimeout = timeout;
  }
}

module.exports = WindowsSerialPort;
