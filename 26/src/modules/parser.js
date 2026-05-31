const crc = require('crc');
const logger = require('./logger');

const PARAM_TYPES = {
  UINT8: 'uint8',
  INT8: 'int8',
  UINT16: 'uint16',
  INT16: 'int16',
  UINT32: 'uint32',
  INT32: 'int32',
  FLOAT: 'float',
  STRING: 'string'
};

const PARAM_CONFIG = {
  deviceId: { type: PARAM_TYPES.UINT16, offset: 0, length: 2, min: 1, max: 255, name: '设备地址' },
  baudRate: { type: PARAM_TYPES.UINT16, offset: 2, length: 2, min: 1200, max: 115200, name: '波特率' },
  sampleRate: { type: PARAM_TYPES.UINT16, offset: 4, length: 2, min: 1, max: 1000, name: '采样频率' },
  threshold: { type: PARAM_TYPES.FLOAT, offset: 6, length: 4, min: 0, max: 100, name: '报警阈值' },
  workMode: { type: PARAM_TYPES.UINT8, offset: 10, length: 1, min: 0, max: 3, name: '工作模式' },
  filterLevel: { type: PARAM_TYPES.UINT8, offset: 11, length: 1, min: 0, max: 5, name: '滤波等级' },
  deviceName: { type: PARAM_TYPES.STRING, offset: 12, length: 16, maxLength: 15, name: '设备名称' },
  calibrationDate: { type: PARAM_TYPES.UINT32, offset: 28, length: 4, name: '校准日期' },
  firmwareVersion: { type: PARAM_TYPES.UINT16, offset: 32, length: 2, name: '固件版本' }
};

const COMMANDS = {
  READ: 0x03,
  WRITE: 0x06,
  READ_ALL: 0x01,
  WRITE_ALL: 0x10,
  RESET: 0x0A,
  PING: 0x00
};

const FRAME_HEADER = [0xAA, 0x55];
const MIN_FRAME_LENGTH = 9;
const MAX_FRAME_LENGTH = 1024;

class ParameterParser {
  constructor() {
    this.paramConfig = PARAM_CONFIG;
    this.commandSet = COMMANDS;
    this.frameHeader = Buffer.from(FRAME_HEADER);
  }

  validateParam(key, value) {
    const config = this.paramConfig[key];
    if (!config) {
      return { valid: false, error: `未知参数: ${key}` };
    }

    if (value === null || value === undefined || value === '') {
      return { valid: false, error: `${config.name}不能为空` };
    }

    switch (config.type) {
      case PARAM_TYPES.UINT8:
      case PARAM_TYPES.UINT16:
      case PARAM_TYPES.UINT32:
        if (!Number.isInteger(Number(value))) {
          return { valid: false, error: `${config.name}必须是整数` };
        }
        break;
      case PARAM_TYPES.INT8:
      case PARAM_TYPES.INT16:
      case PARAM_TYPES.INT32:
        if (!Number.isInteger(Number(value))) {
          return { valid: false, error: `${config.name}必须是整数` };
        }
        break;
      case PARAM_TYPES.FLOAT:
        if (isNaN(parseFloat(value))) {
          return { valid: false, error: `${config.name}必须是数字` };
        }
        break;
      case PARAM_TYPES.STRING:
        if (config.maxLength && String(value).length > config.maxLength) {
          return { valid: false, error: `${config.name}长度不能超过${config.maxLength}字符` };
        }
        break;
    }

    if (config.min !== undefined && Number(value) < config.min) {
      return { valid: false, error: `${config.name}不能小于${config.min}` };
    }

    if (config.max !== undefined && Number(value) > config.max) {
      return { valid: false, error: `${config.name}不能大于${config.max}` };
    }

    return { valid: true };
  }

