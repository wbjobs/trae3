const { v4: uuidv4 } = require('uuid');

class LogRouter {
  constructor(options = {}) {
    this.terminalAdapter = options.terminalAdapter;
    this.logStore = options.logStore;
    this.logIndexer = options.logIndexer;
    this.routes = new Map();
    this.forwarders = new Map();
    this.traceLinks = new Map();
    this.stats = {
      routed: 0,
      forwarded: 0,
      traceLinksCreated: 0,
    };
    this._initDefaultRoutes();
  }

  _initDefaultRoutes() {
    this.routes.set('browser', {
      handler: (logs) => this._routeBrowserLogs(logs),
      forwardTargets: ['dashboard', 'storage'],
    });

    this.routes.set('terminal', {
      handler: (logs) => this._routeTerminalLogs(logs),
      forwardTargets: ['dashboard', 'storage', 'alert'],
    });

    this.routes.set('unknown', {
      handler: (logs) => this._routeUnknownLogs(logs),
      forwardTargets: ['storage'],
    });
  }

  addRoute(sourceType, handler, forwardTargets = []) {
    this.routes.set(sourceType, { handler, forwardTargets });
  }

  addForwarder(name, forwarderFn) {
    this.forwarders.set(name, forwarderFn);
  }

  route(logs, sourceTerminalId) {
    const bySource = this._groupBySource(logs);

    let totalRouted = 0;

    bySource.forEach((sourceLogs, sourceType) => {
      const routeConfig = this.routes.get(sourceType) || this.routes.get('unknown');

      if (routeConfig.handler) {
        const processed = routeConfig.handler(sourceLogs, sourceTerminalId);
        totalRouted += processed.length;

        routeConfig.forwardTargets.forEach(target => {
          const forwarder = this.forwarders.get(target);
          if (forwarder) {
            try {
              forwarder(processed, sourceTerminalId);
              this.stats.forwarded += processed.length;
            } catch (_) {}
          }
        });
      }
    });

    this._processTraceLinks(logs);
    this.stats.routed += totalRouted;
    return totalRouted;
  }

  _groupBySource(logs) {
    const groups = new Map();
    logs.forEach(log => {
      const source = log.source?.type || log.source || 'unknown';
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source).push(log);
    });
    return groups;
  }

  _routeBrowserLogs(logs) {
    return logs.map(log => ({
      ...log,
      _routing: {
        routedAt: Date.now(),
        route: 'browser_pipeline',
        priority: this._calculatePriority(log),
      },
    }));
  }

  _routeTerminalLogs(logs) {
    return logs.map(log => ({
      ...log,
      _routing: {
        routedAt: Date.now(),
        route: 'terminal_pipeline',
        priority: this._calculatePriority(log),
      },
    }));
  }

  _routeUnknownLogs(logs) {
    return logs.map(log => ({
      ...log,
      _routing: {
        routedAt: Date.now(),
        route: 'default_pipeline',
        priority: 0,
      },
    }));
  }

  _calculatePriority(log) {
    const levelPriority = { fatal: 100, error: 80, warn: 50, info: 20, debug: 0 };
    return levelPriority[log.level] || 0;
  }

  _processTraceLinks(logs) {
    const byTraceId = new Map();
    logs.forEach(log => {
      if (!byTraceId.has(log.traceId)) byTraceId.set(log.traceId, []);
      byTraceId.get(log.traceId).push(log);
    });

    byTraceId.forEach((traceLogs, traceId) => {
      if (traceLogs.length < 2) return;

      const sources = new Set(traceLogs.map(l => l.source?.type || l.source));

      if (sources.size >= 2) {
        const linkId = uuidv4();
        const link = {
          linkId,
          traceId,
          linkedSources: [...sources],
          logCount: traceLogs.length,
          linkedAt: Date.now(),
          spanChain: traceLogs
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(l => ({
              spanId: l.spanId,
              parentSpanId: l.parentSpanId,
              source: l.source?.type || l.source,
              terminalId: l.source?.terminalId,
              action: l.action,
              timestamp: l.timestamp,
            })),
        };

        this.traceLinks.set(linkId, link);
        this.stats.traceLinksCreated++;

        if (this.terminalAdapter) {
          this._notifyTraceParticipants(link);
        }
      }
    });
  }

  _notifyTraceParticipants(link) {
    const notified = new Set();
    link.spanChain.forEach(span => {
      if (!notified.has(span.terminalId)) {
        this.terminalAdapter.sendToTerminal(span.terminalId, {
          type: 'trace_linked',
          linkId: link.linkId,
          traceId: link.traceId,
          linkedSources: link.linkedSources,
          totalSpans: link.logCount,
        });
        notified.add(span.terminalId);
      }
    });
  }

  queryTraceChain(traceId) {
    const chain = {
      traceId,
      links: [],
      logs: [],
    };

    this.traceLinks.forEach(link => {
      if (link.traceId === traceId) {
        chain.links.push(link);
      }
    });

    if (this.logIndexer) {
      chain.logs = this.logIndexer.queryByTraceId(traceId);
    }

    return chain;
  }

  bidirectionalTrace(browserTraceId, terminalTraceId) {
    const linkId = uuidv4();

    const browserLogs = this.logIndexer
      ? this.logIndexer.queryByTraceId(browserTraceId)
      : [];
    const terminalLogs = this.logIndexer
      ? this.logIndexer.queryByTraceId(terminalTraceId)
      : [];

    const link = {
      linkId,
      browserTraceId,
      terminalTraceId,
      browserLogCount: browserLogs.length,
      terminalLogCount: terminalLogs.length,
      linkedAt: Date.now(),
      correlationId: uuidv4(),
    };

    this.traceLinks.set(linkId, link);
    this.stats.traceLinksCreated++;

    return link;
  }

  getStats() {
    return {
      ...this.stats,
      routeCount: this.routes.size,
      forwarderCount: this.forwarders.size,
      traceLinkCount: this.traceLinks.size,
    };
  }
}

module.exports = LogRouter;
