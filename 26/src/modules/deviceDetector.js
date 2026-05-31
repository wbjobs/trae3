const EventEmitter = require('events');
const { SerialPort } = require('serialport');
const serialManager = require('./serial');
const parser = require('./parser');
const logger = require('./logger');
const platform = require('../platform');
const stateManager = require('./stateManager');

class DeviceDetector extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.scanInterval = null;
    this.isScanning = false;
    this.onlineTimeout = 15000;
    this.maxDetectionRetries = 2;
    this.detectionTimeout = 1500;
  }

  async scanPorts() {
    try {
      const ports = await serialManager.listPorts();
      logger.debug(`DeviceDetector: Found ${ports.length} serial ports`);
      return ports;
    } catch (error) {
      logger.error('DeviceDetector: Failed to scan ports', error);
      throw error;
    }
  }

  async detectDevice(portPath, deviceId, serialOptions = {}) {
    let tempPort = null;
    let retries = 0;

    while (retries <= this.maxDetectionRetries) {
      try {
        const options = platform.getSerialPortOptions({
          baudRate: serialOptions.baudRate || 9600,
          dataBits: serialOptions.dataBits || 8,
          stopBits: serialOptions.stopBits || 1,
          parity: serialOptions.parity || 'none',
          ...serialOptions
        });
        options.path = portPath;
        options.autoOpen = false;

        tempPort = new SerialPort(options);

        await new Promise((resolve, reject) => {
          const openTimeout = setTimeout(() => {
            reject(new Error('Open timeout'));
          }, 2000);

          tempPort.open((err) => {
            clearTimeout(openTimeout);
            if (err) reject(err);
            else resolve();
          });
        });

        const pingCommand = parser.buildPingCommand(deviceId);
        let receivedBuffer = Buffer.alloc(0);
        let responseReceived = false;
        let resolved = false;

        const dataHandler = (data) => {
          receivedBuffer = Buffer.concat([receivedBuffer, data]);
          
          const parsed = parser.parsePingResponse(receivedBuffer);
          if (parsed.valid && parsed.online) {
            responseReceived = true;
          }
        };

        tempPort.on('data', dataHandler);

        let writeError = null;
        await new Promise((resolve) => {
          tempPort.write(pingCommand, (err) => {
            if (err) {
              writeError = err;
              resolve();
              return;
            }
            tempPort.drain(() => resolve());
          });
        });

        if (writeError) {
          throw writeError;
        }

        await new Promise(resolve => setTimeout(resolve, this.detectionTimeout));
        
        tempPort.removeListener('data', dataHandler);

        try {
          await new Promise((resolve, reject) => {
            if (tempPort.isOpen) {
              tempPort.close((err) => {
                if (err) reject(err);
                else resolve();
              });
            } else {
              resolve();
            }
          });
        } catch (closeErr) {
          logger.warn('DeviceDetector: Error closing temp port', closeErr);
        }
        tempPort = null;

        if (responseReceived) {
          const parsed = parser.parsePingResponse(receivedBuffer);
          if (parsed.valid && parsed.online) {
            return {
              portPath,
              deviceId,
              online: true,
              lastSeen: Date.now(),
              serialOptions,
              status: 'normal'
            };
          }
        }

        const hasPartialData = receivedBuffer.length > 0;
        if (hasPartialData && retries < this.maxDetectionRetries) {
          logger.debug(`DeviceDetector: Partial response for device ${deviceId}, retry ${retries + 1}/${this.maxDetectionRetries}`);
          retries++;
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }

        return {
          portPath,
          deviceId,
          online: false,
          serialOptions,
          status: 'offline'
        };

      } catch (error) {
        if (tempPort) {
          try {
            if (tempPort.isOpen) {
              tempPort.close(() => {});
            }
          } catch (e) {
          }
          tempPort = null;
        }

        if (platform.shouldRetryOnError(error) && retries < this.maxDetectionRetries) {
          retries++;
          logger.debug(`DeviceDetector: Retry detection for ${deviceId} (${retries}/${this.maxDetectionRetries}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        logger.warn(`DeviceDetector: Detection failed for ${portPath}:${deviceId} after ${retries + 1} attempts`, error);
        
        return {
          portPath,
          deviceId,
          online: false,
          error: error.message,
          serialOptions,
          status: 'error'
        };
      }
    }

    return {
      portPath,
      deviceId,
      online: false,
      serialOptions,
      status: 'offline'
    };
  }

  async scanDevices(portPath, startId = 1, endId = 255, serialOptions = {}) {
    if (this.isScanning) {
      throw new Error('Device scan already in progress');
    }

    const foundDevices = [];
    this.isScanning = true;
    this.emit('scan-start', { portPath, startId, endId });

    const total = endId - startId + 1;
    let processed = 0;
    let found = 0;

    const scanBatch = async (batchSize = 5, delayBetween = 100) => {
      for (let deviceId = startId; deviceId <= endId; deviceId++) {
        if (!this.isScanning) {
          logger.info('DeviceDetector: Scan cancelled');
          break;
        }

        processed++;
        const result = await this.detectDevice(portPath, deviceId, serialOptions);
        
        this.emit('scan-progress', {
          current: processed,
          total,
          deviceId,
          found: result.online
        });

        if (result.online) {
          found++;
          foundDevices.push(result);
          this.devices.set(`${portPath}:${deviceId}`, result);
        }

        if (processed % batchSize === 0 && deviceId < endId) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      }
    };

    try {
      await scanBatch();
    } catch (error) {
      logger.error('DeviceDetector: Scan error', error);
      throw error;
    } finally {
      this.isScanning = false;
    }

    stateManager.setDevices(Array.from(this.devices.values()));

    this.emit('scan-complete', { 
      foundDevices, 
      total: foundDevices.length,
      scanned: processed
    });

    logger.info(`DeviceDetector: Scan complete - found ${found} devices out of ${total} scanned`);
    return foundDevices;
  }

  async quickScan(portPath, deviceIds, serialOptions = {}) {
    const foundDevices = [];
    
    for (const deviceId of deviceIds) {
      const result = await this.detectDevice(portPath, deviceId, serialOptions);
      if (result.online) {
        foundDevices.push(result);
        this.devices.set(`${portPath}:${deviceId}`, result);
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    return foundDevices;
  }

  startAutoScan(interval = 8000) {
    if (this.scanInterval) {
      this.stopAutoScan();
    }

    this.isScanning = true;
    const scanOnce = async () => {
      if (!this.isScanning) return;
      
      const devices = Array.from(this.devices.values());
      if (devices.length === 0) return;

      for (const device of devices) {
        if (!this.isScanning) break;

        try {
          const result = await this.checkDeviceStatus(device.portPath, device.deviceId);
          
          const existing = this.devices.get(`${device.portPath}:${device.deviceId}`);
          if (existing) {
            existing.online = result.online;
            if (result.online) {
              existing.lastSeen = Date.now();
              existing.status = 'normal';
            } else if (Date.now() - (existing.lastSeen || 0) > this.onlineTimeout) {
              existing.online = false;
              existing.status = 'offline';
            }
            this.emit('device-status', existing);
          }
        } catch (error) {
          logger.error('DeviceDetector: Auto-scan error', error);
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      }
    };

    this.scanInterval = setInterval(scanOnce, interval);
    scanOnce();

    logger.info(`DeviceDetector: Auto-scan started with ${interval}ms interval`);
  }

  stopAutoScan() {
    this.isScanning = false;
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      logger.info('DeviceDetector: Auto-scan stopped');
    }
  }

  async checkDeviceStatus(portPath, deviceId) {
    if (!serialManager.isOpen()) {
      return { portPath, deviceId, online: false, error: '串口未连接', status: 'error' };
    }

    let retries = 0;
    const maxRetries = platform.getMaxRetries();

    while (retries < maxRetries) {
      try {
        const pingCommand = parser.buildPingCommand(deviceId);
        const response = await serialManager.sendAndReceive(pingCommand, 2000);
        const parsed = parser.parsePingResponse(response);

        const deviceKey = `${portPath}:${deviceId}`;
        if (parsed.valid) {
          const device = this.devices.get(deviceKey) || { portPath, deviceId };
          device.online = true;
          device.lastSeen = Date.now();
          device.status = 'normal';
          this.devices.set(deviceKey, device);
          return device;
        } else if (parsed.needsMoreData && retries < maxRetries - 1) {
          retries++;
          logger.debug(`DeviceDetector: Partial response for status check, retry ${retries}`);
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        } else {
          const device = this.devices.get(deviceKey);
          if (device) {
            device.online = false;
            device.status = 'offline';
          }
          return { portPath, deviceId, online: false, error: parsed.error, status: 'offline' };
        }
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          logger.warn(`DeviceDetector: Status check failed for ${deviceId} after ${maxRetries} retries`, error);
          const deviceKey = `${portPath}:${deviceId}`;
          const device = this.devices.get(deviceKey);
          if (device) {
            device.online = false;
            device.status = 'error';
          }
          return { portPath, deviceId, online: false, error: error.message, status: 'error' };
        }
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }

    return { portPath, deviceId, online: false, status: 'offline' };
  }

  async checkAllDevicesStatus() {
    const devices = Array.from(this.devices.values());
    const results = [];

    for (const device of devices) {
      const result = await this.checkDeviceStatus(device.portPath, device.deviceId);
      results.push(result);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  addDevice(portPath, deviceId, info = {}) {
    const key = `${portPath}:${deviceId}`;
    const device = {
      portPath,
      deviceId,
      online: false,
      lastSeen: null,
      status: 'unknown',
      ...info
    };
    this.devices.set(key, device);
    stateManager.setDevices(Array.from(this.devices.values()));
    logger.info(`DeviceDetector: Device ${deviceId} added at ${portPath}`);
    return device;
  }

  removeDevice(portPath, deviceId) {
    const key = `${portPath}:${deviceId}`;
    const deleted = this.devices.delete(key);
    if (deleted) {
      stateManager.setDevices(Array.from(this.devices.values()));
      logger.info(`DeviceDetector: Device ${deviceId} removed from ${portPath}`);
    }
    return deleted;
  }

  getDevice(portPath, deviceId) {
    return this.devices.get(`${portPath}:${deviceId}`);
  }

  getAllDevices() {
    return Array.from(this.devices.values());
  }

  getOnlineDevices() {
    return Array.from(this.devices.values()).filter(d => d.online);
  }

  getDeviceCount() {
    return this.devices.size;
  }

  getOnlineDeviceCount() {
    return Array.from(this.devices.values()).filter(d => d.online).length;
  }

  clearDevices() {
    this.devices.clear();
    stateManager.setDevices([]);
    logger.info('DeviceDetector: All devices cleared');
  }

  loadSavedDevices() {
    const saved = stateManager.getDevices();
    if (saved && saved.length > 0) {
      saved.forEach(d => {
        this.devices.set(`${d.portPath}:${d.deviceId}`, {
          ...d,
          online: false,
          status: 'unknown'
        });
      });
      logger.info(`DeviceDetector: Loaded ${saved.length} saved devices`);
      return saved;
    }
    return [];
  }

  isScanInProgress() {
    return this.isScanning;
  }
}

module.exports = new DeviceDetector();
module.exports.DeviceDetector = DeviceDetector;
