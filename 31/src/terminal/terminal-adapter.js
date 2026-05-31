const { v4: uuidv4 } = require('uuid');
const config = require('../../config');

class TerminalAdapter {
  constructor() {
    this.terminals = new Map();
    this.supportedTypes = new Set(config.terminal.supportedTypes);
    this.typeHandlers = new Map();
    this._initDefaultHandlers();
  }

  _initDefaultHandlers() {
    this.typeHandlers.set('browser', {
      validate: (meta) => !!(meta.terminalId),
      transform: (log) => log,
      enrich: (meta) => ({
        clientType: 'browser',
        protocol: 'websocket',
        capabilities: ['user_action', 'error', 'network', 'console', 'lifecycle'],
      }),
    });

    this.typeHandlers.set('embedded', {
      validate: (meta) => !!(meta.terminalId && meta.hardwareId),
      transform: (log) => ({
        ...log,
        detail: {
          ...log.detail,
          _embeddedMeta: { hardwareId: log.hardwareId || meta.hardwareId },
        },
      }),
      enrich: (meta) => ({
        clientType: 'embedded',
        protocol: 'websocket',
        capabilities: ['hardware', 'sensor', 'alert', 'system', 'firmware'],
      }),
    });

    this.typeHandlers.set('iot', {
      validate: (meta) => !!(meta.terminalId && meta.hardwareId),
      transform: (log) => ({
        ...log,
        detail: {
          ...log.detail,
          _iotMeta: { hardwareId: log.hardwareId || meta.hardwareId, protocol: 'mqtt-bridge' },
        },
      }),
      enrich: (meta) => ({
        clientType: 'iot',
        protocol: 'mqtt-bridge',
        capabilities: ['sensor', 'alert', 'system'],
      }),
    });

    this.typeHandlers.set('mobile', {
      validate: (meta) => !!(meta.terminalId),
      transform: (log) => ({
        ...log,
        detail: {
          ...log.detail,
          _mobileMeta: { deviceId: meta.deviceId || meta.terminalId },
        },
      }),
      enrich: (meta) => ({
        clientType: 'mobile',
        protocol: 'websocket',
        capabilities: ['user_action', 'error', 'network', 'lifecycle', 'sensor'],
      }),
    });
  }

  registerTerminal(ws, meta) {
    const { terminalId, terminalType } = meta;

    if (!this.supportedTypes.has(terminalType)) {
      return { success: false, error: `Unsupported terminal type: ${terminalType}` };
    }

    const handler = this.typeHandlers.get(terminalType);
    if (!handler.validate(meta)) {
      return { success: false, error: `Validation failed for type: ${terminalType}` };
    }

    const existing = this.terminals.get(terminalId);
    if (existing && existing.ws && existing.ws !== ws) {
      if (existing.ws.readyState === 1) {
        try {
          existing.ws.send(JSON.stringify({
            type: 'replaced',
            reason: 'Same terminalId registered from new connection',
          }));
          existing.ws.close(1000, 'replaced');
        } catch (_) {}
      }
    }

    const prevLogCount = existing ? existing.meta.logCount : 0;

    const enrichedMeta = {
      ...meta,
      ...handler.enrich(meta),
      sessionId: uuidv4(),
      connectedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'online',
      logCount: prevLogCount,
    };

    this.terminals.set(terminalId, {
      ws,
      meta: enrichedMeta,
      handler,
    });

    return { success: true, sessionId: enrichedMeta.sessionId, meta: enrichedMeta };
  }

  unregisterTerminal(terminalId) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return false;

    this.terminals.delete(terminalId);
    return true;
  }

  getTerminal(terminalId) {
    return this.terminals.get(terminalId);
  }

  getOnlineTerminals(type = null) {
    const result = [];
    this.terminals.forEach((terminal, id) => {
      if (type && terminal.meta.terminalType !== type) return;
      result.push({
        terminalId: id,
        type: terminal.meta.terminalType,
        status: terminal.meta.status,
        connectedAt: terminal.meta.connectedAt,
        lastActivity: terminal.meta.lastActivity,
        logCount: terminal.meta.logCount,
      });
    });
    return result;
  }

  adaptLog(terminalId, rawLog) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) return rawLog;

    terminal.meta.lastActivity = Date.now();
    terminal.meta.logCount++;

    const adapted = terminal.handler.transform(rawLog);
    return {
      ...adapted,
      _adapterMeta: {
        sessionId: terminal.meta.sessionId,
        adaptedAt: Date.now(),
        terminalType: terminal.meta.terminalType,
      },
    };
  }

  sendToTerminal(terminalId, message) {
    const terminal = this.terminals.get(terminalId);
    if (!terminal || !terminal.ws) return false;

    if (terminal.ws.readyState === 1) {
      try {
        terminal.ws.send(JSON.stringify(message));
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  broadcastToType(terminalType, message) {
    let sent = 0;
    this.terminals.forEach((terminal) => {
      if (terminal.meta.terminalType === terminalType) {
        if (this.sendToTerminal(terminal.meta.terminalId, message)) {
          sent++;
        }
      }
    });
    return sent;
  }

  broadcastAll(message) {
    let sent = 0;
    this.terminals.forEach((terminal) => {
      if (this.sendToTerminal(terminal.meta.terminalId, message)) {
        sent++;
      }
    });
    return sent;
  }

  getOnlineCount() {
    return this.terminals.size;
  }

  getTypeCount() {
    const counts = {};
    this.terminals.forEach((terminal) => {
      const type = terminal.meta.terminalType;
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  }

  checkHealth() {
    const now = Date.now();
    const staleThreshold = config.terminal.heartbeatInterval * 3;
    const stale = [];

    this.terminals.forEach((terminal, id) => {
      if (now - terminal.meta.lastActivity > staleThreshold) {
        terminal.meta.status = 'stale';
        stale.push(id);
      } else {
        terminal.meta.status = 'online';
      }
    });

    return {
      total: this.terminals.size,
      online: [...this.terminals.values()].filter(t => t.meta.status === 'online').length,
      stale: stale.length,
      staleTerminals: stale,
      typeDistribution: this.getTypeCount(),
    };
  }

  cleanupStale() {
    const stale = [];
    const now = Date.now();
    const removeThreshold = config.terminal.heartbeatInterval * 10;

    this.terminals.forEach((terminal, id) => {
      if (now - terminal.meta.lastActivity > removeThreshold) {
        stale.push(id);
      }
    });

    stale.forEach(id => this.terminals.delete(id));
    return stale.length;
  }
}

module.exports = TerminalAdapter;
