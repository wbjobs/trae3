const EventEmitter = require('events');
const serialManager = require('../serialport');
const logger = require('../logger');
const deviceMonitor = require('../device-monitor');
const fs = require('fs');
const path = require('path');

class FlashTask extends EventEmitter {
  constructor(config) {
    super();
    this.taskId = config.taskId || this.generateTaskId();
    this.deviceId = config.deviceId;
    this.portPath = config.portPath;
    this.firmware = config.firmware;
    this.baudRate = config.baudRate || 115200;
    this.chunkSize = config.chunkSize || 1024;
    this.timeout = config.timeout || 30000;

    this.status = config.status || 'pending';
    this.progress = config.progress || 0;
    this.startTime = config.startTime || null;
    this.endTime = config.endTime || null;
    this.error = config.error || null;
    this.currentStep = config.currentStep || 0;
    this.totalSteps = config.totalSteps || 0;
    this.isCancelled = config.isCancelled || false;
    
    this.checkpoint = config.checkpoint || {
      step: 0,
      chunkWritten: 0,
      totalChunks: 0,
      bootloaderEntered: false,
      flashErased: false,
      firmwareVerified: false,
      lastSavedAt: null
    };
    
    this.canResume = config.canResume || false;
    this.checkpointInterval = 5000;
    this.lastCheckpointSave = 0;
    this.checkpointDir = path.join(process.cwd(), 'logs', 'checkpoints');
  }

  generateTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getElapsedTime() {
    if (!this.startTime) return 0;
    const endTime = this.endTime || Date.now();
    return endTime - this.startTime;
  }

  getProgressInfo() {
    return {
      taskId: this.taskId,
      deviceId: this.deviceId,
      portPath: this.portPath,
      status: this.status,
      progress: this.progress,
      elapsed: this.getElapsedTime(),
      firmware: {
        fileName: this.firmware.fileName,
        version: this.firmware.version,
        size: this.firmware.size
      },
      error: this.error,
      currentStep: this.currentStep,
      totalSteps: this.totalSteps
    };
  }

  async execute(resume = false) {
    if (this.status === 'running') {
      throw new Error('Task is already running');
    }

    if (resume && this.canResume) {
      logger.task(this.taskId, 'info', `Resuming task from checkpoint at step ${this.checkpoint.step}`);
    } else {
      this.startTime = Date.now();
      this.progress = 0;
      this.error = null;
      this.isCancelled = false;
      this.checkpoint = {
        step: 0,
        chunkWritten: 0,
        totalChunks: 0,
        bootloaderEntered: false,
        flashErased: false,
        firmwareVerified: false,
        lastSavedAt: null
      };
      this.canResume = false;
    }

    this.status = 'running';
    
    logger.task(this.taskId, 'info', `${resume ? 'Resuming' : 'Starting'} flash task for device ${this.deviceId} on port ${this.portPath}`);
    logger.task(this.taskId, 'info', `Firmware: ${this.firmware.fileName} (${this.firmware.version}, ${this.firmware.size} bytes)`);
    
    this.emit('progress', this.getProgressInfo());
    deviceMonitor.updateDeviceStatus(this.deviceId, 'flashing');

    try {
      if (!this.checkpoint.bootloaderEntered) {
        await this.connectToDevice();
        await this.enterBootloader();
        this.checkpoint.bootloaderEntered = true;
        this.checkpoint.step = 2;
        await this.saveCheckpoint();
      }

      if (!this.checkpoint.flashErased) {
        await this.eraseFlash();
        this.checkpoint.flashErased = true;
        this.checkpoint.step = 3;
        await this.saveCheckpoint();
      }

      if (!this.checkpoint.firmwareVerified) {
        await this.writeFirmware(resume);
        await this.verifyFirmware();
        this.checkpoint.firmwareVerified = true;
        this.checkpoint.step = 5;
        await this.saveCheckpoint();
      }

      await this.resetDevice();
      
      this.status = 'success';
      this.progress = 100;
      this.endTime = Date.now();
      this.canResume = false;
      
      logger.task(this.taskId, 'info', `Task completed successfully in ${this.getElapsedTime()}ms`);
      deviceMonitor.updateDeviceStatus(this.deviceId, 'success');
      deviceMonitor.updateDeviceFirmwareVersion(this.deviceId, this.firmware.version);
      
      await this.deleteCheckpoint();
      
    } catch (error) {
      this.status = 'failed';
      this.error = error.message;
      this.endTime = Date.now();
      this.canResume = this.checkpoint.step > 0 && this.checkpoint.step < 5;
      
      logger.task(this.taskId, 'error', `Task failed: ${error.message}`);
      logger.task(this.taskId, 'warn', `Task can be resumed: ${this.canResume}`);
      deviceMonitor.updateDeviceStatus(this.deviceId, 'error');
      
      if (this.canResume) {
        await this.saveCheckpoint();
      }
      
    } finally {
      await this.cleanup();
      this.emit('progress', this.getProgressInfo());
      this.emit('complete', this.getProgressInfo());
    }

    return this.getProgressInfo();
  }

