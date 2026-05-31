const express = require('express');
const http = require('http');
const path = require('path');

const config = require('./config');
const TerminalAdapter = require('./src/terminal/terminal-adapter');
const LogFormatter = require('./src/collector/log-formatter');
const LogRouter = require('./src/gateway/log-router');
const WsGateway = require('./src/gateway/ws-gateway');
const LogStore = require('./src/store/log-store');
const LogIndexer = require('./src/store/log-indexer');
const TraceHighlighter = require('./src/store/trace-highlighter');
const { RequestScheduler } = require('./src/gateway/request-scheduler');
const LogCompressor = require('./src/collector/log-compressor');

class LogTraceSystem {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.terminalAdapter = new TerminalAdapter();
    this.logFormatter = LogFormatter;
    this.logIndexer = new LogIndexer();
    this.scheduler = new RequestScheduler({
      maxConcurrency: 20,
      maxQueueSize: 5000,
      maxBatchSize: 50,
    });
    this.logRouter = new LogRouter({
      terminalAdapter: this.terminalAdapter,
      logIndexer: this.logIndexer,
    });
    this.logStore = null;
    this.wsGateway = null;
    this._setupMiddleware();
    this._setupRoutes();
  }

  _setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  _setupRoutes() {
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'running',
        uptime: process.uptime(),
        gateway: this.wsGateway ? this.wsGateway.getStats() : null,
        indexer: this.logIndexer.getStats(),
        terminals: this.terminalAdapter.checkHealth(),
        router: this.logRouter.getStats(),
      });
    });

    this.app.get('/api/terminals', (req, res) => {
      const type = req.query.type || null;
      res.json({
        terminals: this.terminalAdapter.getOnlineTerminals(type),
        health: this.terminalAdapter.checkHealth(),
      });
    });

    this.app.get('/api/logs/trace/:traceId', (req, res) => {
      const { traceId } = req.params;
      const memoryResults = this.logIndexer.queryByTraceId(traceId);
      const chain = this.logIndexer.getTraceChain(traceId);

      res.json({
        traceId,
        chain,
        spans: memoryResults,
        routerChain: this.logRouter.queryTraceChain(traceId),
      });
    });

    this.app.get('/api/logs/terminal/:terminalId', (req, res) => {
      const { terminalId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 50;
      const memoryResults = this.logIndexer.queryByTerminalId(terminalId, { limit });

      res.json({
        terminalId,
        logs: memoryResults,
      });
    });

    this.app.get('/api/logs/search', (req, res) => {
      const { startTime, endTime, sourceType, level, limit } = req.query;
      const st = startTime ? parseInt(startTime, 10) : Date.now() - 3600000;
      const et = endTime ? parseInt(endTime, 10) : Date.now();

      const results = this.logIndexer.queryByTimeRange(st, et, {
        sourceType,
        level: level ? parseInt(level, 10) : undefined,
        limit: parseInt(limit, 10) || 100,
      });

      res.json({ logs: results, count: results.length });
    });

    this.app.get('/api/traces/cross-source', (req, res) => {
      res.json({
        traces: this.logIndexer.findCrossSourceTraces(),
      });
    });

    this.app.post('/api/trace/link', (req, res) => {
      const { browserTraceId, terminalTraceId } = req.body;
      if (!browserTraceId || !terminalTraceId) {
        return res.status(400).json({ error: 'Both browserTraceId and terminalTraceId required' });
      }
      const link = this.logRouter.bidirectionalTrace(browserTraceId, terminalTraceId);

      if (this.logStore) {
        this.logStore.insertTraceLink(link).catch(() => {});
      }

      res.json(link);
    });

    this.app.get('/api/stats/logs', async (req, res) => {
      let dbStats = null;
      if (this.logStore) {
        dbStats = this.logStore.getLogStats();
      }
      res.json({
        memory: this.logIndexer.getStats(),
        database: dbStats,
      });
    });

    this.app.post('/api/command/broadcast', (req, res) => {
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message required' });
      }
      const sent = this.wsGateway.broadcast(message);
      res.json({ sent, totalOnline: this.terminalAdapter.getOnlineCount() });
    });

    this.app.post('/api/command/terminal/:terminalId', (req, res) => {
      const { terminalId } = req.params;
      const { message } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message required' });
      }
      const sent = this.terminalAdapter.sendToTerminal(terminalId, message);
      res.json({ sent, terminalId });
    });

    this.app.get('/api/logs/search/fulltext', async (req, res) => {
      const { keyword, startTime, endTime, sourceType, level, limit, terminalId } = req.query;
      if (!keyword) {
        return res.status(400).json({ error: 'keyword required' });
      }
      const st = startTime ? parseInt(startTime, 10) : Date.now() - 3600000;
      const et = endTime ? parseInt(endTime, 10) : Date.now();

      const results = this.logStore.searchLogs(keyword, {
        startTime: st,
        endTime: et,
        sourceType,
        level: level ? parseInt(level, 10) : undefined,
        terminalId,
        limit: parseInt(limit, 10) || 100,
      });

      res.json({ logs: results, count: results.length, keyword });
    });

    this.app.get('/api/logs/aggregates', (req, res) => {
      const timeRange = parseInt(req.query.timeRange, 10) || 3600000;
      const stats = this.logStore.getAggregatedStats(timeRange);
      res.json({
        stats,
        timeRange,
        timeUnit: 'milliseconds',
        bucketSize: 60000,
      });
    });

    this.app.get('/api/logs/trace/:traceId/highlight', (req, res) => {
      const { traceId } = req.params;
      const { focusSpanId, expandDepth, minSeverity } = req.query;
      const result = this.logIndexer.getHighlightedTrace(traceId, {
        focusSpanId,
        expandDepth: expandDepth ? parseInt(expandDepth, 10) : undefined,
        minSeverity: minSeverity ? parseInt(minSeverity, 10) : undefined,
      });
      res.json(result || { error: 'Trace not found' });
    });

    this.app.get('/api/logs/trace/:traceId/locate/:spanId', (req, res) => {
      const { traceId, spanId } = req.params;
      const result = this.logIndexer.locateSpan(traceId, spanId);
      res.json(result || { error: 'Span not found' });
    });

    this.app.get('/api/logs/trace/:traceId/search', (req, res) => {
      const { traceId } = req.params;
      const { keyword, includeSpans } = req.query;
      if (!keyword) {
        return res.status(400).json({ error: 'keyword required' });
      }
      const result = this.logIndexer.searchInTrace(traceId, keyword, {
        includeSpans: includeSpans === 'true',
      });
      res.json(result);
    });

    this.app.get('/api/highlight/rules', (req, res) => {
      const rules = this.logIndexer.getHighlightRules();
      res.json({ rules, count: rules.length });
    });

    this.app.post('/api/highlight/rules', (req, res) => {
      const rule = req.body;
      if (!rule.name || !rule.match) {
        return res.status(400).json({ error: 'name and match fields required' });
      }
      const result = this.logIndexer.addHighlightRule(rule);
      res.json(result);
    });

    this.app.put('/api/highlight/rules/:ruleId', (req, res) => {
      const { ruleId } = req.params;
      const updates = req.body;
      const result = this.logIndexer.updateHighlightRule(ruleId, updates);
      if (!result) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      res.json(result);
    });

    this.app.delete('/api/highlight/rules/:ruleId', (req, res) => {
      const { ruleId } = req.params;
      const deleted = this.logIndexer.removeHighlightRule(ruleId);
      if (!deleted) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      res.json({ success: true, deletedId: ruleId });
    });

    this.app.get('/api/stats/performance', (req, res) => {
      const schedStats = this.scheduler.getStats();
      const compressStats = LogCompressor.getStats();
      const gatewayStats = this.wsGateway ? this.wsGateway.getStats() : null;
      res.json({
        scheduler: schedStats,
        compression: {
          compressor: compressStats,
          gateway: gatewayStats ? gatewayStats.compression : null,
        },
      });
    });

    this.app.get('/api/logs/query/explain', (req, res) => {
      const { traceId } = req.query;
      if (!traceId) {
        return res.status(400).json({ error: 'traceId required' });
      }
      const plan = this.logStore.queryByTraceId(traceId, { explain: true });
      res.json({
        traceId,
        queryPlan: plan,
        indexes: [
          'idx_logs_trace_time (trace_id, timestamp)',
          'idx_logs_terminal_time (terminal_id, timestamp)',
          'idx_logs_source_time (source_type, timestamp)',
          'idx_logs_level_time (level_value, timestamp)',
          'idx_logs_source_level (source_type, level_value)',
          'idx_logs_source_category (source_type, category)',
        ],
      });
    });
  }

  async start() {
    console.log('[LogTraceSystem] Initializing...');

    this.logStore = new LogStore({
      onError: (err, row) => {
        console.error(`[LogTraceSystem] Store write error for log ${row.id}: ${err.message}`);
      },
    });
    await this.logStore.init();
    console.log('[LogTraceSystem] Database initialized');

    this.logRouter.logStore = this.logStore;

    this.wsGateway = new WsGateway({
      terminalAdapter: this.terminalAdapter,
      logRouter: this.logRouter,
      logStore: this.logStore,
      logIndexer: this.logIndexer,
      logFormatter: this.logFormatter,
      scheduler: this.scheduler,
    });

    this.wsGateway.attach(this.server);
    console.log('[LogTraceSystem] WebSocket gateway attached');

    this.wsGateway.on('terminal_registered', ({ terminalId, type }) => {
      console.log(`[LogTraceSystem] Terminal registered: ${terminalId} (${type})`);
      const terminal = this.terminalAdapter.getTerminal(terminalId);
      if (terminal) {
        this.logStore.upsertTerminal(terminal.meta);
      }
    });

    this.wsGateway.on('logs_received', ({ terminalId, count }) => {
      console.log(`[LogTraceSystem] Logs received: ${count} from ${terminalId}`);
    });

    this.wsGateway.on('store_error', ({ terminalId, error, logCount }) => {
      console.error(`[LogTraceSystem] Store error from ${terminalId}: ${error}, ${logCount} logs affected`);
    });

    this._startPeriodicTasks();

    this.server.listen(config.server.port, config.server.host, () => {
      console.log(`[LogTraceSystem] Server running at http://${config.server.host}:${config.server.port}`);
      console.log(`[LogTraceSystem] WebSocket endpoint: ws://${config.server.host}:${config.server.port}${config.server.wsPath}`);
      console.log(`[LogTraceSystem] Dashboard: http://${config.server.host}:${config.server.port}/`);
    });
  }

  _startPeriodicTasks() {
    setInterval(() => {
      const health = this.terminalAdapter.checkHealth();
      if (health.stale > 0) {
        console.log(`[LogTraceSystem] Health check: ${health.online} online, ${health.stale} stale`);
      }

      const cleaned = this.terminalAdapter.cleanupStale();
      if (cleaned > 0) {
        console.log(`[LogTraceSystem] Cleaned up ${cleaned} stale terminals`);
      }
    }, 60000);

    setInterval(() => {
      if (this.logStore) {
        this.logStore._flushBuffer();
      }
    }, 10000);

    setInterval(() => {
      const schedStats = this.scheduler.getStats();
      if (schedStats.waiting > 0 || schedStats.overloaded) {
        console.log(`[LogTraceSystem] Scheduler: ${schedStats.waiting} waiting, ${schedStats.active} active, ${schedStats.completed} completed, overloaded=${schedStats.overloaded}`);
      }
    }, 30000);
  }

  async shutdown() {
    console.log('[LogTraceSystem] Shutting down...');

    if (this.wsGateway) {
      this.wsGateway.shutdown();
    }

    if (this.scheduler) {
      this.scheduler.shutdown();
    }

    if (this.logStore) {
      this.logStore.close();
    }

    this.server.close();
    console.log('[LogTraceSystem] Shutdown complete');
  }
}

const system = new LogTraceSystem();

process.on('SIGINT', async () => {
  await system.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await system.shutdown();
  process.exit(0);
});

system.start().catch(err => {
  console.error('[LogTraceSystem] Failed to start:', err);
  process.exit(1);
});

module.exports = LogTraceSystem;
