const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../logger');
const BinParser = require('./formats/BinParser');
const HexParser = require('./formats/HexParser');
const ElfParser = require('./formats/ElfParser');
const verifier = require('./FirmwareVerifier');

class FirmwareParser {
  constructor() {
    this.parsers = {
      bin: new BinParser(),
      hex: new HexParser(),
      elf: new ElfParser()
    };
    this.verifier = verifier;
  }

  async parse(filePath, options = {}) {
    const {
      calculateHashes = true,
      verifyIntegrity = true
    } = options;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Firmware file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);
    const parser = this.parsers[ext];

    if (!parser) {
      throw new Error(`Unsupported firmware format: .${ext}. Supported formats: .bin, .hex, .elf`);
    }

    try {
      logger.info(`Parsing firmware file: ${filePath}`);
      const firmware = await parser.parse(filePath);
      
      if (calculateHashes && firmware.data) {
        firmware.hashes = {
          md5: crypto.createHash('md5').update(firmware.data).digest('hex'),
          sha1: crypto.createHash('sha1').update(firmware.data).digest('hex'),
          sha256: crypto.createHash('sha256').update(firmware.data).digest('hex')
        };
        firmware.crc32 = verifier.calculateCRC32(firmware.data).toString(16).padStart(8, '0');
      }

      if (verifyIntegrity) {
        firmware.integrityCheck = verifier.verifyFirmwareIntegrity(firmware);
      }
      
      logger.info(`Firmware parsed successfully: ${firmware.fileName}, version: ${firmware.version}, size: ${firmware.size} bytes`);
      return firmware;
    } catch (error) {
      logger.error(`Failed to parse firmware file ${filePath}:`, error);
      throw error;
    }
  }

  validate(firmware) {
    if (!firmware || !firmware.format) {
      return false;
    }

    const parser = this.parsers[firmware.format];
    if (!parser) {
      logger.warn(`No parser found for format: ${firmware.format}`);
      return false;
    }

    const isValid = parser.validate(firmware);
    logger.debug(`Firmware validation result for ${firmware.fileName}: ${isValid}`);
    return isValid;
  }

  getChecksum(data) {
    const parser = this.parsers.bin;
    return parser.getChecksum(data);
  }

  getSupportedFormats() {
    return Object.keys(this.parsers);
  }

  isSupportedFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase().slice(1);
    return !!this.parsers[ext];
  }

  async parseMultiple(filePaths) {
    const results = [];
    for (const filePath of filePaths) {
      try {
        const firmware = await this.parse(filePath);
        results.push({
          success: true,
          firmware
        });
      } catch (error) {
        results.push({
          success: false,
          filePath,
          error: error.message
        });
      }
    }
    return results;
  }

  compareFirmware(firmware1, firmware2) {
    if (!firmware1 || !firmware2) {
      return false;
    }

    if (firmware1.format !== firmware2.format) {
      return false;
    }

    if (firmware1.size !== firmware2.size) {
      return false;
    }

    if (firmware1.checksum !== firmware2.checksum) {
      return false;
    }

    return firmware1.data.equals(firmware2.data);
  }

  getFirmwareInfo(firmware) {
    return {
      fileName: firmware.fileName,
      filePath: firmware.filePath,
      format: firmware.format,
      version: firmware.version,
      size: firmware.size,
      sizeHuman: this.formatSize(firmware.size),
      checksum: firmware.checksum,
      loadAddress: `0x${firmware.loadAddress.toString(16).toUpperCase()}`,
      entryPoint: firmware.entryPoint ? `0x${firmware.entryPoint.toString(16).toUpperCase()}` : null,
      segments: firmware.segments.length,
      segmentsInfo: firmware.segments.map(s => ({
        address: `0x${s.address.toString(16).toUpperCase()}`,
        length: s.length,
        lengthHuman: this.formatSize(s.length)
      }))
    };
  }

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  createPatch(originalFirmware, newFirmware) {
    if (!originalFirmware || !newFirmware) {
      throw new Error('Both firmware files are required');
    }

    if (originalFirmware.format !== newFirmware.format) {
      throw new Error('Firmware formats must match');
    }

    const patches = [];
    const maxLen = Math.max(originalFirmware.data.length, newFirmware.data.length);
    
    let diffStart = -1;
    for (let i = 0; i < maxLen; i++) {
      const originalByte = i < originalFirmware.data.length ? originalFirmware.data[i] : 0xff;
      const newByte = i < newFirmware.data.length ? newFirmware.data[i] : 0xff;

      if (originalByte !== newByte) {
        if (diffStart === -1) {
          diffStart = i;
        }
      } else if (diffStart !== -1) {
        const patchData = newFirmware.data.slice(diffStart, i);
        patches.push({
          address: originalFirmware.loadAddress + diffStart,
          data: patchData,
          length: patchData.length
        });
        diffStart = -1;
      }
    }

    if (diffStart !== -1) {
      const patchData = newFirmware.data.slice(diffStart);
      patches.push({
        address: originalFirmware.loadAddress + diffStart,
        data: patchData,
        length: patchData.length
      });
    }

    return {
      patches,
      totalChangedBytes: patches.reduce((sum, p) => sum + p.length, 0),
      patchCount: patches.length
    };
  }
}

const firmwareParser = new FirmwareParser();
module.exports = firmwareParser;
