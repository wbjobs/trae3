const { v4: uuidv4 } = require('uuid');
const TraceHighlighter = require('./trace-highlighter');

class LogIndexer {
  constructor(options = {}) {
    this.maxMemoryEntries = options.maxMemoryEntries || 50000;
    this.traceIndex = new Map();
    this.terminalIndex = new Map();
    this.sourceIndex = new Map();
    this.categoryIndex = new Map();
    this.timeIndex = [];
    this.spanIdSet = new Set();
    this.totalIndexed = 0;
    this.highlighter = new TraceHighlighter(options);
    if (options.enableDefaultRules !== false) {
      this.highlighter.addDefaultRules();
    }
  }

  index(log) {
    const spanKey = `${log.traceId}:${log.spanId}`;
    if (this.spanIdSet.has(spanKey)) return;
    this.spanIdSet.add(spanKey);

    this._addToTraceIndex(log);
    this._addToTerminalIndex(log);
    this._addToSourceIndex(log);
    this._addToCategoryIndex(log);
    this._addToTimeIndex(log);
    this.totalIndexed++;

    if (this.totalIndexed % 1000 === 0) {
      this._evict();
    }
  }

  indexBatch(logs) {
    logs.forEach(log => this.index(log));
  }

  _addToTraceIndex(log) {
    if (!this.traceIndex.has(log.traceId)) {
      this.traceIndex.set(log.traceId, []);
    }
    this.traceIndex.get(log.traceId).push({
      id: log.id,
      spanId: log.spanId,
      parentSpanId: log.parentSpanId || null,
      source: log.source?.type || log.source,
      terminalId: log.source?.terminalId,
      category: log.category,
      action: log.action,
      level: log.level,
      timestamp: log.timestamp,
      detail: log.detail,
    });
  }

  _addToTerminalIndex(log) {
    const terminalId = log.source?.terminalId || 'unknown';
    if (!this.terminalIndex.has(terminalId)) {
      this.terminalIndex.set(terminalId, []);
    }
    const entries = this.terminalIndex.get(terminalId);
    entries.push({
      id: log.id,
      traceId: log.traceId,
      category: log.category,
      level: log.level,
      timestamp: log.timestamp,
    });

    if (entries.length > 500) {
      this.terminalIndex.set(terminalId, entries.slice(-300));
    }
  }

  _addToSourceIndex(log) {
    const source = log.source?.type || log.source || 'unknown';
    if (!this.sourceIndex.has(source)) {
      this.sourceIndex.set(source, { count: 0, lastTimestamp: 0 });
    }
    const entry = this.sourceIndex.get(source);
    entry.count++;
    entry.lastTimestamp = log.timestamp;
  }

  _addToCategoryIndex(log) {
    const key = `${log.source?.type || 'unknown'}:${log.category}`;
    if (!this.categoryIndex.has(key)) {
      this.categoryIndex.set(key, { count: 0, lastTimestamp: 0 });
    }
    const entry = this.categoryIndex.get(key);
    entry.count++;
    entry.lastTimestamp = log.timestamp;
  }

  _addToTimeIndex(log) {
    this.timeIndex.push({
      id: log.id,
      traceId: log.traceId,
      timestamp: log.timestamp,
      level: log.level,
    });

    if (this.timeIndex.length > this.maxMemoryEntries) {
      this.timeIndex = this.timeIndex.slice(-Math.floor(this.maxMemoryEntries * 0.7));
    }
  }

  queryByTraceId(traceId) {
    return this.traceIndex.get(traceId) || [];
  }

  queryByTerminalId(terminalId, options = {}) {
    const entries = this.terminalIndex.get(terminalId) || [];
    let result = entries;

    if (options.level) {
      result = result.filter(e => e.level === options.level);
    }
    if (options.category) {
      result = result.filter(e => e.category === options.category);
    }
    if (options.limit) {
      result = result.slice(-(options.limit));
    }

    return result;
  }

  queryByTimeRange(startTime, endTime, options = {}) {
    let result = this.timeIndex.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);

    if (options.level) {
      result = result.filter(e => e.level === options.level);
    }
    if (options.limit) {
      result = result.slice(-(options.limit));
    }

