const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

class FirmwareVerifier {
  constructor() {
    this.supportedHashes = ['md5', 'sha1', 'sha256', 'sha512'];
    this.trustedKeys = new Map();
    this.trustedSignatures = new Map();
  }

  async calculateHash(filePath, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
      if (!this.supportedHashes.includes(algorithm)) {
        reject(new Error(`Unsupported hash algorithm: ${algorithm}`));
        return;
      }

      const hash = crypto.createHash(algorithm);
      const stream = fs.createReadStream(filePath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async calculateAllHashes(filePath) {
    const results = {};
    
    for (const algorithm of this.supportedHashes) {
      try {
        results[algorithm] = await this.calculateHash(filePath, algorithm);
      } catch (error) {
        logger.warn(`Failed to calculate ${algorithm} hash: ${error.message}`);
        results[algorithm] = null;
      }
    }
    
    return results;
  }

  calculateBufferHash(buffer, algorithm = 'sha256') {
    if (!this.supportedHashes.includes(algorithm)) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
    
    return crypto.createHash(algorithm).update(buffer).digest('hex');
  }

  async verifyHash(filePath, expectedHash, algorithm = null) {
    let detectedAlgorithm = algorithm || this.detectHashAlgorithm(expectedHash);
    
    if (!detectedAlgorithm) {
      for (const algo of this.supportedHashes) {
        try {
          const actualHash = await this.calculateHash(filePath, algo);
          if (actualHash.toLowerCase() === expectedHash.toLowerCase()) {
            return {
              valid: true,
              algorithm: algo,
              actualHash,
              expectedHash
            };
          }
        } catch (error) {
          continue;
        }
      }
      return {
        valid: false,
        algorithm: 'unknown',
        actualHash: null,
        expectedHash
      };
    }

    const actualHash = await this.calculateHash(filePath, detectedAlgorithm);
    const valid = actualHash.toLowerCase() === expectedHash.toLowerCase();
    
    return {
      valid,
      algorithm: detectedAlgorithm,
      actualHash,
      expectedHash
    };
  }

  detectHashAlgorithm(hash) {
    if (!hash || typeof hash !== 'string') return null;
    
    const hashLengths = {
      32: 'md5',
      40: 'sha1',
      64: 'sha256',
      128: 'sha512'
    };
    
    const cleanHash = hash.replace(/[^a-fA-F0-9]/g, '');
    return hashLengths[cleanHash.length] || null;
  }

  calculateCRC32(buffer) {
    let crc = 0xFFFFFFFF;
    const table = this.getCRC32Table();
    
    for (let i = 0; i < buffer.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xFF];
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  getCRC32Table() {
    if (!this.crc32Table) {
      this.crc32Table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
        }
        this.crc32Table[i] = crc;
      }
    }
    return this.crc32Table;
  }

  verifyCRC32(buffer, expectedCRC) {
    const actualCRC = this.calculateCRC32(buffer);
    const valid = actualCRC === parseInt(expectedCRC);
    
    return {
      valid,
      actualCRC: actualCRC.toString(16).padStart(8, '0'),
      expectedCRC: parseInt(expectedCRC).toString(16).padStart(8, '0')
    };
  }

  verifyFirmwareIntegrity(firmwareInfo) {
    const issues = [];
    const warnings = [];

    if (!firmwareInfo.fileName) {
      issues.push('文件名缺失');
    }

    if (!firmwareInfo.data || firmwareInfo.data.length === 0) {
      issues.push('固件数据为空');
    }

    if (firmwareInfo.data) {
      const minSize = 128;
      const maxSize = 50 * 1024 * 1024;
      
      if (firmwareInfo.data.length < minSize) {
        issues.push(`固件文件过小 (${firmwareInfo.data.length} bytes)`);
      }
      
      if (firmwareInfo.data.length > maxSize) {
        warnings.push(`固件文件较大 (${firmwareInfo.data.length} bytes)`);
      }
    }

    if (firmwareInfo.checksum) {
      const calculatedCRC = this.calculateCRC32(firmwareInfo.data);
      const expectedCRC = parseInt(firmwareInfo.checksum, 16);
      
      if (calculatedCRC !== expectedCRC) {
        warnings.push(`CRC32 校验不匹配: 计算值=${calculatedCRC.toString(16)}, 期望值=${firmwareInfo.checksum}`);
      }
    }

    if (firmwareInfo.segments && firmwareInfo.segments.length > 0) {
      const hasOverlap = this.checkSegmentOverlap(firmwareInfo.segments);
      if (hasOverlap) {
        warnings.push('检测到固件段地址重叠');
      }
      
      const hasLargeGap = this.checkSegmentGaps(firmwareInfo.segments);
      if (hasLargeGap) {
        warnings.push('固件段之间存在较大地址间隙');
      }
    }

    if (firmwareInfo.size && firmwareInfo.data) {
      const headerOverhead = 0;
      if (firmwareInfo.data.length < firmwareInfo.size - 100) {
        warnings.push('声明的文件大小与实际数据大小不匹配');
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
      score: Math.max(0, 100 - issues.length * 20 - warnings.length * 5)
    };
  }

  checkSegmentOverlap(segments) {
    const sorted = [...segments].sort((a, b) => a.address - b.address);
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      const prevEnd = prev.address + (prev.data?.length || prev.length || 0);
      if (curr.address < prevEnd) {
        return true;
      }
    }
    
    return false;
  }

  checkSegmentGaps(segments, maxGap = 0x10000) {
    const sorted = [...segments].sort((a, b) => a.address - b.address);
    
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      
      const prevEnd = prev.address + (prev.data?.length || prev.length || 0);
      const gap = curr.address - prevEnd;
      
      if (gap > maxGap) {
        return true;
      }
    }
    
    return false;
  }

