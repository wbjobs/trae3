const { v4: uuidv4 } = require('uuid');

class LogFormatter {
  static SCHEMA_VERSION = '1.0.0';

  static LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  static normalizeLevel(level) {
    const lower = String(level).toLowerCase();
    if (LogFormatter.LEVELS[lower] !== undefined) return lower;
    if (['warning', 'w'].includes(lower)) return 'warn';
    if (['err', 'e'].includes(lower)) return 'error';
    if (['d'].includes(lower)) return 'debug';
    if (['critical'].includes(lower)) return 'fatal';
    return 'info';
  }

  static _extractSource(rawLog) {
    if (rawLog.source && typeof rawLog.source === 'object') {
      return {
        type: rawLog.source.type || 'unknown',
        terminalId: rawLog.source.terminalId || rawLog.terminalId || 'unknown',
        terminalType: rawLog.source.terminalType || rawLog.terminalType || 'unknown',
        hardwareId: rawLog.source.hardwareId || rawLog.hardwareId || undefined,
      };
    }

    return {
      type: rawLog.source || 'unknown',
      terminalId: rawLog.terminalId || 'unknown',
      terminalType: rawLog.terminalType || 'unknown',
      hardwareId: rawLog.hardwareId || undefined,
    };
  }

  static format(rawLog) {
    const now = Date.now();
    const level = LogFormatter.normalizeLevel(rawLog.level || 'info');
    const source = LogFormatter._extractSource(rawLog);

    const formatted = {
      schemaVersion: LogFormatter.SCHEMA_VERSION,
      id: rawLog.id || uuidv4(),
      traceId: rawLog.traceId || uuidv4(),
      spanId: rawLog.spanId || uuidv4().slice(0, 12),
      parentSpanId: rawLog.parentSpanId || null,
      timestamp: rawLog.timestamp || now,
      receivedAt: now,

      source,

      category: rawLog.category || 'general',
      action: rawLog.action || 'unknown',
      level,
      levelValue: LogFormatter.LEVELS[level],

      detail: LogFormatter._sanitizeDetail(rawLog.detail || {}),
      tags: LogFormatter._extractTags(rawLog, source),
    };

    return formatted;
  }

  static formatBatch(rawLogs) {
    return rawLogs.map(log => LogFormatter.format(log));
  }

  static createTraceLink(parentLog, childLog) {
    return {
      traceId: parentLog.traceId,
      parentSpanId: parentLog.spanId,
      spanId: childLog.spanId || uuidv4().slice(0, 12),
      linkType: childLog.source?.type || childLog.source || 'unknown',
      linkedAt: Date.now(),
    };
  }

  static buildTraceChain(logs) {
    const byTraceId = {};
    logs.forEach(log => {
      const tid = log.traceId;
      if (!byTraceId[tid]) byTraceId[tid] = [];
      byTraceId[tid].push(log);
    });

    const chains = {};
    Object.entries(byTraceId).forEach(([traceId, traceLogs]) => {
      const spanMap = {};
      traceLogs.forEach(log => {
        if (spanMap[log.spanId]) return;
        spanMap[log.spanId] = { ...log, children: [] };
      });

      const roots = [];
      traceLogs.forEach(log => {
        if (spanMap[log.spanId] && log.parentSpanId && spanMap[log.parentSpanId]) {
          spanMap[log.parentSpanId].children.push(spanMap[log.spanId]);
        } else if (spanMap[log.spanId]) {
          roots.push(spanMap[log.spanId]);
        }
      });

      chains[traceId] = {
        traceId,
        roots,
        totalSpans: Object.keys(spanMap).length,
        sourceTypes: [...new Set(traceLogs.map(l => l.source?.type || l.source))],
        startTime: Math.min(...traceLogs.map(l => l.timestamp)),
        endTime: Math.max(...traceLogs.map(l => l.timestamp)),
      };
    });

    return chains;
  }

  static validate(formattedLog) {
    const errors = [];
    if (!formattedLog.id) errors.push('missing id');
    if (!formattedLog.traceId) errors.push('missing traceId');
    if (!formattedLog.spanId) errors.push('missing spanId');
    if (!formattedLog.timestamp) errors.push('missing timestamp');
    if (!formattedLog.source) errors.push('missing source');
    if (!formattedLog.source?.terminalId) errors.push('missing source.terminalId');
    if (!formattedLog.category) errors.push('missing category');

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static _sanitizeDetail(detail) {
    if (typeof detail !== 'object' || detail === null) return { value: String(detail) };

    const sanitized = {};
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'api_key', 'credential', 'authorization'];

    for (const [key, value] of Object.entries(detail)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '******';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = JSON.stringify(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  static _extractTags(log, source) {
    const tags = [];
    if (source.type) tags.push(`source:${source.type}`);
    if (source.terminalType) tags.push(`terminal:${source.terminalType}`);
    if (log.category) tags.push(`category:${log.category}`);
    if (log.level) tags.push(`level:${log.level}`);
    return tags;
  }

  static serialize(log) {
    return JSON.stringify(log);
  }

  static deserialize(raw) {
    try {
      const parsed = JSON.parse(raw);
      return LogFormatter.format(parsed);
    } catch {
      return null;
    }
  }
}

module.exports = LogFormatter;
