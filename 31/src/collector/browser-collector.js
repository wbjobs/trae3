const { v4: uuidv4 } = require('uuid');
const LogCompressor = require('./log-compressor');

class BrowserCollector {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || 'ws://localhost:3200/ws/log-trace';
    this.terminalId = options.terminalId || `browser-${uuidv4().slice(0, 8)}`;
    this.terminalType = 'browser';
    this.ws = null;
    this.queue = [];
    this.flushInterval = options.flushInterval || 5000;
    this.batchSize = options.batchSize || 50;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectDelay = options.reconnectDelay || 3000;
    this.listeners = {};
    this._flushTimer = null;
    this._heartbeatTimer = null;
    this._heartbeatInterval = options.heartbeatInterval || 10000;
    this._connected = false;
    this._connecting = false;
    this._reconnectTimer = null;
    this._pendingAcks = new Map();
    this._ackTimeout = options.ackTimeout || 10000;
    this._maxQueueSize = options.maxQueueSize || 5000;
    this._enableCompression = options.enableCompression !== false;
    this._compressionStats = {
      totalBatches: 0,
      compressedBatches: 0,
      totalOriginalBytes: 0,
      totalCompressedBytes: 0,
    };
  }

  on(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(h => h(data));
  }

  connect() {
    if (this._connecting) return Promise.resolve();
    this._connecting = true;

    return new Promise((resolve, reject) => {
      try {
        this._cleanupWebSocket();

        const WebSocket = require('ws');
        const ws = new WebSocket(this.wsUrl);
        this.ws = ws;

        ws.on('open', () => {
          this._connected = true;
          this._connecting = false;
          this.reconnectAttempts = 0;
          this._startFlush();
          this._startHeartbeat();
          this._emit('connected', { terminalId: this.terminalId, type: this.terminalType });
          this._register();
          resolve();
        });

        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(raw.toString());
            this._handleServerMessage(msg);
          } catch (_) {}
        });

        ws.on('close', () => {
          if (this.ws !== ws) return;
          this._connected = false;
          this._connecting = false;
          this._stopFlush();
          this._stopHeartbeat();
          this._failPendingAcks();
          this._emit('disconnected', { terminalId: this.terminalId });
          this._attemptReconnect();
        });

        ws.on('error', (err) => {
          this._connecting = false;
          this._emit('error', { terminalId: this.terminalId, error: err.message });
          if (!this._connected) {
            reject(err);
          }
        });

        ws.on('pong', () => {
          this._emit('heartbeat_ack', { terminalId: this.terminalId, ts: Date.now() });
        });
      } catch (err) {
        this._connecting = false;
        reject(err);
      }
    });
  }

  _cleanupWebSocket() {
    if (this.ws) {
      const oldWs = this.ws;
      oldWs.removeAllListeners();
      if (oldWs.readyState === 1 || oldWs.readyState === 0) {
        try { oldWs.close(1000, 'replacing'); } catch (_) {}
      }
      this.ws = null;
    }
  }

  _register() {
    this._send({
      type: 'register',
      terminalId: this.terminalId,
      terminalType: this.terminalType,
      timestamp: Date.now(),
    });
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this._connected) return;
      this._send({
        type: 'heartbeat',
        terminalId: this.terminalId,
        timestamp: Date.now(),
      });
    }, this._heartbeatInterval);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _handleServerMessage(msg) {
    if (msg.type === 'trace_query') {
      this._emit('trace_query', msg);
    } else if (msg.type === 'heartbeat_ack') {
      this._emit('heartbeat_ack', msg);
    } else if (msg.type === 'command') {
      this._emit('command', msg);
    } else if (msg.type === 'log_batch_ack') {
      this._resolvePendingAck(msg);
    }
  }

  _resolvePendingAck(msg) {
    const terminalId = msg.terminalId;
    if (this._pendingAcks.has(terminalId)) {
      const pending = this._pendingAcks.get(terminalId);
      if (pending.batchId === msg.batchId) {
        clearTimeout(pending.timer);
        this._pendingAcks.delete(terminalId);
      }
    }
  }

  _failPendingAcks() {
    this._pendingAcks.forEach((pending) => {
      clearTimeout(pending.timer);
      for (const log of pending.logs) {
        this.queue.unshift(log);
      }
    });
    this._pendingAcks.clear();

    if (this.queue.length > this._maxQueueSize) {
      this.queue = this.queue.slice(-this._maxQueueSize);
    }
  }

  _attemptReconnect() {
    if (this._reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this._emit('reconnect_failed', { terminalId: this.terminalId });
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 60000);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._emit('reconnecting', { terminalId: this.terminalId, attempt: this.reconnectAttempts });
      this.connect().catch(() => {});
    }, delay);
  }

  captureUserAction(action, detail = {}) {
    this._enqueue({
      source: 'browser',
      category: 'user_action',
      action,
      detail,
      url: detail.url || '',
      userAgent: detail.userAgent || '',
    });
  }

  captureError(error, context = {}) {
    this._enqueue({
      source: 'browser',
      category: 'error',
      level: 'error',
      action: 'error_captured',
      detail: {
        message: error.message || String(error),
        stack: error.stack || '',
        ...context,
      },
    });
  }

  captureNetwork(method, url, status, duration, context = {}) {
    this._enqueue({
      source: 'browser',
      category: 'network',
      level: 'info',
      action: `${method} ${status}`,
      detail: { method, url, status, duration, ...context },
    });
  }

  captureConsole(level, args) {
    this._enqueue({
      source: 'browser',
      category: 'console',
      level: level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info',
      action: `console.${level}`,
      detail: { level, args: args.map(String) },
    });
  }

  captureLifecycle(event, context = {}) {
    this._enqueue({
      source: 'browser',
      category: 'lifecycle',
      level: 'info',
      action: event,
      detail: context,
    });
  }

  _enqueue(rawLog) {
    const log = {
      ...rawLog,
      id: uuidv4(),
      traceId: rawLog.traceId || uuidv4(),
      spanId: rawLog.spanId || uuidv4().slice(0, 12),
      parentSpanId: rawLog.parentSpanId || null,
      terminalId: this.terminalId,
      terminalType: this.terminalType,
      timestamp: Date.now(),
    };
    this.queue.push(log);
    this._emit('log_captured', log);

    if (this.queue.length >= this.batchSize) {
      this._flush();
    }
  }

  _startFlush() {
    this._stopFlush();
    this._flushTimer = setInterval(() => this._flush(), this.flushInterval);
  }

  _stopFlush() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
  }

  _flush() {
    if (!this._connected || this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.batchSize);
    const batchId = uuidv4().slice(0, 10);

    let message = {
      type: 'log_batch',
      terminalId: this.terminalId,
      batchId,
      logs: batch,
      count: batch.length,
      timestamp: Date.now(),
    };

    if (this._enableCompression) {
      this._compressionStats.totalBatches++;
      const compressed = LogCompressor.compress(batch);
      if (compressed.compressed) {
        this._compressionStats.compressedBatches++;
        this._compressionStats.totalOriginalBytes += compressed.originalSize;
        this._compressionStats.totalCompressedBytes += compressed.compressedSize;

        message = {
          type: 'log_batch',
          terminalId: this.terminalId,
          batchId,
          count: batch.length,
          timestamp: Date.now(),
          compressed: true,
          compression: {
            algorithm: compressed.algorithm,
            originalSize: compressed.originalSize,
            compressedSize: compressed.compressedSize,
            ratio: compressed.ratio,
          },
          payload: compressed.payload,
          dict: compressed.dict,
        };
      }
    }

    const sent = this._send(message);

    if (!sent) {
      for (const log of batch) {
        this.queue.unshift(log);
      }
      if (this.queue.length > this._maxQueueSize) {
        this.queue = this.queue.slice(-this._maxQueueSize);
      }
      return;
    }

    const timer = setTimeout(() => {
      if (this._pendingAcks.has(this.terminalId)) {
        this._pendingAcks.delete(this.terminalId);
      }
    }, this._ackTimeout);

    this._pendingAcks.set(this.terminalId, { batchId, logs: batch, timer });

    if (this._enableCompression) {
      this._emit('compression_stats', this.getCompressionStats());
    }
  }

  _send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify(msg));
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  disconnect() {
    this._flush();
    this._stopFlush();
    this._stopHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts;
    this._cleanupWebSocket();
    this._connected = false;
  }

  getQueueSize() {
    return this.queue.length;
  }

  isConnected() {
    return this._connected;
  }

  getCompressionStats() {
    const stats = { ...this._compressionStats };
    stats.averageRatio = stats.totalOriginalBytes > 0
      ? stats.totalCompressedBytes / stats.totalOriginalBytes
      : 1;
    stats.savingsBytes = stats.totalOriginalBytes - stats.totalCompressedBytes;
    stats.compressionRate = stats.totalBatches > 0
      ? stats.compressedBatches / stats.totalBatches
      : 0;
    return stats;
  }
}

module.exports = BrowserCollector;
