const { v4: uuidv4 } = require('uuid');

class TraceHighlighter {
  constructor(options = {}) {
    this.highlightRules = [];
    this._nextRuleId = 0;
    this._cachedHighlights = new Map();
    this._cacheMaxSize = options.cacheMaxSize || 1000;
  }

  addRule(rule) {
    const styleColorMap = {
      error: '#e17055', warn: '#fdcb6e', cross: '#6c5ce7',
      hardware: '#00cec9', sensor: '#fd79a8', alert: '#e17055', custom: '#a29bfe',
    };

    let match = rule.match || {};
    if (rule.match && rule.match.field && rule.match.value) {
      const field = rule.match.field;
      const value = rule.match.value;
      if (field === 'level') {
        match = { level: value };
      } else if (field === 'levelGte') {
        match = { levelGte: value };
      } else if (field === 'category') {
        match = { category: value };
      } else if (field === 'action') {
        match = { action: value };
      } else if (field === 'source') {
        match = { sourceType: value };
      } else if (field === 'detail') {
        match = { keyword: value };
      } else if (field === 'any') {
        match = { keyword: value };
      } else {
        match[field] = value;
      }
    }

    const style = rule.style || 'custom';
    const color = styleColorMap[style] || rule.highlightConfig?.color || '#a29bfe';

    const ruleWithId = {
      id: rule.id || `rule-${this._nextRuleId++}`,
      name: rule.name || `Rule ${this._nextRuleId}`,
      enabled: rule.enabled !== false,
      type: rule.type || style,
      style: style,
      field: rule.match?.field || 'any',
      value: rule.match?.value || '',
      operator: rule.match?.operator || '=',
      priority: rule.priority || 10,
      description: rule.description || '',
      match: match,
      highlightConfig: rule.highlightConfig || {
        color,
        bold: style === 'error' || style === 'alert' || style === 'cross',
        label: style?.toUpperCase() || '',
        icon: style === 'error' ? '❌' : style === 'warn' ? '⚠️' : style === 'cross' ? '🔗' : style === 'alert' ? '🚨' : style === 'hardware' ? '🔧' : style === 'sensor' ? '📊' : '⭐',
      },
    };

    this.highlightRules.push(ruleWithId);
    return ruleWithId;
  }

