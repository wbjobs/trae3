const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_FILES = 10;
const MAX_LOG_SIZE = 10 * 1024 * 1024;

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

class Logger {
  constructor(name, level = 'info') {
    this.name = name;
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    this.logFile = null;
    this.currentLogSize = 0;
    
    this.ensureLogDir();
    this.rotateLogs();
    this.openLogFile();
  }

  ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }

  rotateLogs() {
    try {
      if (!fs.existsSync(LOG_DIR)) return;

      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse();

      while (files.length >= MAX_LOG_FILES) {
        const oldest = files.pop();
        fs.unlinkSync(path.join(LOG_DIR, oldest));
        console.log(`[Logger] 已删除旧日志: ${oldest}`);
      }
    } catch (e) {
      console.error('[Logger] 日志轮转失败:', e.message);
    }
  }

  openLogFile() {
    try {
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${date}-${this.name}.log`;
      this.logFile = path.join(LOG_DIR, filename);
      
      if (fs.existsSync(this.logFile)) {
        this.currentLogSize = fs.statSync(this.logFile).size;
      } else {
        this.currentLogSize = 0;
      }
    } catch (e) {
      console.error('[Logger] 打开日志文件失败:', e.message);
    }
  }

  checkRotation() {
    if (this.currentLogSize >= MAX_LOG_SIZE) {
      this.rotateLogs();
      this.openLogFile();
    }
  }

  format(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${dataStr}\n`;
  }

  write(level, message, data) {
    if (LOG_LEVELS[level] < this.level) return;

    const logStr = this.format(level, message, data);
    
    console.log(logStr.trim());

    if (this.logFile) {
      try {
        this.checkRotation();
        fs.appendFileSync(this.logFile, logStr);
        this.currentLogSize += Buffer.byteLength(logStr);
      } catch (e) {
        console.error('[Logger] 写入日志失败:', e.message);
      }
    }
  }

  debug(message, data) {
    this.write('debug', message, data);
  }

  info(message, data) {
    this.write('info', message, data);
  }

  warn(message, data) {
    this.write('warn', message, data);
  }

  error(message, data) {
    this.write('error', message, data);
  }
}

module.exports = { Logger, LOG_DIR };
