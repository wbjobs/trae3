const WebSocket = require('ws');
const logger = require('../utils/logger');
const { runQuery } = require('../database');

const VALID_LEVELS = new Set(['debug', 'info', 'warning', 'error', 'critical']);

const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;
const TERMINAL_MESSAGE_RATE = 100;
const TERMINAL_RATE_WINDOW = 1000;

class ConnectionPool {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.connections = new Map();
    this.buckets = [];
    const bucketCount = 16;
    for (let i = 0; i < bucketCount; i++) {
      this.buckets.push(new Map());
    }
  }

  set(terminalId, conn) {
    this.connections.set(terminalId, conn);
    const bucketIndex = this._hash(terminalId);
    this.buckets[bucketIndex].set(terminalId, conn);
  }

  get(terminalId) {
    return this.connections.get(terminalId);
  }

  delete(terminalId) {
    this.connections.delete(terminalId);
    const bucketIndex = this._hash(terminalId);
    this.buckets[bucketIndex].delete(terminalId);
  }

  get size() {
    return this.connections.size;
  }

  forEach(callback) {
    this.connections.forEach(callback);
  }

  keys() {
    return this.connections.keys();
  }

  getBucket(index) {
    return this.buckets[index];
  }

  get bucketCount() {
    return this.buckets.length;
  }

  _hash(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) & 0x7fffffff;
    }
    return hash % this.buckets.length;
  }
}

class RateLimiter {
  constructor(maxPerWindow, windowMs) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
    this.counters = new Map();
  }

  check(key) {
    const now = Date.now();
    const entry = this.counters.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
      return true;
    }

    entry.count++;
    if (entry.count > this.maxPerWindow) {
      return false;
    }
    return true;
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.counters) {
      if (now - entry.windowStart > this.windowMs * 2) {
        this.counters.delete(key);
      }
    }
  }
}

class WebSocketServer {
  constructor({ server, db, logFilter, alertEngine, maxConnections = 50000 }) {
    this.wss = new WebSocket.Server({
      server,
      perMessageDeflate: {
        zlibDeflateOptions: { level: 3 },
        zlibInflateOptions: { chunkSize: 16 * 1024 },
        threshold: 1024,
      },
      maxPayload: 1024 * 1024,
    });
    this.db = db;
    this.logFilter = logFilter;
    this.alertEngine = alertEngine;
    this.maxConnections = maxConnections;
    this.pool = new ConnectionPool(maxConnections);
    this.rateLimiter = new RateLimiter(TERMINAL_MESSAGE_RATE, TERMINAL_RATE_WINDOW);
    this.logQueue = [];
    this.maxQueueSize = 100000;
    this.batchSize = 500;
    this.flushInterval = null;
    this.heartbeatInterval = null;
    this.rateCleanupInterval = null;
    this.isFlushing = false;
    this.droppedCount = 0;
    this.totalReceived = 0;
    this.totalStored = 0;
    this.rateLimitedCount = 0;
  }

