const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const LOG_NAMES = {
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR'
};

const LOG_COLORS = {
  0: '\x1b[36m',
  1: '\x1b[32m',
  2: '\x1b[33m',
  3: '\x1b[31m'
};

class Logger {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.logLevel = process.env.LOG_LEVEL 
      ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] 
      : LOG_LEVELS.INFO;
  }

  formatMessage(level, message) {
    const timestamp = new Date().toISOString();
    const levelName = LOG_NAMES[level];
    const color = LOG_COLORS[level];
    return `${color}[${timestamp}] [${this.serviceName}] [${levelName}] \x1b[0m${message}`;
  }

  log(level, message, ...args) {
    if (level >= this.logLevel) {
      const formatted = this.formatMessage(level, message);
      if (args.length > 0) {
        console.log(formatted, ...args);
      } else {
        console.log(formatted);
      }
    }
  }

  debug(message, ...args) {
    this.log(LOG_LEVELS.DEBUG, message, ...args);
  }

  info(message, ...args) {
    this.log(LOG_LEVELS.INFO, message, ...args);
  }

  warn(message, ...args) {
    this.log(LOG_LEVELS.WARN, message, ...args);
  }

  error(message, ...args) {
    this.log(LOG_LEVELS.ERROR, message, ...args);
  }
}

module.exports = Logger;
