const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

class LogArchiver {
  constructor(logDir, options = {}) {
    this.logDir = logDir;
    this.archiveDir = path.join(logDir, 'archive');
    this.archiveInterval = options.archiveInterval || 60 * 60 * 1000;
    this.maxArchiveAge = options.maxArchiveAge || 7 * 24 * 60 * 60 * 1000;
    this.maxArchiveFiles = options.maxArchiveFiles || 50;
    this.intervalId = null;
    this.isRunning = false;

    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.logDir, this.archiveDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  start() {
    if (this.intervalId) return;
    
    this.isRunning = true;
    this.archiveLogs();
    
    this.intervalId = setInterval(() => {
      this.archiveLogs();
      this.cleanOldArchives();
    }, this.archiveInterval);

    console.log(`[LogArchiver] 日志归档已启动，归档间隔: ${this.archiveInterval / 1000}秒`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    
    return this.archiveLogs();
  }

  async archiveLogs() {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith('.log'));

      const now = Date.now();
      const archived = [];

      for (const file of files) {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        const age = now - stats.mtimeMs;
        const size = stats.size;
        
        if (age > 60 * 60 * 1000 || size > 5 * 1024 * 1024) {
          await this.archiveFile(filePath, file);
          archived.push(file);
        }
      }

      if (archived.length > 0) {
        console.log(`[LogArchiver] 已归档 ${archived.length} 个日志文件`);
      }

      return archived;
    } catch (e) {
      console.error('[LogArchiver] 归档失败:', e.message);
      return [];
    }
  }

  async archiveFile(filePath, fileName) {
    return new Promise((resolve, reject) => {
      const archiveName = `${fileName}.gz`;
      const archivePath = path.join(this.archiveDir, archiveName);

      const readStream = fs.createReadStream(filePath);
      const gzipStream = zlib.createGzip();
      const writeStream = fs.createWriteStream(archivePath);

      readStream
        .pipe(gzipStream)
        .pipe(writeStream)
        .on('finish', () => {
          fs.unlinkSync(filePath);
          resolve(archivePath);
        })
        .on('error', reject);
    });
  }

  cleanOldArchives() {
    try {
      const files = fs.readdirSync(this.archiveDir)
        .filter(f => f.endsWith('.gz'))
        .map(f => {
          const filePath = path.join(this.archiveDir, f);
          const stats = fs.statSync(filePath);
          return { name: f, path: filePath, mtime: stats.mtimeMs, size: stats.size };
        })
        .sort((a, b) => b.mtime - a.mtime);

      const now = Date.now();
      let deleted = 0;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const age = now - file.mtime;
        
        if (i >= this.maxArchiveFiles || age > this.maxArchiveAge) {
          fs.unlinkSync(file.path);
          deleted++;
        }
      }

      if (deleted > 0) {
        console.log(`[LogArchiver] 已清理 ${deleted} 个旧归档文件`);
      }
    } catch (e) {
      console.error('[LogArchiver] 清理旧归档失败:', e.message);
    }
  }

  getStats() {
    try {
      const logFiles = fs.readdirSync(this.logDir).filter(f => f.endsWith('.log'));
      const archiveFiles = fs.readdirSync(this.archiveDir).filter(f => f.endsWith('.gz'));

      const logSize = logFiles.reduce((sum, f) => {
        const filePath = path.join(this.logDir, f);
        return sum + fs.statSync(filePath).size;
      }, 0);

      const archiveSize = archiveFiles.reduce((sum, f) => {
        const filePath = path.join(this.archiveDir, f);
        return sum + fs.statSync(filePath).size;
      }, 0);

      return {
        isRunning: this.isRunning,
        logFiles: logFiles.length,
        logSize: Math.round(logSize / 1024),
        archiveFiles: archiveFiles.length,
        archiveSize: Math.round(archiveSize / 1024),
        archiveDir: this.archiveDir
      };
    } catch (e) {
      return { error: e.message };
    }
  }
}

module.exports = { LogArchiver };