  start() {
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

    this.flushInterval = setInterval(() => {
      this.scheduleFlush();
    }, 300);

    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeats();
    }, HEARTBEAT_INTERVAL);

    this.rateCleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60000);

    logger.info(`WebSocket 服务已启动, 最大连接数: ${this.maxConnections}`);
  }

  handleConnection(ws, req) {
    if (this.pool.size >= this.maxConnections) {
      ws.close(1013, '连接数已达上限');
      return;
    }

    const terminalId = this.extractTerminalId(req);
    if (!terminalId) {
      ws.close(1008, '缺少终端ID');
      return;
    }

    const existing = this.pool.get(terminalId);
    if (existing) {
      existing.ws.close(1000, '终端在其它连接重新登录');
    }

    const ip = req.socket.remoteAddress;
    const now = Date.now();

    const conn = {
      ws,
      ip,
      connectedAt: now,
      lastHeartbeat: now,
      isAlive: true,
      messageCount: 0,
    };

    this.pool.set(terminalId, conn);
    this.updateTerminalStatus(terminalId, 'online', ip);

    ws.on('message', (data) => this.handleMessage(terminalId, data, ws));

    ws.on('pong', () => {
      const c = this.pool.get(terminalId);
      if (c) {
        c.isAlive = true;
        c.lastHeartbeat = Date.now();
      }
    });

    ws.on('close', () => {
      this.pool.delete(terminalId);
      this.updateTerminalStatus(terminalId, 'offline');
      logger.info(`终端 ${terminalId} 断开连接, 当前: ${this.pool.size}`);
    });

    ws.on('error', (error) => {
      logger.error(`终端 ${terminalId} 连接错误:`, error.message);
    });

    ws.send(JSON.stringify({ type: 'connected', message: '连接成功' }));
    logger.info(`终端 ${terminalId} 已连接, 当前连接数: ${this.pool.size}`);
  }

  extractTerminalId(req) {
    try {
      const url = new URL(req.url, 'http://localhost');
      return url.searchParams.get('terminalId');
    } catch {
      return null;
    }
  }

  checkHeartbeats() {
    const now = Date.now();
    let staleCount = 0;

    for (let i = 0; i < this.pool.bucketCount; i++) {
      const bucket = this.pool.getBucket(i);
      for (const [terminalId, conn] of bucket) {
        if (!conn.isAlive) {
          staleCount++;
          conn.ws.terminate();
          continue;
        }

        const elapsed = now - conn.lastHeartbeat;
        if (elapsed > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
          conn.isAlive = false;
          conn.ws.ping();
        } else if (elapsed > HEARTBEAT_INTERVAL / 2) {
          conn.ws.ping();
        }
      }
    }

    if (staleCount > 0) {
      logger.info(`清理 ${staleCount} 个僵死连接`);
    }
  }

  handleMessage(terminalId, data, ws) {
    if (!this.rateLimiter.check(terminalId)) {
      this.rateLimitedCount++;
      return;
    }

    try {
      const message = JSON.parse(data.toString());
      const conn = this.pool.get(terminalId);
      if (conn) {
        conn.lastHeartbeat = Date.now();
      }

      switch (message.type) {
        case 'log':
          this.enqueueLog(terminalId, message.data);
          break;
        case 'heartbeat':
          this.sendToTerminal(terminalId, { type: 'heartbeat_ack', timestamp: Date.now() });
          break;
        case 'batch_logs':
          this.handleBatchLogs(terminalId, message.data);
          break;
        default:
          logger.warn(`未知消息类型: ${message.type}`);
      }
    } catch (error) {
      logger.error('解析消息失败:', error.message);
    }
  }

  handleBatchLogs(terminalId, logsData) {
    if (!Array.isArray(logsData)) return;

    const available = this.maxQueueSize - this.logQueue.length;
    if (available <= 0) {
      this.droppedCount += logsData.length;
      return;
    }

    const toEnqueue = logsData.length <= available ? logsData : logsData.slice(-available);
    if (logsData.length > available) {
      this.droppedCount += logsData.length - available;
      logger.warn(`终端 ${terminalId} 批量日志截断, 丢弃 ${logsData.length - available} 条`);
    }

    for (let i = 0; i < toEnqueue.length; i++) {
      this.enqueueLogInternal(terminalId, toEnqueue[i]);
    }
  }

  enqueueLog(terminalId, logData) {
    this.totalReceived++;
    this.enqueueLogInternal(terminalId, logData);
  }

  enqueueLogInternal(terminalId, logData) {
    if (this.logQueue.length >= this.maxQueueSize) {
      this.droppedCount++;
      return;
    }

    const level = (logData.level && VALID_LEVELS.has(logData.level)) ? logData.level : 'info';
    const log = {
      terminalId,
      level,
      module: logData.module || 'default',
      message: logData.message || '',
      metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
      timestamp: logData.timestamp ? new Date(logData.timestamp).toISOString() : new Date().toISOString(),
    };

    if (!this.logFilter.shouldStore(log)) {
      return;
    }

    this.logQueue.push(log);

    if (this.alertEngine) {
      this.alertEngine.checkLog(log);
    }

    if (this.logQueue.length >= this.batchSize && !this.isFlushing) {
      this.scheduleFlush();
    }
  }

  scheduleFlush() {
    if (this.isFlushing || this.logQueue.length === 0) return;
    this.flushLogBuffer();
  }

  async flushLogBuffer() {
    if (this.isFlushing || this.logQueue.length === 0) return;

    this.isFlushing = true;

    const logs = this.logQueue.splice(0, this.batchSize);

    try {
      await this.writeLogsBatch(logs);
      this.totalStored += logs.length;

      this.updateStatistics(logs);
      this.flushAlerts();
    } catch (error) {
      logger.error('批量写入日志失败:', error);
      const reinserted = logs.slice(0, Math.min(logs.length, this.maxQueueSize - this.logQueue.length));
      this.logQueue.unshift(...reinserted);
      this.droppedCount += logs.length - reinserted.length;
    } finally {
      this.isFlushing = false;

      if (this.logQueue.length >= this.batchSize) {
        setImmediate(() => this.scheduleFlush());
      }
    }
  }

  async writeLogsBatch(logs) {
    const CHUNK = 100;
    for (let i = 0; i < logs.length; i += CHUNK) {
      const chunk = logs.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const values = chunk.flatMap(log => [
        log.terminalId,
        log.level,
        log.module,
        log.message,
        log.metadata,
        log.timestamp,
      ]);

      const tableDate = chunk[0].timestamp.split('T')[0];
      const sql = `INSERT INTO logs_${tableDate} (terminal_id, level, module, message, metadata, timestamp) 
                   VALUES ${placeholders}`;
      try {
        await runQuery(sql, values);
      } catch (err) {
        if (err.message && err.message.includes('no such table')) {
          await this.ensureLogTable(tableDate);
          await runQuery(sql, values);
        } else {
          throw err;
        }
      }
    }
  }

  async ensureLogTable(dateStr) {
    await runQuery(`CREATE TABLE IF NOT EXISTS logs_${dateStr} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_id TEXT,
      level TEXT NOT NULL CHECK(level IN ('debug','info','warning','error','critical')),
      module TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_logs_${dateStr}_terminal ON logs_${dateStr}(terminal_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_logs_${dateStr}_level ON logs_${dateStr}(level)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_logs_${dateStr}_timestamp ON logs_${dateStr}(timestamp)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_logs_${dateStr}_term_ts ON logs_${dateStr}(terminal_id, timestamp DESC)`);
    logger.info(`创建日志分区表: logs_${dateStr}`);
  }

  async updateStatistics(logs) {
    const counts = { total: logs.length, debug: 0, info: 0, warning: 0, error: 0, critical: 0 };
    logs.forEach(log => {
      if (counts.hasOwnProperty(log.level)) {
        counts[log.level]++;
      }
    });

    const today = new Date().toISOString().split('T')[0];
    await runQuery(`
      INSERT INTO log_statistics (date, total_logs, debug_logs, info_logs, warning_logs, error_logs, critical_logs)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_logs = total_logs + ?,
        debug_logs = debug_logs + ?,
        info_logs = info_logs + ?,
        warning_logs = warning_logs + ?,
        error_logs = error_logs + ?,
        critical_logs = critical_logs + ?
    `, [today, counts.total, counts.debug, counts.info, counts.warning, counts.error, counts.critical,
        counts.total, counts.debug, counts.info, counts.warning, counts.error, counts.critical]);
  }

  flushAlerts() {
    if (!this.alertEngine) return;
    const pending = this.alertEngine.flushPendingAlerts();
    if (pending.length === 0) return;

    const BATCH = 50;
    for (let i = 0; i < pending.length; i += BATCH) {
      const chunk = pending.slice(i, i + BATCH);
      const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const values = chunk.flatMap(alert => [
        alert.terminalId, alert.type, alert.message, alert.level, alert.ruleName || '',
      ]);
      runQuery(`
        INSERT INTO alerts (terminal_id, type, message, level, rule_name)
        VALUES ${placeholders}
      `, values).catch(err => logger.error('写入告警失败:', err.message));
    }
  }

  async updateTerminalStatus(terminalId, status, ip = null) {
    try {
      const now = new Date().toISOString();
      if (status === 'online') {
        await runQuery(`
          INSERT INTO terminals (id, status, ip_address, last_online, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            status = ?, ip_address = ?, last_online = ?, updated_at = ?
        `, [terminalId, status, ip, now, now, now, status, ip, now, now]);
      } else {
        await runQuery(`UPDATE terminals SET status = ?, updated_at = ? WHERE id = ?`, [status, now, terminalId]);
      }
    } catch (error) {
      logger.error(`更新终端状态失败 ${terminalId}:`, error.message);
    }
  }

  sendToTerminal(terminalId, message) {
    const conn = this.pool.get(terminalId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (let i = 0; i < this.pool.bucketCount; i++) {
      const bucket = this.pool.getBucket(i);
      for (const [, conn] of bucket) {
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.send(data);
        }
      }
    }
  }

  getStats() {
    return {
      connections: this.pool.size,
      queueLength: this.logQueue.length,
      droppedCount: this.droppedCount,
      totalReceived: this.totalReceived,
      totalStored: this.totalStored,
      rateLimitedCount: this.rateLimitedCount,
    };
  }

  shutdown() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.rateCleanupInterval) clearInterval(this.rateCleanupInterval);

    while (this.logQueue.length > 0) {
      this.flushLogBuffer();
    }
    this.wss.close();
    logger.info('WebSocket 服务已关闭');
  }
}

module.exports = { WebSocketServer };