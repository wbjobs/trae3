const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

class Logger {
  constructor() {
    this.level = config.get('logging.level') || 'info';
    this.logFile = config.get('logging.file');
    this.maxSize = this.parseSize(config.get('logging.maxSize') || '100m');
    this.maxFiles = config.get('logging.maxFiles') || 10;
    this.currentSize = 0;
    this.currentFileIndex = 0;
    
    this.ensureLogDirectory();
    this.checkLogFile();
  }

  parseSize(sizeStr) {
    const match = sizeStr.match(/^(\d+)([kmgt]?)$/i);
    if (!match) return 100 * 1024 * 1024;
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      case 't': return value * 1024 * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  checkLogFile() {
    try {
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        this.currentSize = stats.size;
        
        if (this.currentSize >= this.maxSize) {
          this.rotateLog();
        }
      }
    } catch (error) {
      console.error('[Logger] 检查日志文件失败:', error.message);
    }
  }

  rotateLog() {
    try {
      for (let i = this.maxFiles - 2; i >= 0; i--) {
        const oldPath = i === 0 ? this.logFile : `${this.logFile}.${i}`;
        const newPath = `${this.logFile}.${i + 1}`;
        
        if (fs.existsSync(oldPath)) {
          if (i + 1 < this.maxFiles) {
            fs.renameSync(oldPath, newPath);
          } else {
            fs.unlinkSync(oldPath);
          }
        }
      }
      
      this.currentSize = 0;
    } catch (error) {
      console.error('[Logger] 日志轮转失败:', error.message);
    }
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}\n`;
  }

  log(level, message, meta = {}) {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.level]) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    console.log(formattedMessage.trim());

    try {
      if (this.currentSize + formattedMessage.length > this.maxSize) {
        this.rotateLog();
      }
      
      fs.appendFileSync(this.logFile, formattedMessage, { flag: 'a' });
      this.currentSize += formattedMessage.length;
    } catch (error) {
      console.error('[Logger] 写入日志文件失败:', error.message);
    }
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }

  trace(message, meta = {}) {
    this.log('trace', message, meta);
  }

  setLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      this.level = level;
      this.info(`日志级别已设置为: ${level}`);
    }
  }

  getLevel() {
    return this.level;
  }
}

module.exports = new Logger();