    return result;
  }

  getTraceChain(traceId) {
    const spans = this.queryByTraceId(traceId);
    if (spans.length === 0) return null;

    const spanMap = new Map();
    spans.forEach(span => {
      spanMap.set(span.spanId, { ...span, children: [] });
    });

    const roots = [];
    spans.forEach(span => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        spanMap.get(span.parentSpanId).children.push(spanMap.get(span.spanId));
      } else {
        roots.push(spanMap.get(span.spanId));
      }
    });

    const timestamps = spans.map(s => s.timestamp);

    return {
      traceId,
      roots,
      totalSpans: spans.length,
      sourceTypes: [...new Set(spans.map(s => s.source))],
      startTime: Math.min(...timestamps),
      endTime: Math.max(...timestamps),
      duration: Math.max(...timestamps) - Math.min(...timestamps),
    };
  }

  getHighlightedTrace(traceId, options = {}) {
    const spans = this.queryByTraceId(traceId);
    if (spans.length === 0) return null;

    const spanMap = new Map();
    spans.forEach(span => {
      spanMap.set(span.spanId, { ...span, children: [] });
    });

    spans.forEach(span => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        spanMap.get(span.parentSpanId).children.push(spanMap.get(span.spanId));
      }
    });

    const highlightedSpans = spans.map(span => ({
      ...span,
      highlight: this.highlighter.highlightLog(span),
    }));

    return this.highlighter.highlightTrace(highlightedSpans, options);
  }

  locateSpan(traceId, spanId) {
    const spans = this.queryByTraceId(traceId);
    if (spans.length === 0) return null;

    const spanMap = new Map();
    spans.forEach(span => {
      const withChildren = { ...span, children: [] };
      spanMap.set(span.spanId, withChildren);
    });

    spans.forEach(span => {
      if (span.parentSpanId && spanMap.has(span.parentSpanId)) {
        spanMap.get(span.parentSpanId).children.push(spanMap.get(span.spanId));
      }
    });

    return this.highlighter.locateSpan(traceId, spanId, spanMap);
  }

  searchInTrace(traceId, keyword, options = {}) {
    const spans = this.queryByTraceId(traceId);
    if (spans.length === 0) return { matches: [], total: 0 };

    const matches = this.highlighter._findSpansByKeyword(spans, keyword);

    return {
      traceId,
      keyword,
      matches,
      total: matches.length,
      highlightedSpans: options.includeSpans
        ? matches.map(m => ({ ...m, highlight: this.highlighter.highlightLog(m) }))
        : undefined,
    };
  }

  getHighlightRules() {
    return this.highlighter.getRules();
  }

  addHighlightRule(rule) {
    return this.highlighter.addRule(rule);
  }

  removeHighlightRule(ruleId) {
    return this.highlighter.removeRule(ruleId);
  }

  updateHighlightRule(ruleId, updates) {
    return this.highlighter.updateRule(ruleId, updates);
  }

  findCrossSourceTraces() {
    const crossSource = [];
    this.traceIndex.forEach((spans, traceId) => {
      const sources = new Set(spans.map(s => s.source));
      if (sources.size >= 2) {
        const timestamps = spans.map(s => s.timestamp);
        crossSource.push({
          traceId,
          sourceTypes: [...sources],
          spanCount: spans.length,
          startTime: Math.min(...timestamps),
          endTime: Math.max(...timestamps),
        });
      }
    });
    return crossSource;
  }

  getSourceStats() {
    const stats = {};
    this.sourceIndex.forEach((val, key) => {
      stats[key] = { ...val };
    });
    return stats;
  }

  getCategoryStats() {
    const stats = {};
    this.categoryIndex.forEach((val, key) => {
      stats[key] = { ...val };
    });
    return stats;
  }

  getStats() {
    return {
      totalIndexed: this.totalIndexed,
      traceCount: this.traceIndex.size,
      terminalCount: this.terminalIndex.size,
      sourceStats: this.getSourceStats(),
      categoryStats: this.getCategoryStats(),
      memoryEntries: this.timeIndex.length,
      crossSourceTraceCount: this.findCrossSourceTraces().length,
      highlightRules: this.highlighter.getRules().length,
    };
  }

  _evict() {
    if (this.traceIndex.size <= Math.floor(this.maxMemoryEntries / 10)) return;

    const now = Date.now();
    const staleThreshold = 3600000;
    const toDelete = [];

    this.traceIndex.forEach((spans, traceId) => {
      const latest = Math.max(...spans.map(s => s.timestamp));
      if (now - latest > staleThreshold) {
        toDelete.push(traceId);
      }
    });

    toDelete.forEach(traceId => {
      const spans = this.traceIndex.get(traceId);
      if (spans) {
        spans.forEach(s => this.spanIdSet.delete(`${traceId}:${s.spanId}`));
      }
      this.traceIndex.delete(traceId);
    });

    this.highlighter._clearCache();
  }

  clear() {
    this.traceIndex.clear();
    this.terminalIndex.clear();
    this.sourceIndex.clear();
    this.categoryIndex.clear();
    this.timeIndex = [];
    this.spanIdSet.clear();
    this.totalIndexed = 0;
    this.highlighter._clearCache();
  }
}

module.exports = LogIndexer;
