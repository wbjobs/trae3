const path = require('path');
const fs = require('fs');
const log = require('electron-log');

class Logger {
  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.ensureLogDir();
    this.configureLogger();
    this.taskLogs = new Map();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  configureLogger() {
    const today = new Date().toISOString().split('T')[0];
    
    log.transports.file.level = 'debug';
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
    log.transports.file.maxSize = 10 * 1024 * 1024;
    log.transports.file.file = path.join(this.logDir, `app-${today}.log`);
    log.transports.console.level = 'debug';
    log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
    
    this.logger = log;
  }

  info(message, ...args) {
    this.logger.info(message, ...args);
  }

  warn(message, ...args) {
    this.logger.warn(message, ...args);
  }

  error(message, ...args) {
    this.logger.error(message, ...args);
  }

  debug(message, ...args) {
    this.logger.debug(message, ...args);
  }

  task(taskId, level, message) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      level,
      message,
      timestamp: new Date().toISOString()
    };

    if (!this.taskLogs.has(taskId)) {
      this.taskLogs.set(taskId, []);
    }
    this.taskLogs.get(taskId).push(entry);

    const taskLogPath = path.join(this.logDir, `task-${taskId}.log`);
    const logLine = `[${entry.timestamp}] [${level.toUpperCase()}] ${message}\n`;
    fs.appendFileSync(taskLogPath, logLine);

    this.logger.info(`[Task ${taskId}] ${level}: ${message}`);

    return entry;
  }

  getTaskLogs(taskId) {
    return this.taskLogs.get(taskId) || [];
  }

  queryLogs(options = {}) {
    const { taskId, level, startTime, endTime, limit = 100 } = options;
    let logs = [];

    if (taskId) {
      logs = this.getTaskLogs(taskId);
    } else {
      for (const [, taskLogs] of this.taskLogs) {
        logs = logs.concat(taskLogs);
      }
    }

    if (level) {
      logs = logs.filter(l => l.level === level);
    }

    if (startTime) {
      logs = logs.filter(l => new Date(l.timestamp) >= new Date(startTime));
    }

    if (endTime) {
      logs = logs.filter(l => new Date(l.timestamp) <= new Date(endTime));
    }

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return logs.slice(0, limit);
  }

  exportLogs(taskId, exportPath) {
    const logs = this.getTaskLogs(taskId);
    if (logs.length === 0) {
      throw new Error(`No logs found for task ${taskId}`);
    }

    let content = `Task Logs - Task ID: ${taskId}\n`;
    content += `Generated: ${new Date().toISOString()}\n`;
    content += '='.repeat(80) + '\n\n';

    for (const entry of logs) {
      content += `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}\n`;
    }

    fs.writeFileSync(exportPath, content);
    return exportPath;
  }

  clearLogs() {
    this.taskLogs.clear();
    const files = fs.readdirSync(this.logDir);
    for (const file of files) {
      if (file.endsWith('.log')) {
        try {
          fs.unlinkSync(path.join(this.logDir, file));
        } catch (err) {
          this.logger.warn(`Failed to delete log file ${file}:`, err);
        }
      }
    }
  }

  getLogFilePath() {
    return this.logger.transports.file.getFile().path;
  }
}

const logger = new Logger();
module.exports = logger;