  async connectToDevice() {
    if (this.isCancelled) throw new Error('Task cancelled');
    
    this.currentStep = 1;
    this.totalSteps = 5;
    this.updateProgress(5, 'Connecting to device...');
    logger.task(this.taskId, 'debug', 'Connecting to device...');

    if (this.preconnectedDevice) {
      logger.task(this.taskId, 'debug', 'Using pre-connected device');
      const isHealthy = await serialManager.healthCheck(this.preconnectedDevice.deviceId);
      if (isHealthy) {
        this.connection = this.preconnectedDevice;
        this.connectionId = this.connection.deviceId;
        this.preconnectedDevice = null;
        logger.task(this.taskId, 'info', `Reused pre-connected device: ${this.connectionId}`);
        return;
      }
      logger.task(this.taskId, 'warn', 'Pre-connected device health check failed, reconnecting...');
    }

    this.connection = await serialManager.connect(this.portPath, {
      baudRate: this.baudRate,
      autoOpen: false
    });

    logger.task(this.taskId, 'debug', `Connected to ${this.portPath} at ${this.baudRate} baud`);
  }

  async enterBootloader() {
    if (this.isCancelled) throw new Error('Task cancelled');
    
    this.currentStep = 2;
    this.updateProgress(10, 'Entering bootloader mode...');
    logger.task(this.taskId, 'debug', 'Entering bootloader mode...');

    await serialManager.write(this.connection.deviceId, Buffer.from('BOOT\r\n'));
    await this.waitForResponse('BOOT_OK', 5000);
    
    logger.task(this.taskId, 'debug', 'Bootloader mode activated');
  }

  async eraseFlash() {
    if (this.isCancelled) throw new Error('Task cancelled');
    
    this.currentStep = 3;
    this.updateProgress(15, 'Erasing flash memory...');
    logger.task(this.taskId, 'debug', 'Erasing flash memory...');

    await serialManager.write(this.connection.deviceId, Buffer.from('ERASE\r\n'));
    await this.waitForResponse('ERASE_OK', 30000);
    
    logger.task(this.taskId, 'debug', 'Flash memory erased');
    this.updateProgress(20, 'Flash erased successfully');
  }