  validateAllParams(params) {
    const errors = [];
    for (const [key, value] of Object.entries(params)) {
      const result = this.validateParam(key, value);
      if (!result.valid) {
        errors.push(result.error);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  encodeValue(value, type) {
    const buf = Buffer.alloc(4);
    switch (type) {
      case PARAM_TYPES.UINT8:
        buf.writeUInt8(Number(value), 0);
        return buf.slice(0, 1);
      case PARAM_TYPES.INT8:
        buf.writeInt8(Number(value), 0);
        return buf.slice(0, 1);
      case PARAM_TYPES.UINT16:
        buf.writeUInt16BE(Number(value), 0);
        return buf.slice(0, 2);
      case PARAM_TYPES.INT16:
        buf.writeInt16BE(Number(value), 0);
        return buf.slice(0, 2);
      case PARAM_TYPES.UINT32:
        buf.writeUInt32BE(Number(value), 0);
        return buf.slice(0, 4);
      case PARAM_TYPES.INT32:
        buf.writeInt32BE(Number(value), 0);
        return buf.slice(0, 4);
      case PARAM_TYPES.FLOAT:
        buf.writeFloatBE(parseFloat(value), 0);
        return buf.slice(0, 4);
      case PARAM_TYPES.STRING:
        const strBuf = Buffer.alloc(16);
        strBuf.write(String(value), 0, 'utf8');
        return strBuf;
      default:
        return Buffer.alloc(0);
    }
  }

  decodeValue(buffer, type, offset = 0, length = 4) {
    if (!buffer || buffer.length < offset + 1) {
      throw new Error(`Buffer too short for ${type} at offset ${offset}`);
    }

    switch (type) {
      case PARAM_TYPES.UINT8:
        return buffer.readUInt8(offset);
      case PARAM_TYPES.INT8:
        return buffer.readInt8(offset);
      case PARAM_TYPES.UINT16:
        if (buffer.length < offset + 2) throw new Error('Buffer too short for UINT16');
        return buffer.readUInt16BE(offset);
      case PARAM_TYPES.INT16:
        if (buffer.length < offset + 2) throw new Error('Buffer too short for INT16');
        return buffer.readInt16BE(offset);
      case PARAM_TYPES.UINT32:
        if (buffer.length < offset + 4) throw new Error('Buffer too short for UINT32');
        return buffer.readUInt32BE(offset);
      case PARAM_TYPES.INT32:
        if (buffer.length < offset + 4) throw new Error('Buffer too short for INT32');
        return buffer.readInt32BE(offset);
      case PARAM_TYPES.FLOAT:
        if (buffer.length < offset + 4) throw new Error('Buffer too short for FLOAT');
        return buffer.readFloatBE(offset);
      case PARAM_TYPES.STRING:
        const end = Math.min(offset + length, buffer.length);
        return buffer.toString('utf8', offset, end).replace(/\0/g, '');
      default:
        return null;
    }
  }

  buildFrame(deviceId, command, data) {
    if (deviceId < 1 || deviceId > 255) {
      throw new Error(`Invalid deviceId: ${deviceId}, must be 1-255`);
    }

    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    const header = Buffer.from(FRAME_HEADER);
    const deviceIdBuf = Buffer.alloc(2);
    deviceIdBuf.writeUInt16BE(deviceId, 0);
    const commandBuf = Buffer.alloc(1);
    commandBuf.writeUInt8(command, 0);
    const lengthBuf = Buffer.alloc(2);
    lengthBuf.writeUInt16BE(dataBuffer.length, 0);

    const frameWithoutCrc = Buffer.concat([header, deviceIdBuf, commandBuf, lengthBuf, dataBuffer]);
    const crcValue = crc.crc16modbus(frameWithoutCrc);
    const crcBuf = Buffer.alloc(2);
    crcBuf.writeUInt16LE(crcValue, 0);

    return Buffer.concat([frameWithoutCrc, crcBuf]);
  }

  findFrameHeader(buffer, startOffset = 0) {
    for (let i = startOffset; i < buffer.length - 1; i++) {
      if (buffer[i] === FRAME_HEADER[0] && buffer[i + 1] === FRAME_HEADER[1]) {
        return i;
      }
    }
    return -1;
  }

  parseFrame(buffer) {
    if (!buffer || buffer.length < MIN_FRAME_LENGTH) {
      return { 
        valid: false, 
        error: `数据帧长度不足 (${buffer ? buffer.length : 0} < ${MIN_FRAME_LENGTH})`,
        needsMoreData: true
      };
    }

    let headerOffset = this.findFrameHeader(buffer);
    if (headerOffset === -1) {
      return { 
        valid: false, 
        error: '未找到帧头',
        discardBytes: buffer.length
      };
    }

    if (headerOffset > 0) {
      logger.debug(`Parser: Found frame header at offset ${headerOffset}, discarding ${headerOffset} leading bytes`);
    }

    const frameStart = headerOffset;
    const remainingBytes = buffer.length - frameStart;

    if (remainingBytes < 7) {
      return { 
        valid: false, 
        error: '帧头后数据不足',
        needsMoreData: true,
        headerOffset
      };
    }

    const frameBuffer = buffer.slice(frameStart);

    try {
      const deviceId = frameBuffer.readUInt16BE(2);
      const command = frameBuffer.readUInt8(4);
      const length = frameBuffer.readUInt16BE(5);

      if (length < 0 || length > MAX_FRAME_LENGTH - 9) {
        logger.warn(`Parser: Invalid data length ${length}, searching for next frame header`);
        const nextHeader = this.findFrameHeader(buffer, frameStart + 2);
        if (nextHeader !== -1) {
          return {
            valid: false,
            error: `无效的数据长度 ${length}, 尝试重新同步`,
            discardBytes: nextHeader
          };
        }
        return { 
          valid: false, 
          error: `数据长度无效: ${length}`,
          discardBytes: frameStart + 2
        };
      }

      const expectedLength = 7 + length + 2;

      if (frameBuffer.length < expectedLength) {
        return { 
          valid: false, 
          error: `数据帧不完整 (${frameBuffer.length} < ${expectedLength})`,
          needsMoreData: true,
          headerOffset,
          expectedLength,
          deviceId,
          command,
          dataLength: length
        };
      }

      const frameWithoutCrc = frameBuffer.slice(0, expectedLength - 2);
      const receivedCrc = frameBuffer.readUInt16LE(expectedLength - 2);
      const calculatedCrc = crc.crc16modbus(frameWithoutCrc);

      if (receivedCrc !== calculatedCrc) {
        logger.error(`CRC校验失败: 接收=0x${receivedCrc.toString(16).toUpperCase()}, 计算=0x${calculatedCrc.toString(16).toUpperCase()}`);
        
        const nextHeader = this.findFrameHeader(buffer, frameStart + 2);
        if (nextHeader !== -1) {
          logger.debug(`Parser: CRC error, found next header at offset ${nextHeader}`);
          return {
            valid: false,
            error: 'CRC校验失败，已重新同步帧头',
            discardBytes: nextHeader,
            crcError: true
          };
        }

        return { 
          valid: false, 
          error: 'CRC校验失败',
          crcError: true,
          discardBytes: frameStart + 2,
          receivedCrc,
          calculatedCrc
        };
      }

      const data = frameBuffer.slice(7, 7 + length);
      const rawFrame = frameBuffer.slice(0, expectedLength);

      if (deviceId < 1 || deviceId > 255) {
        logger.warn(`Parser: Invalid deviceId ${deviceId} in frame`);
        const nextHeader = this.findFrameHeader(buffer, frameStart + 2);
        return {
          valid: false,
          error: `无效的设备ID: ${deviceId}`,
          discardBytes: nextHeader !== -1 ? nextHeader : frameStart + 2
        };
      }

      return {
        valid: true,
        deviceId,
        command,
        length,
        data,
        rawBuffer: rawFrame,
        frameStart,
        totalConsumed: frameStart + expectedLength
      };

    } catch (error) {
      logger.error('Parser: Frame parsing exception', error);
      const nextHeader = this.findFrameHeader(buffer, frameStart + 2);
      return {
        valid: false,
        error: `解析异常: ${error.message}`,
        discardBytes: nextHeader !== -1 ? nextHeader : buffer.length
      };
    }
  }

  parseAllFrames(buffer) {
    const results = [];
    let remainingBuffer = buffer;
    let maxIterations = 100;
    let iterations = 0;

    while (remainingBuffer.length > 0 && iterations < maxIterations) {
      iterations++;
      
      const result = this.parseFrame(remainingBuffer);

      if (result.valid) {
        results.push(result);
        if (result.totalConsumed !== undefined && result.totalConsumed < remainingBuffer.length) {
          remainingBuffer = remainingBuffer.slice(result.totalConsumed);
        } else {
          break;
        }
      } else if (result.needsMoreData) {
        results.push(result);
        break;
      } else if (result.discardBytes !== undefined && result.discardBytes > 0) {
        const discard = Math.min(result.discardBytes, remainingBuffer.length);
        logger.debug(`Parser: Discarding ${discard} bytes to resync`);
        remainingBuffer = remainingBuffer.slice(discard);
        if (!result.valid) {
          results.push(result);
        }
      } else {
        results.push(result);
        break;
      }
    }

    if (iterations >= maxIterations) {
      logger.warn('Parser: Max iterations reached in parseAllFrames');
    }

    return results;
  }

  extractValidFrame(buffer) {
    const results = this.parseAllFrames(buffer);
    const validFrames = results.filter(r => r.valid);
    
    if (validFrames.length > 0) {
      return validFrames[0];
    }

    for (const result of results) {
      if (result.needsMoreData) {
        return result;
      }
    }

    return results.length > 0 ? results[0] : { valid: false, error: '无法解析数据' };
  }

  buildReadCommand(deviceId, paramKey) {
    const config = this.paramConfig[paramKey];
    if (!config) {
      throw new Error(`未知参数: ${paramKey}`);
    }

    const data = Buffer.alloc(3);
    data.writeUInt8(config.offset, 0);
    data.writeUInt8(config.length, 1);
    data.writeUInt8(0, 2);

    return this.buildFrame(deviceId, COMMANDS.READ, data);
  }

  buildReadAllCommand(deviceId) {
    const data = Buffer.alloc(4);
    data.writeUInt16BE(0, 0);
    data.writeUInt16BE(64, 2);
    return this.buildFrame(deviceId, COMMANDS.READ_ALL, data);
  }

  buildWriteCommand(deviceId, paramKey, value) {
    const config = this.paramConfig[paramKey];
    if (!config) {
      throw new Error(`未知参数: ${paramKey}`);
    }

    const validation = this.validateParam(paramKey, value);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const encodedValue = this.encodeValue(value, config.type);
    const data = Buffer.alloc(1 + encodedValue.length);
    data.writeUInt8(config.offset, 0);
    encodedValue.copy(data, 1);

    return this.buildFrame(deviceId, COMMANDS.WRITE, data);
  }

  buildWriteAllCommand(deviceId, params) {
    const validation = this.validateAllParams(params);
    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }

    let data = Buffer.alloc(0);

    for (const [key, value] of Object.entries(params)) {
      const config = this.paramConfig[key];
      if (config) {
        const encodedValue = this.encodeValue(value, config.type);
        const entry = Buffer.alloc(1 + encodedValue.length);
        entry.writeUInt8(config.offset, 0);
        encodedValue.copy(entry, 1);
        data = Buffer.concat([data, entry]);
      }
    }

    return this.buildFrame(deviceId, COMMANDS.WRITE_ALL, data);
  }

  buildPingCommand(deviceId) {
    return this.buildFrame(deviceId, COMMANDS.PING, Buffer.alloc(0));
  }

  buildResetCommand(deviceId) {
    return this.buildFrame(deviceId, COMMANDS.RESET, Buffer.alloc(0));
  }

  parseReadResponse(response) {
    const frame = this.extractValidFrame(response);
    if (!frame.valid) {
      return frame;
    }

    if (frame.data.length < 1) {
      return { valid: false, error: '响应数据长度不足' };
    }

    try {
      const offset = frame.data.readUInt8(0);
      const valueData = frame.data.slice(1);

      let paramKey = null;
      for (const [key, config] of Object.entries(this.paramConfig)) {
        if (config.offset === offset) {
          paramKey = key;
          break;
        }
      }

      if (!paramKey) {
        return { valid: false, error: `未知参数偏移量: ${offset}` };
      }

      const config = this.paramConfig[paramKey];
      const value = this.decodeValue(valueData, config.type, 0, config.length);

      return {
        valid: true,
        paramKey,
        value,
        name: config.name,
        deviceId: frame.deviceId
      };
    } catch (error) {
      logger.error('Parser: Error parsing read response', error);
      return { valid: false, error: `解析响应失败: ${error.message}` };
    }
  }

  parseReadAllResponse(response) {
    const frame = this.extractValidFrame(response);
    if (!frame.valid) {
      return frame;
    }

    const params = {};
    const data = frame.data;

    for (const [key, config] of Object.entries(this.paramConfig)) {
      try {
        if (config.offset + config.length <= data.length) {
          params[key] = this.decodeValue(data, config.type, config.offset, config.length);
        }
      } catch (e) {
        logger.warn(`解析参数 ${key} 失败`, { error: e.message });
      }
    }

    return {
      valid: true,
      params,
      deviceId: frame.deviceId
    };
  }

  parseWriteResponse(response) {
    const frame = this.extractValidFrame(response);
    if (!frame.valid) {
      return frame;
    }

    if (frame.data.length < 2) {
      return { valid: false, error: '写入响应数据长度不足' };
    }

    try {
      const status = frame.data.readUInt8(0);
      const offset = frame.data.readUInt8(1);

      return {
        valid: true,
        success: status === 0,
        offset,
        deviceId: frame.deviceId,
        message: status === 0 ? '写入成功' : '写入失败'
      };
    } catch (error) {
      logger.error('Parser: Error parsing write response', error);
      return { valid: false, error: `解析写入响应失败: ${error.message}` };
    }
  }

  parsePingResponse(response) {
    const frame = this.extractValidFrame(response);
    if (!frame.valid) {
      return frame;
    }

    return {
      valid: true,
      deviceId: frame.deviceId,
      online: true,
      command: frame.command
    };
  }

  getParamConfig() {
    return this.paramConfig;
  }

  getParamList() {
    return Object.entries(this.paramConfig).map(([key, config]) => ({
      key,
      name: config.name,
      type: config.type,
      min: config.min,
      max: config.max,
      maxLength: config.maxLength,
      offset: config.offset,
      length: config.length
    }));
  }

  getCommandName(commandCode) {
    for (const [name, code] of Object.entries(COMMANDS)) {
      if (code === commandCode) {
        return name;
      }
    }
    return `0x${commandCode.toString(16)}`;
  }
}

module.exports = new ParameterParser();
module.exports.PARAM_TYPES = PARAM_TYPES;
module.exports.COMMANDS = COMMANDS;
module.exports.PARAM_CONFIG = PARAM_CONFIG;
module.exports.FRAME_HEADER = FRAME_HEADER;
module.exports.MIN_FRAME_LENGTH = MIN_FRAME_LENGTH;
module.exports.MAX_FRAME_LENGTH = MAX_FRAME_LENGTH;
