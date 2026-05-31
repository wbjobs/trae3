const fs = require('fs');
const path = require('path');
const crc = require('crc');

class BinParser {
  constructor() {
    this.format = 'bin';
  }

  async parse(filePath) {
    const stats = fs.statSync(filePath);
    const data = fs.readFileSync(filePath);
    
    const checksum = this.getChecksum(data);
    
    const versionFromData = this.extractVersionFromData(data);
    const versionFromFilename = this.extractVersionFromFilename(filePath);
    const version = this.selectBestVersion(versionFromData, versionFromFilename);

    return {
      fileName: path.basename(filePath),
      filePath,
      format: this.format,
      version,
      versionSources: {
        fromData: versionFromData,
        fromFilename: versionFromFilename
      },
      size: stats.size,
      checksum,
      data,
      loadAddress: 0x08000000,
      entryPoint: 0x08000000,
      segments: [{
        address: 0x08000000,
        length: data.length,
        data
      }]
    };
  }

  extractVersionFromData(data) {
    try {
      const searchAreas = [
        { start: 0, length: Math.min(16384, data.length) },
        { start: Math.max(0, data.length - 8192), length: Math.min(8192, data.length) }
      ];

      const patterns = [
        /v?(\d+\.\d+\.\d+)/i,
        /firmware[_\s-]*v?(\d+\.\d+\.\d+)/i,
        /version[_\s-]*v?(\d+\.\d+\.\d+)/i,
        /VER(\d+)(\d+)(\d+)/,
        /FW(\d+)(\d+)(\d+)/,
        /APP(\d+)(\d+)(\d+)/,
        /V(\d)(\d)(\d)/,
        /RELEASE[_\s-]*(\d+\.\d+\.\d+)/i,
        /BUILD[_\s-]*(\d+\.\d+\.\d+)/i
      ];

      for (const area of searchAreas) {
        const textData = data.toString('ascii', area.start, area.start + area.length);
        
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
      }
    } catch (error) {
      console.debug('Error extracting version from data:', error.message);
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
        /(\d+)\.(\d+)\.(\d+)/,
        /firmware[_\s-]*v?(\d+\.\d+\.\d+)/i,
        /release[_\s-]*v?(\d+\.\d+\.\d+)/i
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

  selectBestVersion(fromData, fromFilename) {
    const candidates = [
      { version: fromData, priority: 2, source: 'data' },
      { version: fromFilename, priority: 1, source: 'filename' }
    ].filter(c => c.version && this.isValidVersion(c.version));

    if (candidates.length === 0) {
      return 'unknown';
    }

    if (candidates.length === 1) {
      return candidates[0].version;
    }

    if (fromData === fromFilename) {
      return fromData;
    }

    if (this.isValidVersion(fromData)) {
      return fromData;
    }

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].version;
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

module.exports = BinParser;