  getRules() {
    return this.highlightRules.map(r => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      type: r.type,
      style: r.style,
      field: r.field,
      value: r.value,
      operator: r.operator,
      priority: r.priority,
      description: r.description,
      match: r.match,
    }));
  }

  updateRule(ruleId, updates) {
    const idx = this.highlightRules.findIndex(r => r.id === ruleId);
    if (idx === -1) return null;

    const existing = this.highlightRules[idx];
    const updated = { ...existing, ...updates };

    if (updates.match || updates.style) {
      const styleColorMap = {
        error: '#e17055', warn: '#fdcb6e', cross: '#6c5ce7',
        hardware: '#00cec9', sensor: '#fd79a8', alert: '#e17055', custom: '#a29bfe',
      };
      const style = updates.style || existing.style;
      const color = styleColorMap[style] || '#a29bfe';
      updated.highlightConfig = {
        ...existing.highlightConfig,
        color,
        bold: style === 'error' || style === 'alert' || style === 'cross',
        label: style?.toUpperCase() || '',
      };
    }

    this.highlightRules[idx] = updated;
    return this.highlightRules[idx];
  }

  removeRule(ruleId) {
    const idx = this.highlightRules.findIndex(r => r.id === ruleId);
    if (idx !== -1) {
      this.highlightRules.splice(idx, 1);
      this._clearCache();
      return true;
    }
    return false;
  }

  updateRule(ruleId, updates) {
    const rule = this.highlightRules.find(r => r.id === ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this._clearCache();
      return true;
    }
    return false;
  }

  getRules() {
    return [...this.highlightRules];
  }

  highlightLog(log) {
    const cacheKey = this._getCacheKey(log);
    if (this._cachedHighlights.has(cacheKey)) {
      return this._cachedHighlights.get(cacheKey);
    }

    const highlightInfo = {
      highlights: [],
      primaryHighlight: null,
      matchCount: 0,
    };

    for (const rule of this.highlightRules) {
      if (!rule.enabled) continue;

      const match = this._matchRule(log, rule);
      if (match) {
        const highlight = {
          ruleId: rule.id,
          ruleName: rule.name,
          matchType: rule.type,
          matchedFields: match.matchedFields,
          config: rule.highlightConfig,
          position: match.position,
        };
        highlightInfo.highlights.push(highlight);
        highlightInfo.matchCount++;

        if (!highlightInfo.primaryHighlight ||
            (rule.priority || 0) > (highlightInfo.primaryHighlight.rulePriority || 0)) {
          highlightInfo.primaryHighlight = {
            ...highlight,
            rulePriority: rule.priority || 0,
          };
        }
      }
    }

    highlightInfo.highlighted = highlightInfo.matchCount > 0;

    this._setCache(cacheKey, highlightInfo);
    return highlightInfo;
  }

  highlightTrace(spans, options = {}) {
    const { focusSpanId, expandDepth, focusKeyword } = options;

    const result = {
      spans: [],
      focusedSpan: null,
      focusPath: [],
      highlightSummary: {
        errorCount: 0,
        warnCount: 0,
        crossSource: false,
        totalHighlighted: 0,
      },
    };

    const spanMap = new Map();
    spans.forEach(span => {
      spanMap.set(span.spanId, { ...span, _highlight: this.highlightLog(span) });
    });

    let focusedSpan = null;
    if (focusSpanId && spanMap.has(focusSpanId)) {
      focusedSpan = spanMap.get(focusSpanId);
      result.focusedSpan = focusedSpan;
      result.focusPath = this._buildFocusPath(focusedSpan, spanMap, expandDepth);
    }

    if (focusKeyword) {
      const matches = this._findSpansByKeyword(spans, focusKeyword);
      if (matches.length > 0) {
        result.focusedSpan = spanMap.get(matches[0].spanId);
        result.focusPath = this._buildFocusPath(result.focusedSpan, spanMap, expandDepth);
        result.keywordMatches = matches;
      }
    }

    const resultSpans = [];
    spanMap.forEach(span => {
      const inFocusPath = result.focusPath.some(p => p.spanId === span.spanId);
      const isFocused = focusedSpan && span.spanId === focusedSpan.spanId;

      if (span._highlight.highlighted) {
        result.highlightSummary.totalHighlighted++;
      }
      if (span.level === 'error' || span.level === 'fatal') {
        result.highlightSummary.errorCount++;
      }
      if (span.level === 'warn') {
        result.highlightSummary.warnCount++;
      }

      resultSpans.push({
        ...span,
        _focus: {
          focused: isFocused,
          inPath: inFocusPath,
          expanded: inFocusPath || !focusedSpan,
          dimmed: focusedSpan && !isFocused && !inFocusPath,
        },
      });
    });

    result.spans = resultSpans.sort((a, b) => a.timestamp - b.timestamp);

    const sources = new Set(result.spans.map(s => s.source?.type || s.source));
    result.highlightSummary.crossSource = sources.size >= 2;

    return result;
  }

  locateSpan(traceId, spanId, spanMap) {
    if (!spanMap.has(spanId)) return null;

    const span = spanMap.get(spanId);
    const path = this._buildFocusPath(span, spanMap, 3);

    return {
      traceId,
      spanId,
      span,
      ancestors: path.filter(p => p.timestamp < span.timestamp),
      descendants: path.filter(p => p.timestamp > span.timestamp),
      siblings: this._findSiblings(span, spanMap),
    };
  }

  _findSpansByKeyword(spans, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return spans
      .filter(span => {
        const inAction = span.action?.toLowerCase().includes(lowerKeyword);
        const inCategory = span.category?.toLowerCase().includes(lowerKeyword);
        const inDetail = JSON.stringify(span.detail || {}).toLowerCase().includes(lowerKeyword);
        const inLevel = span.level?.toLowerCase().includes(lowerKeyword);
        return inAction || inCategory || inDetail || inLevel;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  _buildFocusPath(focusedSpan, spanMap, depth = 3) {
    const path = [];
    const visited = new Set();

    let current = focusedSpan;
    let upDepth = depth;
    while (current && upDepth > 0 && !visited.has(current.spanId)) {
      visited.add(current.spanId);
      path.unshift(current);
      upDepth--;
      if (current.parentSpanId && spanMap.has(current.parentSpanId)) {
        current = spanMap.get(current.parentSpanId);
      } else {
        break;
      }
    }

    const children = focusedSpan.children || [];
    let currentChildren = children;
    let downDepth = depth;
    while (currentChildren.length > 0 && downDepth > 0) {
      const nextChildren = [];
      for (const child of currentChildren) {
        if (!visited.has(child.spanId)) {
          visited.add(child.spanId);
          path.push(child);
          if (child.children) {
            nextChildren.push(...child.children);
          }
        }
      }
      currentChildren = nextChildren;
      downDepth--;
    }

    return path;
  }

  _findSiblings(span, spanMap) {
    if (!span.parentSpanId) return [];
    const parent = spanMap.get(span.parentSpanId);
    if (!parent) return [];
    return (parent.children || []).filter(s => s.spanId !== span.spanId);
  }

  _matchRule(log, rule) {
    const match = rule.match || {};
    const matchedFields = [];
    let position = null;

    if (match.terminalId && log.source?.terminalId === match.terminalId) {
      matchedFields.push('terminalId');
    }
    if (match.traceId && log.traceId === match.traceId) {
      matchedFields.push('traceId');
    }
    if (match.sourceType && (log.source?.type || log.source) === match.sourceType) {
      matchedFields.push('sourceType');
    }
    if (match.category && log.category === match.category) {
      matchedFields.push('category');
    }
    if (match.action && log.action === match.action) {
      matchedFields.push('action');
    }
    if (match.level && log.level === match.level) {
      matchedFields.push('level');
    }
    if (match.levelGte && log.levelValue !== undefined) {
      const map = { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 };
      const targetLevel = map[match.levelGte] !== undefined ? map[match.levelGte] : match.levelGte;
      if (log.levelValue >= targetLevel) {
        matchedFields.push('levelValue');
      }
    }
    if (match.keyword && typeof match.keyword === 'string') {
      const kw = match.keyword.toLowerCase();
      const actionMatch = log.action?.toLowerCase().includes(kw);
      const detailMatch = JSON.stringify(log.detail || {}).toLowerCase().includes(kw);
      if (actionMatch || detailMatch) {
        matchedFields.push('keyword');
        if (actionMatch) {
          position = { field: 'action', index: log.action.toLowerCase().indexOf(kw) };
        }
      }
    }

    if (matchedFields.length > 0) {
      return { matchedFields, position };
    }
    return null;
  }

  _getCacheKey(log) {
    return `${log.id}:${log.traceId}:${log.spanId}:${log.timestamp}`;
  }

  _setCache(key, value) {
    if (this._cachedHighlights.size >= this._cacheMaxSize) {
      const firstKey = this._cachedHighlights.keys().next().value;
      this._cachedHighlights.delete(firstKey);
    }
    this._cachedHighlights.set(key, value);
  }

  _clearCache() {
    this._cachedHighlights.clear();
  }

  _findSpansByKeyword(spans, keyword) {
    if (!keyword || !Array.isArray(spans)) return [];
    const kw = keyword.toLowerCase();
    return spans.filter(span => {
      const searchText = [
        span.action,
        span.category,
        span.level,
        span.source?.type || span.source,
        JSON.stringify(span.detail || {}),
        JSON.stringify(span.tags || []),
        span.spanId,
        span.traceId,
      ].filter(Boolean).join(' ').toLowerCase();
      return searchText.includes(kw);
    });
  }

  addDefaultRules() {
    this.addRule({
      name: '错误高亮',
      type: 'error',
      match: { levelGte: 'error' },
      priority: 100,
      highlightConfig: { color: '#e17055', bold: true, label: 'ERROR', icon: '❌' },
    });

    this.addRule({
      name: '警告高亮',
      type: 'warning',
      match: { level: 'warn' },
      priority: 80,
      highlightConfig: { color: '#fdcb6e', bold: false, label: 'WARN', icon: '⚠️' },
    });

    this.addRule({
      name: '跨源关联',
      type: 'cross_source',
      match: { category: 'trace_linked' },
      priority: 90,
      highlightConfig: { color: '#6c5ce7', bold: true, label: 'LINKED', icon: '🔗' },
    });

    this.addRule({
      name: '设备告警',
      type: 'alert',
      match: { category: 'alert' },
      priority: 85,
      highlightConfig: { color: '#e17055', bold: true, label: 'ALERT', icon: '🚨' },
    });

    this.addRule({
      name: '硬件日志',
      type: 'hardware',
      match: { category: 'hardware' },
      priority: 50,
      highlightConfig: { color: '#00cec9', bold: false, label: 'HW', icon: '🔧' },
    });

    this.addRule({
      name: '传感器数据',
      type: 'sensor',
      match: { category: 'sensor' },
      priority: 40,
      highlightConfig: { color: '#00b894', bold: false, label: 'SENSOR', icon: '📊' },
    });
  }
}

module.exports = TraceHighlighter;