  async writeFirmware(resume = false) {
    if (this.isCancelled) throw new Error('Task cancelled');
    
    this.currentStep = 4;
    logger.task(this.taskId, 'debug', `Writing firmware in ${this.chunkSize} byte chunks...`);

    const totalChunks = Math.ceil(this.firmware.data.length / this.chunkSize);
    this.checkpoint.totalChunks = totalChunks;
    
    const startChunk = resume && this.checkpoint.chunkWritten > 0 ? this.checkpoint.chunkWritten : 0;
    
    if (resume && startChunk > 0) {
      logger.task(this.taskId, 'info', `Resuming write from chunk ${startChunk + 1}/${totalChunks}`);
      this.updateProgress(20 + Math.floor((startChunk / totalChunks) * 60), 
        `Resuming from chunk ${startChunk + 1}/${totalChunks}...`);
    }
    
    for (let i = startChunk; i < totalChunks; i++) {
      if (this.isCancelled) throw new Error('Task cancelled');

      const offset = i * this.chunkSize;
      const chunk = this.firmware.data.slice(offset, offset + this.chunkSize);
      const chunkIndex = i + 1;
      
      const writeProgress = 20 + Math.floor((i / totalChunks) * 60);
      this.updateProgress(writeProgress, `Writing chunk ${chunkIndex}/${totalChunks}...`);

      const header = Buffer.alloc(8);
      header.writeUInt32LE(offset, 0);
      header.writeUInt16LE(chunk.length, 4);
      header.writeUInt16LE(this.crc16(chunk), 6);

      const packet = Buffer.concat([Buffer.from('DATA\r\n'), header, chunk]);
      
      let retryCount = 0;
      const maxRetries = 3;
      let success = false;
      
      while (!success && retryCount < maxRetries) {
        try {
          await serialManager.write(this.connection.deviceId, packet);
          await this.waitForResponse('DATA_OK', 5000);
          success = true;
        } catch (error) {
          retryCount++;
          if (retryCount < maxRetries) {
            logger.task(this.taskId, 'warn', `Chunk ${chunkIndex} write failed, retry ${retryCount}/${maxRetries}...`);
            await this.delay(500);
          } else {
            this.checkpoint.chunkWritten = i;
            await this.saveCheckpoint();
            throw new Error(`Chunk ${chunkIndex} write failed after ${maxRetries} retries`);
          }
        }
      }

      this.checkpoint.chunkWritten = i + 1;
      
      const now = Date.now();
      if (now - this.lastCheckpointSave > this.checkpointInterval) {
        await this.saveCheckpoint();
        this.lastCheckpointSave = now;
      }

      if (i % 10 === 0 || i === totalChunks - 1) {
        logger.task(this.taskId, 'debug', `Written ${chunkIndex}/${totalChunks} chunks (${Math.floor((chunkIndex / totalChunks) * 100)}%)`);
      }
    }

    this.checkpoint.chunkWritten = totalChunks;
    await this.saveCheckpoint();
    
    logger.task(this.taskId, 'debug', 'Firmware write completed');
    this.updateProgress(80, 'Firmware written successfully');
  }

  async verifyFirmware() {
    if (this.isCancelled) throw new Error('Task cancelled');
    
    this.currentStep = 5;
    this.updateProgress(85, 'Verifying firmware...');
    logger.task(this.taskId, 'debug', 'Verifying firmware...');

    const verifyCmd = Buffer.from(`VERIFY:${this.firmware.checksum}\r\n`);
    await serialManager.write(this.connection.deviceId, verifyCmd);
    
    const response = await this.waitForResponse(['VERIFY_OK', 'VERIFY_FAIL'], 10000);
    
    if (response.includes('VERIFY_FAIL')) {
      throw new Error('Firmware verification failed - checksum mismatch');
    }

    logger.task(this.taskId, 'debug', 'Firmware verification passed');
    this.updateProgress(95, 'Verification passed');
  }

  async resetDevice() {
    if (this.isCancelled) return;
    
    this.updateProgress(98, 'Resetting device...');
    logger.task(this.taskId, 'debug', 'Resetting device...');

    try {
      await serialManager.write(this.connection.deviceId, Buffer.from('RESET\r\n'));
      await this.delay(1000);
    } catch (error) {
      logger.task(this.taskId, 'warn', `Reset command failed (device may have disconnected): ${error.message}`);
    }
  }

