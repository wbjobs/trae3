const fs = require('fs');
const path = require('path');
const crc = require('crc');

const ELF_MAGIC = 0x7f454c46;
const ELFCLASS32 = 1;
const ELFCLASS64 = 2;
const PT_LOAD = 1;

class ElfParser {
  constructor() {
    this.format = 'elf';
  }

  async parse(filePath) {
    const stats = fs.statSync(filePath);
    const data = fs.readFileSync(filePath);
    
    const elfHeader = this.parseElfHeader(data);
    const segments = this.parseProgramHeaders(data, elfHeader);
    const firmwareData = this.extractFirmwareData(segments);
    
    const checksum = this.getChecksum(firmwareData);
    const version = this.extractVersion(data);

    return {
      fileName: path.basename(filePath),
      filePath,
      format: this.format,
      version,
      size: firmwareData.length,
      checksum,
      data: firmwareData,
      loadAddress: elfHeader.entry,
      entryPoint: elfHeader.entry,
      segments: segments.map(s => ({
        address: s.paddr,
        length: s.filesz,
        data: data.slice(s.offset, s.offset + s.filesz)
      })).filter(s => s.length > 0)
    };
  }

  parseElfHeader(data) {
    const magic = data.readUInt32BE(0);
    if (magic !== ELF_MAGIC) {
      throw new Error('Invalid ELF file');
    }

    const eiClass = data.readUInt8(4);
    const is64Bit = eiClass === ELFCLASS64;

    let offset;
    if (is64Bit) {
      offset = {
        e_type: 16,
        e_machine: 18,
        e_version: 20,
        e_entry: 24,
        e_phoff: 32,
        e_shoff: 40,
        e_flags: 48,
        e_ehsize: 52,
        e_phentsize: 54,
        e_phnum: 56
      };
    } else {
      offset = {
        e_type: 16,
        e_machine: 18,
        e_version: 20,
        e_entry: 24,
        e_phoff: 28,
        e_shoff: 32,
        e_flags: 36,
        e_ehsize: 40,
        e_phentsize: 42,
        e_phnum: 44
      };
    }

    return {
      is64Bit,
      type: data.readUInt16LE(offset.e_type),
      machine: data.readUInt16LE(offset.e_machine),
      entry: is64Bit ? Number(data.readBigUInt64LE(offset.e_entry)) : data.readUInt32LE(offset.e_entry),
      phoff: is64Bit ? Number(data.readBigUInt64LE(offset.e_phoff)) : data.readUInt32LE(offset.e_phoff),
      phentsize: data.readUInt16LE(offset.e_phentsize),
      phnum: data.readUInt16LE(offset.e_phnum)
    };
  }

  parseProgramHeaders(data, elfHeader) {
    const segments = [];

    for (let i = 0; i < elfHeader.phnum; i++) {
      const headerOffset = elfHeader.phoff + i * elfHeader.phentsize;
      
      let segment;
      if (elfHeader.is64Bit) {
        segment = {
          type: data.readUInt32LE(headerOffset),
          flags: data.readUInt32LE(headerOffset + 4),
          offset: Number(data.readBigUInt64LE(headerOffset + 8)),
          vaddr: Number(data.readBigUInt64LE(headerOffset + 16)),
          paddr: Number(data.readBigUInt64LE(headerOffset + 24)),
          filesz: Number(data.readBigUInt64LE(headerOffset + 32)),
          memsz: Number(data.readBigUInt64LE(headerOffset + 40)),
          align: Number(data.readBigUInt64LE(headerOffset + 48))
        };
      } else {
        segment = {
          type: data.readUInt32LE(headerOffset),
          offset: data.readUInt32LE(headerOffset + 4),
          vaddr: data.readUInt32LE(headerOffset + 8),
          paddr: data.readUInt32LE(headerOffset + 12),
          filesz: data.readUInt32LE(headerOffset + 16),
          memsz: data.readUInt32LE(headerOffset + 20),
          flags: data.readUInt32LE(headerOffset + 24),
          align: data.readUInt32LE(headerOffset + 28)
        };
      }

      if (segment.type === PT_LOAD && segment.filesz > 0) {
        segments.push(segment);
      }
    }

    return segments;
  }

  extractFirmwareData(segments) {
    if (segments.length === 0) {
      return Buffer.alloc(0);
    }

    segments.sort((a, b) => a.paddr - b.paddr);

    const startAddr = segments[0].paddr;
    const endAddr = segments[segments.length - 1].paddr + segments[segments.length - 1].filesz;
    const totalSize = endAddr - startAddr;

    const firmwareData = Buffer.alloc(totalSize, 0xff);

    for (const segment of segments) {
      const offset = segment.paddr - startAddr;
      const segmentData = Buffer.alloc(segment.filesz, 0xff);
      firmwareData.fill(segmentData, offset, offset + segment.filesz);
    }

    return firmwareData;
  }

  extractVersion(data) {
    const textData = data.toString('ascii');
    const versionPatterns = [
      /v?(\d+\.\d+\.\d+)/i,
      /firmware.*?(\d+\.\d+\.\d+)/i,
      /version.*?(\d+\.\d+\.\d+)/i,
      /VER(\d+)(\d+)(\d+)/
    ];

    for (const pattern of versionPatterns) {
      const match = textData.match(pattern);
      if (match) {
        if (match.length === 4 && !isNaN(match[1])) {
          return `${match[1]}.${match[2]}.${match[3]}`;
        }
        return match[1];
      }
    }

    return 'unknown';
  }

  getChecksum(data) {
    return crc.crc32(data).toString(16).toUpperCase().padStart(8, '0');
  }

  validate(firmware) {
    if (!firmware || !firmware.data || firmware.data.length === 0) {
      return false;
    }

    const calculatedChecksum = this.getChecksum(firmware.data);
    return calculatedChecksum === firmware.checksum;
  }
}

module.exports = ElfParser;
