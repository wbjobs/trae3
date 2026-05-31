const crypto = require('crypto');
const logger = require('./logger');

const DEFAULT_KEY = Buffer.from('0123456789ABCDEF0123456789ABCDEF', 'hex');
const DEFAULT_IV = Buffer.from('0123456789ABCDEF0123456789ABCDEF', 'hex');

class CryptoManager {
  constructor() {
    this.algorithm = 'aes-128-cbc';
    this.key = DEFAULT_KEY;
    this.iv = DEFAULT_IV;
    this.crc32Table = this.generateCRC32Table();
  }

  generateCRC32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      table[i] = crc;
    }
    return table;
  }

  crc32(data) {
    let crc = 0xFFFFFFFF;
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    for (let i = 0; i < buffer.length; i++) {
      crc = (crc >>> 8) ^ this.crc32Table[(crc ^ buffer[i]) & 0xFF];
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  crc32ToBuffer(crc) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(crc, 0);
    return buffer;
  }

  aesEncrypt(data) {
    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
      const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
      return encrypted;
    } catch (error) {
      logger.error('CryptoManager: AES encryption failed', error);
      throw error;
    }
  }

  aesDecrypt(encryptedData) {
    try {
      const buffer = Buffer.isBuffer(encryptedData) ? encryptedData : Buffer.from(encryptedData);
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
      const decrypted = Buffer.concat([decipher.update(buffer), decipher.final()]);
      return decrypted;
    } catch (error) {
      logger.error('CryptoManager: AES decryption failed', error);
      throw error;
    }
  }

  encryptWithCRC(data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const crc = this.crc32(buffer);
    const crcBuffer = this.crc32ToBuffer(crc);
    const combined = Buffer.concat([buffer, crcBuffer]);
    return this.aesEncrypt(combined);
  }

  decryptWithCRC(encryptedData) {
    try {
      const decrypted = this.aesDecrypt(encryptedData);
      
      if (decrypted.length < 4) {
        throw new Error('Decrypted data too short for CRC');
      }
      
      const dataLength = decrypted.length - 4;
      const data = decrypted.slice(0, dataLength);
      const receivedCRC = decrypted.readUInt32BE(dataLength);
      const calculatedCRC = this.crc32(data);
      
      if (receivedCRC !== calculatedCRC) {
        throw new Error(`CRC mismatch: expected 0x${calculatedCRC.toString(16).toUpperCase()}, got 0x${receivedCRC.toString(16).toUpperCase()}`);
      }
      
      return {
        valid: true,
        data,
        crc: receivedCRC
      };
    } catch (error) {
      logger.warn('CryptoManager: CRC validation failed', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  encryptParam(deviceId, paramKey, value) {
    const paramData = {
      deviceId,
      paramKey,
      value,
      timestamp: Date.now()
    };
    
    const json = JSON.stringify(paramData);
    return this.encryptWithCRC(json);
  }

  decryptParam(encryptedData) {
    const result = this.decryptWithCRC(encryptedData);
    if (!result.valid) {
      return result;
    }
    
    try {
      const data = JSON.parse(result.data.toString());
      return {
        valid: true,
        ...data,
        crc: result.crc
      };
    } catch (error) {
      logger.error('CryptoManager: Failed to parse decrypted param', error);
      return {
        valid: false,
        error: 'Parse error: ' + error.message
      };
    }
  }

  generateChecksum(...args) {
    const data = args.map(arg => {
      if (typeof arg === 'number') return arg.toString();
      if (Buffer.isBuffer(arg)) return arg.toString('hex');
      return String(arg);
    }).join('|');
    
    return this.crc32(Buffer.from(data, 'utf8'));
  }

  verifyChecksum(expectedChecksum, ...args) {
    const actual = this.generateChecksum(...args);
    return actual === expectedChecksum;
  }

  signFrame(frameBuffer) {
    const crc = this.crc32(frameBuffer);
    const signedFrame = Buffer.concat([frameBuffer, this.crc32ToBuffer(crc)]);
    return signedFrame;
  }

  verifyFrame(signedFrameBuffer) {
    if (signedFrameBuffer.length < 4) {
      return { valid: false, error: 'Frame too short' };
    }
    
    const frameLength = signedFrameBuffer.length - 4;
    const frame = signedFrameBuffer.slice(0, frameLength);
    const receivedCRC = signedFrameBuffer.readUInt32BE(frameLength);
    const calculatedCRC = this.crc32(frame);
    
    return {
      valid: receivedCRC === calculatedCRC,
      frame,
      receivedCRC,
      calculatedCRC
    };
  }

  generateDeviceAuth(deviceId, secret) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    const signature = this.generateChecksum(deviceId, secret, timestamp, nonce);
    
    return {
      deviceId,
      timestamp,
      nonce,
      signature
    };
  }

  verifyDeviceAuth(auth, secret) {
    const timeDiff = Math.abs(Date.now() - auth.timestamp);
    if (timeDiff > 30000) {
      return { valid: false, error: 'Auth expired' };
    }
    
    const isValid = this.verifyChecksum(auth.signature, auth.deviceId, secret, auth.timestamp, auth.nonce);
    return { valid: isValid };
  }

  setEncryptionKey(keyBuffer) {
    if (keyBuffer.length !== 16) {
      throw new Error('AES-128 key must be exactly 16 bytes');
    }
    this.key = keyBuffer;
    logger.info('CryptoManager: Encryption key updated');
  }

  setIV(ivBuffer) {
    if (ivBuffer.length !== 16) {
      throw new Error('CBC IV must be exactly 16 bytes');
    }
    this.iv = ivBuffer;
    logger.info('CryptoManager: IV updated');
  }

  getAlgorithmInfo() {
    return {
      algorithm: this.algorithm,
      keyLength: this.key.length * 8,
      ivLength: this.iv.length * 8,
      crcBits: 32
    };
  }
}

module.exports = new CryptoManager();
module.exports.CryptoManager = CryptoManager;
