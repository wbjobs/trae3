const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config');
const LogCompressor = require('../collector/log-compressor');
const { RequestScheduler } = require('./request-scheduler');

class WsGateway {
  constructor(options = {}) {
    this.wss = null;
    this.terminalAdapter = options.terminalAdapter;
    this.logRouter = options.logRouter;
    this.logStore = options.logStore;
    this.logIndexer = options.logIndexer;
    this.logFormatter = options.logFormatter;
    this.clients = new Map();
    this.terminalClientMap = new Map();
    this.listeners = {};
    this._pingInterval = options.pingInterval || 30000;
    this._pingTimeout = options.pingTimeout || 10000;
    this._pingTimer = null;
    this._scheduler = options.scheduler || new RequestScheduler({
      maxConcurrency: options.maxConcurrency || 20,
      maxQueueSize: options.maxQueueSize || 5000,
    });
    this._compressionStats = {
      totalBatches: 0,
      compressedBatches: 0,
      totalOriginalBytes: 0,
      totalCompressedBytes: 0,
      totalDecompressionErrors: 0,
    };
    this.stats = {
      totalConnections: 0,
      totalMessages: 0,
      totalLogEntries: 0,
      totalStoreErrors: 0,
      startTime: Date.now(),
    };
  }

  on(event, handler) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(h => h(data));
  }

  attach(server) {
    this.wss = new WebSocketServer({ server, path: config.server.wsPath });

    this.wss.on('connection', (ws, req) => {
      const clientKey = uuidv4();
      const clientInfo = {
        key: clientKey,
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        connectedAt: Date.now(),
        terminalId: null,
        authenticated: false,
        isAlive: true,
        lastPing: Date.now(),
      };

      this.clients.set(clientKey, { ws, info: clientInfo });
      this.stats.totalConnections++;

      this._emit('client_connected', { clientKey, ip: clientInfo.ip });

      ws.on('message', (raw) => {
        this.stats.totalMessages++;
        clientInfo.isAlive = true;
        clientInfo.lastPing = Date.now();
        try {
          const msg = JSON.parse(raw.toString());
          this._handleMessage(clientKey, ws, msg);
        } catch (err) {
          this._sendError(ws, 'PARSE_ERROR', 'Invalid JSON message');
        }
      });

      ws.on('close', () => {
        const client = this.clients.get(clientKey);
        if (client && client.info.terminalId) {
          this.terminalClientMap.delete(client.info.terminalId);
          this.terminalAdapter.unregisterTerminal(client.info.terminalId);
        }
        this.clients.delete(clientKey);
        this._emit('client_disconnected', { clientKey });
      });

      ws.on('error', (err) => {
        this._emit('client_error', { clientKey, error: err.message });
      });

      ws.on('pong', () => {
        clientInfo.isAlive = true;
        clientInfo.lastPing = Date.now();
      });

      this._send(ws, {
        type: 'connected',
        clientKey,
        serverTime: Date.now(),
        message: 'Log trace gateway ready. Please register your terminal.',
      });
    });

    this._startPing();
    this._startHealthCheck();
    return this;
  }

  _startPing() {
    if (this._pingTimer) return;
    this._pingTimer = setInterval(() => {
      this.clients.forEach((client, key) => {
        if (!client.info.isAlive) {
          client.ws.terminate();
          return;
        }
        client.info.isAlive = false;
        if (client.ws.readyState === 1) {
          client.ws.ping();
        }
      });
    }, this._pingInterval);
  }

  _handleMessage(clientKey, ws, msg) {
    switch (msg.type) {
      case 'register':
        this._handleRegister(clientKey, ws, msg);
        break;
      case 'log_batch':
        this._handleLogBatch(clientKey, ws, msg);
        break;
      case 'heartbeat':
        this._handleHeartbeat(clientKey, ws, msg);
        break;
      case 'trace_query':
        this._handleTraceQuery(clientKey, ws, msg);
        break;
      default:
        this._sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${msg.type}`);
    }
  }

  _handleRegister(clientKey, ws, msg) {
    const client = this.clients.get(clientKey);
    if (!client) return;

    const existingClientKey = this.terminalClientMap.get(msg.terminalId);
    if (existingClientKey && existingClientKey !== clientKey) {
      const existingClient = this.clients.get(existingClientKey);
      if (existingClient) {
        this._send(existingClient.ws, {
          type: 'replaced',
          reason: 'Same terminalId registered from new connection',
        });
        if (existingClient.ws.readyState === 1) {
          existingClient.ws.close(1000, 'replaced by new connection');
        }
        this.clients.delete(existingClientKey);
      }
    }

    const result = this.terminalAdapter.registerTerminal(ws, msg);
    if (result.success) {
      client.info.terminalId = msg.terminalId;
      client.info.authenticated = true;
      this.terminalClientMap.set(msg.terminalId, clientKey);

      this._send(ws, {
        type: 'register_ack',
        success: true,
        sessionId: result.sessionId,
        meta: result.meta,
      });

      this._emit('terminal_registered', {
        clientKey,
        terminalId: msg.terminalId,
        type: msg.terminalType,
      });
    } else {
      this._send(ws, {
        type: 'register_ack',
        success: false,
        error: result.error,
      });
    }
  }

  _handleLogBatch(clientKey, ws, msg) {
    const client = this.clients.get(clientKey);
    if (!client || !client.info.authenticated) {
      this._sendError(ws, 'UNAUTHORIZED', 'Terminal not registered');
      return;
    }

    const terminalId = client.info.terminalId;
    this._compressionStats.totalBatches++;

    let rawLogs = [];

    if (msg.compressed) {
      this._compressionStats.compressedBatches++;
      this._compressionStats.totalOriginalBytes += msg.compression?.originalSize || 0;
      this._compressionStats.totalCompressedBytes += msg.compression?.compressedSize || 0;

      try {
        const decompressed = LogCompressor.decompress({
          compressed: true,
          algorithm: msg.compression?.algorithm || 'dict',
          payload: msg.payload,
          dict: msg.dict,
        });
        rawLogs = JSON.parse(decompressed);
      } catch (err) {
        this._compressionStats.totalDecompressionErrors++;
        this._emit('decompression_error', { terminalId, error: err.message });
        this._sendError(ws, 'DECOMPRESSION_FAILED', 'Failed to decompress log batch');
        return;
      }
    } else {
      rawLogs = msg.logs || [];
    }

    const processTask = {
      type: 'log_batch',
      terminalId,
      priority: null,
      logs: rawLogs,
      batchId: msg.batchId,
      clientKey,
      ws,
      handler: (payload, task) => this._processLogBatch(payload, task),
      onError: (err, task) => {
        this._emit('batch_processing_error', { terminalId: task.terminalId, error: err.message });
      },
    };

    const enqueued = this._scheduler.enqueue(processTask);

    if (!enqueued) {
      this._sendError(ws, 'OVERLOAD', 'Server overloaded, please retry later');
      this._emit('overload', { terminalId, queueSize: this._scheduler.getStats().currentQueueSize });
    }
  }

  async _processLogBatch(payload, task) {
    const { terminalId, logs: rawLogs, batchId, ws } = task;

    const processedLogs = rawLogs.map(rawLog => {
      const adapted = this.terminalAdapter.adaptLog(terminalId, rawLog);
      const formatted = this.logFormatter.format(adapted);
      return formatted;
    }).filter(log => {
      const validation = this.logFormatter.validate(log);
      if (!validation.valid) {
        this._emit('log_validation_failed', { terminalId, errors: validation.errors });
      }
      return validation.valid;
    });

    if (processedLogs.length === 0) {
      this._send(ws, {
        type: 'log_batch_ack',
        batchId: batchId || null,
        received: 0,
        terminalId,
        timestamp: Date.now(),
      });
      return;
    }

    this.stats.totalLogEntries += processedLogs.length;

    if (this.logRouter) {
      this.logRouter.route(processedLogs, terminalId);
    }

    if (this.logStore) {
      this.logStore.insertBatch(processedLogs).catch((err) => {
        this.stats.totalStoreErrors++;
        this._emit('store_error', { terminalId, error: err.message, logCount: processedLogs.length });
      });
    }

    if (this.logIndexer) {
      this.logIndexer.indexBatch(processedLogs);
    }

    this._send(ws, {
      type: 'log_batch_ack',
      batchId: batchId || null,
      received: processedLogs.length,
      terminalId,
      timestamp: Date.now(),
    });

    this._emit('logs_received', { terminalId, count: processedLogs.length });
  }

  _handleHeartbeat(clientKey, ws, msg) {
    const client = this.clients.get(clientKey);
    if (!client) return;

    if (client.info.terminalId) {
      const terminal = this.terminalAdapter.getTerminal(client.info.terminalId);
      if (terminal) {
        terminal.meta.lastActivity = Date.now();
      }
    }

    this._send(ws, {
      type: 'heartbeat_ack',
      serverTime: Date.now(),
      terminalId: msg.terminalId || client.info.terminalId,
    });
  }

  _handleTraceQuery(clientKey, ws, msg) {
    const client = this.clients.get(clientKey);
    if (!client || !client.info.authenticated) {
      this._sendError(ws, 'UNAUTHORIZED', 'Terminal not registered');
      return;
    }

    let result = null;
    if (this.logIndexer && msg.traceId) {
      result = this.logIndexer.queryByTraceId(msg.traceId);
    } else if (this.logStore && msg.traceId) {
      result = this.logStore.queryByTraceId(msg.traceId);
    }

    this._send(ws, {
      type: 'trace_query_result',
      queryId: msg.queryId || uuidv4(),
      traceId: msg.traceId,
      result,
    });
  }

  _send(ws, msg) {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(msg));
      } catch (_) {}
    }
  }

  _sendError(ws, code, message) {
    this._send(ws, { type: 'error', code, message });
  }

  _startHealthCheck() {
    setInterval(() => {
      this.clients.forEach((client, key) => {
        if (client.ws.readyState !== 1) {
          if (client.info.terminalId) {
            this.terminalClientMap.delete(client.info.terminalId);
            this.terminalAdapter.unregisterTerminal(client.info.terminalId);
          }
          this.clients.delete(key);
        }
      });

      this.terminalAdapter.cleanupStale();
    }, 30000);
  }

  getStats() {
    const compression = { ...this._compressionStats };
    compression.averageRatio = compression.totalOriginalBytes > 0
      ? compression.totalCompressedBytes / compression.totalOriginalBytes
      : 1;
    compression.savingsBytes = compression.totalOriginalBytes - compression.totalCompressedBytes;
    compression.compressionRate = compression.totalBatches > 0
      ? compression.compressedBatches / compression.totalBatches
      : 0;

    return {
      ...this.stats,
      activeConnections: this.clients.size,
      onlineTerminals: this.terminalAdapter.getOnlineCount(),
      uptime: Date.now() - this.stats.startTime,
      compression,
      scheduler: this._scheduler.getStats(),
    };
  }

  broadcast(message) {
    let sent = 0;
    this.clients.forEach((client) => {
      if (client.ws.readyState === 1 && client.info.authenticated) {
        this._send(client.ws, message);
        sent++;
      }
    });
    return sent;
  }

  shutdown() {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this._scheduler) {
      this._scheduler.shutdown();
    }
    if (this.wss) {
      this.clients.forEach((client) => {
        client.ws.close(1001, 'Server shutting down');
      });
      this.wss.close();
    }
  }
}

module.exports = WsGateway;