  addTrustedKey(name, publicKey) {
    this.trustedKeys.set(name, publicKey);
    logger.info(`Added trusted key: ${name}`);
  }

  removeTrustedKey(name) {
    this.trustedKeys.delete(name);
    logger.info(`Removed trusted key: ${name}`);
  }

  verifySignature(data, signature, algorithm = 'sha256') {
    for (const [name, publicKey] of this.trustedKeys) {
      try {
        const verify = crypto.createVerify(algorithm);
        verify.update(data);
        
        if (verify.verify(publicKey, signature, 'hex')) {
          return {
            valid: true,
            verifiedBy: name,
            algorithm
          };
        }
      } catch (error) {
        continue;
      }
    }
    
    return {
      valid: false,
      verifiedBy: null,
      algorithm
    };
  }

  addTrustedFirmware(checksum, metadata = {}) {
    this.trustedSignatures.set(checksum, {
      ...metadata,
      addedAt: new Date().toISOString()
    });
    logger.info(`Added trusted firmware: ${checksum} (${metadata.fileName || 'unknown'})`);
  }

  isTrustedFirmware(checksum) {
    return this.trustedSignatures.has(checksum);
  }

  getTrustedFirmwareInfo(checksum) {
    return this.trustedSignatures.get(checksum) || null;
  }

  exportTrustedFirmwareList(filePath) {
    const data = JSON.stringify(Array.from(this.trustedSignatures.entries()), null, 2);
    fs.writeFileSync(filePath, data);
    logger.info(`Exported ${this.trustedSignatures.size} trusted firmware signatures to ${filePath}`);
  }

  importTrustedFirmwareList(filePath) {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Trusted firmware list file not found: ${filePath}`);
      return 0;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const [checksum, metadata] of data) {
      this.trustedSignatures.set(checksum, metadata);
    }
    
    logger.info(`Imported ${data.length} trusted firmware signatures from ${filePath}`);
    return data.length;
  }

  async verifyFirmwareFile(filePath, options = {}) {
    const {
      expectedHash = null,
      expectedCRC = null,
      checkSignature = false,
      checkTrust = false
    } = options;

    const results = {
      filePath,
      fileName: path.basename(filePath),
      timestamp: new Date().toISOString(),
      overall: false,
      checks: {}
    };

    try {
      if (!fs.existsSync(filePath)) {
        results.checks.fileExists = { valid: false, error: '文件不存在' };
        return results;
      }

      const stats = fs.statSync(filePath);
      results.checks.fileExists = { valid: true, size: stats.size };

      const hashes = await this.calculateAllHashes(filePath);
      results.checks.hashes = { valid: true, ...hashes };

      if (expectedHash) {
        const hashResult = await this.verifyHash(filePath, expectedHash);
        results.checks.expectedHash = hashResult;
      }

      if (expectedCRC) {
        const buffer = fs.readFileSync(filePath);
        const crcResult = this.verifyCRC32(buffer, expectedCRC);
        results.checks.expectedCRC = crcResult;
      }

      if (checkTrust) {
        const sha256 = hashes.sha256;
        const isTrusted = this.isTrustedFirmware(sha256);
        results.checks.trust = {
          valid: isTrusted,
          sha256,
          info: this.getTrustedFirmwareInfo(sha256)
        };
      }

      const allValid = Object.values(results.checks).every(
        check => check.valid !== false
      );
      results.overall = allValid;

    } catch (error) {
      results.error = error.message;
      results.overall = false;
    }

    return results;
  }
}

const verifier = new FirmwareVerifier();
module.exports = verifier;
