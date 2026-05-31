const os = require('os');
const path = require('path');

class PlatformAdapter {
  constructor() {
    this.platform = os.platform();
    this.isWindows = this.platform === 'win32';
    this.isMac = this.platform === 'darwin';
    this.isLinux = this.platform === 'linux';
  }

  getPlatformName() {
    if (this.isWindows) return 'windows';
    if (this.isMac) return 'macos';
    if (this.isLinux) return 'linux';
    return this.platform;
  }

  normalizePortPath(portPath) {
    if (!portPath) return portPath;
    
    if (this.isWindows) {
      return portPath.toUpperCase();
    }
    return portPath;
  }

  isPortPathValid(portPath) {
    if (!portPath) return false;
    
    if (this.isWindows) {
      return /^COM\d+$/i.test(portPath);
    } else if (this.isMac) {
      return /^\/dev\/(tty|cu)\./.test(portPath);
    } else {
      return /^\/dev\/tty/.test(portPath);
    }
  }

  getDefaultBaudRates() {
    return [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
  }

  getSerialPortOptions(options = {}) {
    const baseOptions = {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
      rtscts: false,
      xon: false,
      xoff: false,
      xany: false
    };

    if (this.isWindows) {
      return {
        ...baseOptions,
        ...options,
        hupcl: options.hupcl !== undefined ? options.hupcl : true
      };
    } else if (this.isMac) {
      return {
        ...baseOptions,
        ...options,
        hupcl: options.hupcl !== undefined ? options.hupcl : false,
        lock: options.lock !== undefined ? options.lock : false
      };
    }

    return { ...baseOptions, ...options };
  }

  getDefaultScanTimeout() {
    if (this.isWindows) return 2000;
    if (this.isMac) return 3000;
    return 2500;
  }

  getDefaultCommandTimeout() {
    if (this.isWindows) return 3000;
    if (this.isMac) return 4000;
    return 3500;
  }

  getDefaultWriteInterval() {
    if (this.isWindows) return 50;
    if (this.isMac) return 80;
    return 60;
  }

  shouldRetryOnError(error) {
    if (!error || !error.message) return false;
    const msg = error.message.toLowerCase();

    if (this.isWindows) {
      return msg.includes('resource busy') ||
             msg.includes('access denied') ||
             msg.includes('unknown error') ||
             msg.includes('operation not supported');
    }

    if (this.isMac) {
      return msg.includes('resource busy') ||
             msg.includes('device not configured') ||
             msg.includes('i/o error') ||
             msg.includes('broken pipe');
    }

    return msg.includes('resource busy') ||
           msg.includes('i/o error');
  }

  getMaxRetries() {
    if (this.isWindows) return 5;
    if (this.isMac) return 4;
    return 3;
  }

  getLogDirectory(appName) {
    const home = os.homedir();
    if (this.isWindows) {
      return path.join(home, 'AppData', 'Roaming', appName, 'logs');
    } else if (this.isMac) {
      return path.join(home, 'Library', 'Logs', appName);
    } else {
      return path.join(home, '.' + appName.toLowerCase(), 'logs');
    }
  }

  getConfigDirectory(appName) {
    const home = os.homedir();
    if (this.isWindows) {
      return path.join(home, 'AppData', 'Roaming', appName);
    } else if (this.isMac) {
      return path.join(home, 'Library', 'Application Support', appName);
    } else {
      return path.join(home, '.' + appName.toLowerCase());
    }
  }

  normalizeDeviceId(deviceId) {
    const id = parseInt(deviceId, 10);
    if (this.isWindows) {
      return Math.max(1, Math.min(255, isNaN(id) ? 1 : id));
    }
    return Math.max(1, Math.min(255, isNaN(id) ? 1 : id));
  }

  formatDate(date) {
    if (this.isWindows) {
      return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    }
    return date.toLocaleString();
  }
}

module.exports = new PlatformAdapter();
module.exports.PlatformAdapter = PlatformAdapter;