  async waitForResponse(expectedResponses, timeout) {
    const expected = Array.isArray(expectedResponses) ? expectedResponses : [expectedResponses];
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout waiting for response: ${expected.join(' or ')}`)), timeout);
    });

    const responsePromise = new Promise((resolve) => {
      let buffer = Buffer.alloc(0);
      
      const dataHandler = (data) => {
        buffer = Buffer.concat([buffer, data]);
        const text = buffer.toString('ascii');
        
        for (const expectedResponse of expected) {
          if (text.includes(expectedResponse)) {
            serialManager.onData(this.connection.deviceId, null);
            resolve(text);
            return;
          }
        }
      };

      serialManager.onData(this.connection.deviceId, dataHandler);
    });

    return Promise.race([responsePromise, timeoutPromise]);
  }

  async cleanup() {
    if (this.connection && serialManager.isConnected(this.connection.deviceId)) {
      try {
        await serialManager.disconnect(this.connection.deviceId);
        logger.task(this.taskId, 'debug', 'Serial connection closed');
      } catch (error) {
        logger.task(this.taskId, 'warn', `Failed to close connection: ${error.message}`);
      }
    }
  }

  cancel() {
    this.isCancelled = true;
    this.status = 'cancelled';
    logger.task(this.taskId, 'warn', 'Task cancelled by user');
    this.emit('progress', this.getProgressInfo());
    this.emit('complete', this.getProgressInfo());
  }

  updateProgress(progress, message) {
    this.progress = progress;
    if (message) {
      logger.task(this.taskId, 'debug', message);
    }
    this.emit('progress', this.getProgressInfo());
  }

  crc16(buffer) {
    let crc = 0xFFFF;
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc >>= 1;
          crc ^= 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return crc;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  toJSON() {
    return {
      ...this.getProgressInfo(),
      baudRate: this.baudRate,
      chunkSize: this.chunkSize,
      startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
      endTime: this.endTime ? new Date(this.endTime).toISOString() : null,
      checkpoint: this.checkpoint,
      canResume: this.canResume
    };
  }

  async saveCheckpoint() {
    try {
      if (!fs.existsSync(this.checkpointDir)) {
        fs.mkdirSync(this.checkpointDir, { recursive: true });
      }

      this.checkpoint.lastSavedAt = new Date().toISOString();

      const checkpointData = {
        taskId: this.taskId,
        deviceId: this.deviceId,
        portPath: this.portPath,
        firmware: {
          fileName: this.firmware.fileName,
          filePath: this.firmware.filePath,
          format: this.firmware.format,
          version: this.firmware.version,
          size: this.firmware.size,
          checksum: this.firmware.checksum,
          loadAddress: this.firmware.loadAddress
        },
        baudRate: this.baudRate,
        chunkSize: this.chunkSize,
        status: this.status,
        progress: this.progress,
        startTime: this.startTime,
        checkpoint: this.checkpoint,
        canResume: this.canResume,
        savedAt: this.checkpoint.lastSavedAt
      };

      const checkpointFile = path.join(this.checkpointDir, `${this.taskId}.json`);
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpointData, null, 2));
      
      logger.task(this.taskId, 'debug', `Checkpoint saved at step ${this.checkpoint.step}`);
      return true;
    } catch (error) {
      logger.task(this.taskId, 'error', `Failed to save checkpoint: ${error.message}`);
      return false;
    }
  }

  async deleteCheckpoint() {
    try {
      const checkpointFile = path.join(this.checkpointDir, `${this.taskId}.json`);
      if (fs.existsSync(checkpointFile)) {
        fs.unlinkSync(checkpointFile);
        logger.task(this.taskId, 'debug', 'Checkpoint deleted');
      }
      return true;
    } catch (error) {
      logger.task(this.taskId, 'warn', `Failed to delete checkpoint: ${error.message}`);
      return false;
    }
  }

  static async loadCheckpoint(taskId, checkpointDir) {
    try {
      const checkpointFile = path.join(checkpointDir, `${taskId}.json`);
      if (!fs.existsSync(checkpointFile)) {
        return null;
      }

      const data = fs.readFileSync(checkpointFile, 'utf8');
      const checkpointData = JSON.parse(data);
      
      logger.info(`Checkpoint loaded for task ${taskId}, step: ${checkpointData.checkpoint.step}`);
      return checkpointData;
    } catch (error) {
      logger.error(`Failed to load checkpoint for task ${taskId}: ${error.message}`);
      return null;
    }
  }

  static async listCheckpoints(checkpointDir) {
    try {
      if (!fs.existsSync(checkpointDir)) {
        return [];
      }

      const files = fs.readdirSync(checkpointDir).filter(f => f.endsWith('.json'));
      const checkpoints = [];

      for (const file of files) {
        try {
          const data = fs.readFileSync(path.join(checkpointDir, file), 'utf8');
          const checkpointData = JSON.parse(data);
          checkpoints.push(checkpointData);
        } catch (error) {
          logger.warn(`Failed to read checkpoint file ${file}: ${error.message}`);
        }
      }

      return checkpoints.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } catch (error) {
      logger.error('Failed to list checkpoints:', error);
      return [];
    }
  }

  static createFromCheckpoint(checkpointData, firmwareParser) {
    return new FlashTask({
      taskId: checkpointData.taskId,
      deviceId: checkpointData.deviceId,
      portPath: checkpointData.portPath,
      firmware: checkpointData.firmware,
      baudRate: checkpointData.baudRate,
      chunkSize: checkpointData.chunkSize,
      status: 'paused',
      progress: checkpointData.progress,
      startTime: checkpointData.startTime,
      checkpoint: checkpointData.checkpoint,
      canResume: true
    });
  }
}

module.exports = FlashTask;
