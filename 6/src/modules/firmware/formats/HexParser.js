const fs = require('fs');
const path = require('path');
const intelHex = require('intel-hex');
const crc = require('crc');

class HexParser {
  constructor() {
    this.format = 'hex';
  }

  async parse(filePath) {
    const stats = fs.statSync(filePath);
    const hexContent = fs.readFileSync(filePath, 'utf8');
    
    const parsed = intelHex.parse(hexContent);
    const data = parsed.data;
    const checksum = this.getChecksum(data);
    
    const versionFromData = this.extractVersionFromData(data);
    const versionFromHeader = this.extractVersionFromHeader(hexContent);
    const versionFromFilename = this.extractVersionFromFilename(filePath);
    const version = this.selectBestVersion(versionFromData, versionFromHeader, versionFromFilename);

    const segments = this.extractSegments(hexContent);

    return {
      fileName: path.basename(filePath),
      filePath,
      format: this.format,
      version,
      versionSources: {
        fromData: versionFromData,
        fromHeader: versionFromHeader,
        fromFilename: versionFromFilename
      },
      size: data.length,
      checksum,
      data,
      loadAddress: parsed.startSegmentAddress ? parsed.startSegmentAddress : 0x08000000,
      entryPoint: parsed.startLinearAddress ? parsed.startLinearAddress : 0x08000000,
      segments
    };
  }

  extractSegments(hexContent) {
    const lines = hexContent.split('\n');
    const segments = [];
    let currentAddress = 0;
    let currentData = Buffer.alloc(0);
    let extendedLinearAddress = 0;

    for (const line of lines) {
      if (!line.startsWith(':')) continue;

      const recordType = parseInt(line.substr(7, 2), 16);
      
      if (recordType === 0x00) {
        const address = parseInt(line.substr(3, 4), 16);
        const fullAddress = extendedLinearAddress + address;
        const length = parseInt(line.substr(1, 2), 16);
        const data = Buffer.from(line.substr(9, length * 2), 'hex');

        if (currentData.length === 0) {
          currentAddress = fullAddress;
          currentData = data;
        } else if (fullAddress === currentAddress + currentData.length) {
          currentData = Buffer.concat([currentData, data]);
        } else {
          if (currentData.length > 0) {
            segments.push({
              address: currentAddress,
              length: currentData.length,
              data: currentData
            });
          }
          currentAddress = fullAddress;
          currentData = data;
        }
      } else if (recordType === 0x04) {
        extendedLinearAddress = parseInt(line.substr(9, 4), 16) * 0x10000;
      } else if (recordType === 0x01) {
        if (currentData.length > 0) {
          segments.push({
            address: currentAddress,
            length: currentData.length,
            data: currentData
          });
          currentData = Buffer.alloc(0);
        }
        break;
      }
    }

    if (segments.length === 0 && currentData.length > 0) {
      segments.push({
        address: currentAddress,
        length: currentData.length,
        data: currentData
      });
    }

    return segments;
  }

  extractVersionFromData(data) {
    try {
      const searchLength = Math.min(8192, data.length);
      const textData = data.toString('ascii', 0, searchLength);
      
      const patterns = [
        /v?(\d+\.\d+\.\d+)/i,
        /firmware[_\s-]*v?(\d+\.\d+\.\d+)/i,
        /version[_\s-]*v?(\d+\.\d+\.\d+)/i,
        /VER(\d+)(\d+)(\d+)/,
        /FW(\d+)(\d+)(\d+)/,
        /APP(\d+)(\d+)(\d+)/,
        /V(\d)(\d)(\d)/
      ];

      for (const pattern of patterns) {
        const match = textData.match(pattern);
        if (match) {
          if (match.length === 4 && !isNaN(match[1]) && !isNaN(match[2]) && !isNaN(match[3])) {
            const major = parseInt(match[1]);
            const minor = parseInt(match[2]);
            const patch = parseInt(match[3]);
            if (major >= 0 && major < 100 && minor >= 0 && minor < 100 && patch >= 0 && patch < 100) {
              const version = `${major}.${minor}.${patch}`;
              if (this.isValidVersion(version)) {
                return version;
              }
            }
          }
          
          const version = match[1];
          if (this.isValidVersion(version)) {
            return version;
          }
        }
      }
    } catch (error) {
      console.debug('Error extracting version from data:', error.message);
    }
    
    return null;
  }

