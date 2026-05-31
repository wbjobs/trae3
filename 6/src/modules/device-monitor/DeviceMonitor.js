const EventEmitter = require('events');
const serialManager = require('../serialport');
const logger = require('../logger');

class DeviceMonitor extends EventEmitter {
  constructor() {
    super();
    this.devices = new Map();
    this.pollInterval = 2000;
    this.pollTimer = null;
    this.isRunning = false;
    this.isScanning = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    this.scanTimeout = 8000;
    this.deviceOfflineThreshold = 60000;
    this.knownDeviceSignatures = new Map();
  }

  start(pollInterval = 2000) {
    if (this.isRunning) {
      logger.warn('Device monitor is already running');
      return;
    }

    this.pollInterval = pollInterval;
    this.isRunning = true;
    this.consecutiveErrors = 0;
    logger.info(`Starting device monitor with ${pollInterval}ms poll interval`);

    this.scanDevices();
    this.pollTimer = setInterval(() => this.scanDevices(), pollInterval);
  }

  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isScanning = false;
    logger.info('Device monitor stopped');
  }

  async scanDevices() {
    if (this.isScanning) {
      logger.debug('Previous scan still in progress, skipping...');
      return;
    }

    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      logger.error(`Too many consecutive scan errors (${this.consecutiveErrors}), pausing scan for 30s`);
      await this.delay(30000);
      this.consecutiveErrors = 0;
    }

    this.isScanning = true;
    const scanStartTime = Date.now();

    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Scan timed out')), this.scanTimeout);
      });

      const ports = await Promise.race([serialManager.listPorts(), timeoutPromise]);
      
      await this._processPorts(ports);
      
      this.consecutiveErrors = 0;
      this.emit('devices:updated', this.getDevices());
      
      const scanDuration = Date.now() - scanStartTime;
      logger.debug(`Scan completed in ${scanDuration}ms, found ${ports.length} ports`);

    } catch (error) {
      this.consecutiveErrors++;
      logger.error(`Scan error (${this.consecutiveErrors}/${this.maxConsecutiveErrors}):`, error.message);
      
      if (error.message.includes('timed out')) {
        logger.warn('Serial port scan timed out, devices may be unresponsive');
        await this._handleScanTimeout();
      }
      
      this.emit('scan:error', {
        error: error.message,
        consecutiveErrors: this.consecutiveErrors
      });
    } finally {
      this.isScanning = false;
    }
  }

  async _processPorts(ports) {
    const currentPortPaths = new Set(ports.map(p => p.path));
    const currentSignatures = new Map();

    for (const port of ports) {
      const signature = this._getDeviceSignature(port);
      currentSignatures.set(port.path, signature);
      
      const deviceId = this.generateDeviceId(port.path);
      const existingDevice = this.devices.get(deviceId);

      if (!existingDevice) {
        const device = await this._createDevice(port);
        this.devices.set(deviceId, device);
        this.knownDeviceSignatures.set(deviceId, signature);
        this.emit('device:added', device);
        logger.info(`Device added: ${deviceId} (${port.path})`);
        
        this._identifyDevice(device).catch(err => {
          logger.debug(`Device identification failed for ${deviceId}: ${err.message}`);
        });
      } else {
        const oldSignature = this.knownDeviceSignatures.get(deviceId);
        const signatureChanged = oldSignature && signature !== oldSignature;
        
        if (existingDevice.status === 'offline') {
          existingDevice.status = signatureChanged ? 'online' : 'online';
          existingDevice.lastSeen = new Date();
          existingDevice.manufacturer = port.manufacturer;
          existingDevice.serialNumber = port.serialNumber;
          this.knownDeviceSignatures.set(deviceId, signature);
          this.emit('device:changed', existingDevice);
          logger.info(`Device reconnected: ${deviceId}`);
        } else {
          existingDevice.lastSeen = new Date();
          if (signatureChanged) {
            existingDevice.manufacturer = port.manufacturer;
            existingDevice.serialNumber = port.serialNumber;
            this.knownDeviceSignatures.set(deviceId, signature);
          }
        }
      }
    }

    for (const [deviceId, device] of this.devices) {
      if (!currentPortPaths.has(device.portPath) && device.status !== 'offline') {
        const timeSinceLastSeen = Date.now() - new Date(device.lastSeen).getTime();
        
        if (device.status === 'flashing') {
          logger.warn(`Device ${deviceId} disconnected during flashing, last seen ${timeSinceLastSeen}ms ago`);
          if (timeSinceLastSeen < 5000) {
            continue;
          }
        }

        if (timeSinceLastSeen < this.deviceOfflineThreshold) {
          logger.debug(`Device ${deviceId} not found in scan, but last seen ${timeSinceLastSeen}ms ago, waiting...`);
          continue;
        }

        device.status = 'offline';
        this.emit('device:removed', device);
        logger.info(`Device removed: ${deviceId} (${device.portPath})`);
      }
    }
  }

  async _createDevice(port) {
    return {
      deviceId: this.generateDeviceId(port.path),
      portPath: port.path,
      manufacturer: port.manufacturer,
      serialNumber: port.serialNumber,
      vendorId: port.vendorId,
      productId: port.productId,
      pnpId: port.pnpId,
      friendlyName: port.friendlyName,
      status: 'online',
      firmwareVersion: null,
      hardwareType: null,
      lastSeen: new Date(),
      firstSeen: new Date()
    };
  }

  async _identifyDevice(device) {
    if (device.serialNumber) {
      device.hardwareType = this._detectHardwareType(device);
      return;
    }

    try {
      const connection = await serialManager.connect(device.portPath, {
        baudRate: 115200,
        autoOpen: false,
        maxRetries: 1
      });

      const response = await serialManager.writeAndWait(
        connection.deviceId,
        Buffer.from('*IDN?\r\n'),
        2000
      );

      const idnResponse = response.toString('ascii').trim();
      if (idnResponse) {
        const parts = idnResponse.split(',');
        if (parts.length >= 2) {
          device.manufacturer = parts[0] || device.manufacturer;
          device.hardwareType = parts[1] || null;
          if (parts[3]) {
            device.firmwareVersion = parts[3];
          }
        }
      }

      await serialManager.disconnect(connection.deviceId);
    } catch (error) {
      logger.debug(`IDN query failed for ${device.portPath}: ${error.message}`);
    }
  }

  _detectHardwareType(device) {
    const vidPid = `${device.vendorId || ''}:${device.productId || ''}`.toUpperCase();
    
    const hardwareMap = {
      '0483:5740': 'STM32 Virtual COM Port',
      '1A86:7523': 'CH340 Serial',
      '10C4:EA60': 'CP210x USB to UART',
      '067B:2303': 'PL2303 Serial',
      '0403:6001': 'FT232 Serial',
      '0403:6015': 'FT231X Serial'
    };

    return hardwareMap[vidPid] || null;
  }

  _getDeviceSignature(port) {
    return [
      port.vendorId,
      port.productId,
      port.serialNumber,
      port.manufacturer
    ].filter(Boolean).join('|');
  }

  async _handleScanTimeout() {
    for (const [deviceId, device] of this.devices) {
      if (device.status !== 'offline') {
        const isHealthy = await serialManager.healthCheck(deviceId).catch(() => false);
        if (!isHealthy) {
          logger.warn(`Device ${deviceId} failed health check after scan timeout`);
        }
      }
    }
  }

  getDevices() {
    return Array.from(this.devices.values()).sort((a, b) => {
      return a.portPath.localeCompare(b.portPath);
    });
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getDeviceByPort(portPath) {
    const deviceId = this.generateDeviceId(portPath);
    return this.devices.get(deviceId);
  }

  getOnlineDevices() {
    return this.getDevices().filter(d => d.status !== 'offline');
  }

  getOfflineDevices() {
    return this.getDevices().filter(d => d.status === 'offline');
  }

  updateDeviceStatus(deviceId, status) {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn(`Cannot update status: device ${deviceId} not found`);
      return null;
    }

    const oldStatus = device.status;
    device.status = status;
    device.lastSeen = new Date();

    if (oldStatus !== status) {
      logger.info(`Device ${deviceId} status changed: ${oldStatus} -> ${status}`);
      this.emit('device:changed', device);
    }

    return device;
  }

  updateDeviceFirmwareVersion(deviceId, version) {
    const device = this.devices.get(deviceId);
    if (!device) {
      logger.warn(`Cannot update firmware version: device ${deviceId} not found`);
      return null;
    }

    device.firmwareVersion = version;
    device.lastSeen = new Date();
    logger.info(`Device ${deviceId} firmware version updated: ${version}`);
    this.emit('device:changed', device);
    return device;
  }

  async pingDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (device.status === 'offline') {
      return false;
    }

    try {
      const ports = await serialManager.listPorts();
      const isPresent = ports.some(p => this.generateDeviceId(p.path) === deviceId);
      
      if (isPresent) {
        device.lastSeen = new Date();
        return true;
      } else {
        this.updateDeviceStatus(deviceId, 'offline');
        return false;
      }
    } catch (error) {
      logger.error(`Error pinging device ${deviceId}:`, error);
      return false;
    }
  }

  async readDeviceInfo(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    if (device.status === 'offline') {
      throw new Error(`Device ${deviceId} is offline`);
    }

    try {
      const connection = await serialManager.connect(device.portPath, {
        baudRate: 115200,
        autoOpen: false
      });

      const response = await serialManager.writeAndWait(
        connection.deviceId,
        Buffer.from('INFO\r\n'),
        2000
      );

      const infoText = response.toString('ascii').trim();
      const versionMatch = infoText.match(/FW:?\s*v?(\d+\.\d+\.\d+)/i);
      if (versionMatch) {
        this.updateDeviceFirmwareVersion(deviceId, versionMatch[1]);
      }

      await serialManager.disconnect(connection.deviceId);
      return {
        raw: infoText,
        firmwareVersion: versionMatch ? versionMatch[1] : null
      };
    } catch (error) {
      logger.error(`Error reading device info for ${deviceId}:`, error);
      throw error;
    }
  }

  removeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.delete(deviceId);
      this.emit('device:removed', device);
      logger.info(`Device ${deviceId} removed from monitor`);
      return true;
    }
    return false;
  }

  clearOfflineDevices() {
    const offlineDevices = this.getOfflineDevices();
    for (const device of offlineDevices) {
      this.devices.delete(device.deviceId);
      this.emit('device:removed', device);
    }
    logger.info(`Cleared ${offlineDevices.length} offline devices`);
    return offlineDevices.length;
  }

  getDeviceStats() {
    const devices = this.getDevices();
    return {
      total: devices.length,
      online: devices.filter(d => d.status === 'online').length,
      offline: devices.filter(d => d.status === 'offline').length,
      flashing: devices.filter(d => d.status === 'flashing').length,
      success: devices.filter(d => d.status === 'success').length,
      error: devices.filter(d => d.status === 'error').length
    };
  }

  generateDeviceId(portPath) {
    return `device-${portPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
  }

  onDeviceAdded(callback) {
    this.on('device:added', callback);
  }

  onDeviceRemoved(callback) {
    this.on('device:removed', callback);
  }

  onDeviceChanged(callback) {
    this.on('device:changed', callback);
  }

  onDevicesUpdated(callback) {
    this.on('devices:updated', callback);
  }

  offDeviceAdded(callback) {
    this.off('device:added', callback);
  }

  offDeviceRemoved(callback) {
    this.off('device:removed', callback);
  }

  offDeviceChanged(callback) {
    this.off('device:changed', callback);
  }

  offDevicesUpdated(callback) {
    this.off('devices:updated', callback);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const deviceMonitor = new DeviceMonitor();
module.exports = deviceMonitor;
