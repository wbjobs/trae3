const winston = require('winston');
const path = require('path');
const fs = require('fs');
const platform = require('../platform/index');

class Logger {
  constructor() {
    this.logger = null;
    this.logDir = null;
    this.initialized = false;
  }

  init() {
    if (this.logger && this.initialized) return this.logger;

    try {
      this.logDir = platform.getLogDirectory('inspection-instrument-config');
    } catch (e) {
      this.logDir = path.join(__dirname, '..', '..', 'logs');
    }

    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    this.logger = winston.createLogger({
      level: 'info',
      format: logFormat,
      transports: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
          maxsize: 5 * 1024 * 1024,
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(this.logDir, 'operation.log'),
          maxsize: 10 * 1024 * 1024,
          maxFiles: 10
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });

    this.initialized = true;
    return this.logger;
  }

  info(message, meta = {}) {
    this.init();
    this.logger.info(message, meta);
  }

  error(message, error = null) {
    this.init();
    if (error instanceof Error) {
      this.logger.error(message, { error: error.message, stack: error.stack });
    } else {
      this.logger.error(message, { error });
    }
  }

  warn(message, meta = {}) {
    this.init();
    this.logger.warn(message, meta);
  }

  debug(message, meta = {}) {
    this.init();
    this.logger.debug(message, meta);
  }

  operation(action, deviceId, params = {}) {
    this.init();
    this.logger.info(`OPERATION: ${action}`, {
      type: 'operation',
      action,
      deviceId,
      params,
      timestamp: new Date().toISOString()
    });
  }

  getLogFiles() {
    this.init();
    if (this.logDir && fs.existsSync(this.logDir)) {
      return fs.readdirSync(this.logDir).filter(f => f.endsWith('.log'));
    }
    return [];
  }

  readLogFile(filename) {
    if (!this.logDir) return [];
    const filePath = path.join(this.logDir, filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    }
    return [];
  }
}

module.exports = new Logger();