  extractVersionFromHeader(hexContent) {
    try {
      const headerLines = hexContent.split('\n').slice(0, 50);
      
      for (const line of headerLines) {
        if (line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) {
          const patterns = [
            /v?(\d+\.\d+\.\d+)/i,
            /version[_\s:]*v?(\d+\.\d+\.\d+)/i,
            /firmware[_\s:]*v?(\d+\.\d+\.\d+)/i
          ];

          for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
              const version = match[1];
              if (this.isValidVersion(version)) {
                return version;
              }
            }
          }
        }
      }
    } catch (error) {
      console.debug('Error extracting version from header:', error.message);
    }
    
    return null;
  }

  extractVersionFromFilename(filePath) {
    try {
      const filename = path.basename(filePath, path.extname(filePath));
      
      const patterns = [
        /v?(\d+\.\d+\.\d+)/i,
        /(\d+\.\d+\.\d+)/,
        /(\d+)_(\d+)_(\d+)/,
        /(\d+)\.(\d+)\.(\d+)/
      ];

      for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
          let version;
          if (match.length === 4 && !isNaN(match[1]) && !isNaN(match[2]) && !isNaN(match[3])) {
            version = `${parseInt(match[1])}.${parseInt(match[2])}.${parseInt(match[3])}`;
          } else {
            version = match[1];
          }
          
          if (this.isValidVersion(version)) {
            return version;
          }
        }
      }
    } catch (error) {
      console.debug('Error extracting version from filename:', error.message);
    }
    
    return null;
  }

  selectBestVersion(fromData, fromHeader, fromFilename) {
    const candidates = [
      { version: fromData, priority: 3, source: 'data' },
      { version: fromHeader, priority: 2, source: 'header' },
      { version: fromFilename, priority: 1, source: 'filename' }
    ].filter(c => c.version && this.isValidVersion(c.version));

    if (candidates.length === 0) {
      return 'unknown';
    }

    candidates.sort((a, b) => {
      if (a.version === b.version) return 0;
      if (this.compareVersions(a.version, b.version) > 0) return -1;
      return 1;
    });

    const byVersion = new Map();
    for (const c of candidates) {
      if (!byVersion.has(c.version)) {
        byVersion.set(c.version, []);
      }
      byVersion.get(c.version).push(c);
    }

    let bestVersion = null;
    let maxSources = 0;

    for (const [version, sources] of byVersion) {
      if (sources.length > maxSources) {
        maxSources = sources.length;
        bestVersion = version;
      }
    }

    if (!bestVersion) {
      candidates.sort((a, b) => b.priority - a.priority);
      bestVersion = candidates[0].version;
    }

    return bestVersion;
  }

  isValidVersion(version) {
    if (!version || typeof version !== 'string') {
      return false;
    }
    
    const semverRegex = /^(\d+)\.(\d+)\.(\d+)$/;
    const match = version.match(semverRegex);
    if (!match) {
      return false;
    }
    
    const major = parseInt(match[1]);
    const minor = parseInt(match[2]);
    const patch = parseInt(match[3]);
    
    return major >= 0 && major < 1000 && 
           minor >= 0 && minor < 1000 && 
           patch >= 0 && patch < 1000;
  }

  compareVersions(v1, v2) {
    const parse = (v) => v.split('.').map(Number);
    const [maj1, min1, pat1] = parse(v1);
    const [maj2, min2, pat2] = parse(v2);
    
    if (maj1 !== maj2) return maj1 - maj2;
    if (min1 !== min2) return min1 - min2;
    return pat1 - pat2;
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

module.exports = HexParser;
