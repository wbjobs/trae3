const http = require('http');
const Koa = require('koa');
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser');
const dotenv = require('dotenv');
const os = require('os');

const WebSocketServer = require('./websocketServer');
const deviceRoutes = require('./deviceRoutes');
const { router: signalRoutes, setWebSocketServer: setSignalWs } = require('./signalRoutes');
const topologyRoutes = require('./topologyRoutes');
const { router: alertRoutes, setWebSocketServer: setAlertWs } = require('./alertRoutes');
const strategyRoutes = require('./strategyRoutes');
const { Logger, success, handleAsync, defaultTaskQueue } = require('../common');
const { getDbStats, getQueryPerformance, clearQueryCache } = require('../database');

const logger = new Logger('Gateway');

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });

const app = new Koa();
const GATEWAY_PORT = process.env.GATEWAY_PORT || 3000;

const requestCounts = {
  total: 0,
  success: 0,
  error: 0,
  byPath: new Map(),
  byMethod: new Map()
};

const responseTimes = [];
const maxResponseTimes = 1000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  headers: ['Content-Type', 'Authorization']
}));

app.use(bodyParser({
  jsonLimit: '20mb',
  formLimit: '20mb',
  onerror: function(err, ctx) {
    logger.error('Body parser error:', err.message);
    ctx.status = 413;
    ctx.body = { success: false, error: '请求体过大' };
  }
}));

app.use(async (ctx, next) => {
  const start = Date.now();
  requestCounts.total++;
  
  const pathKey = ctx.path;
  requestCounts.byPath.set(pathKey, (requestCounts.byPath.get(pathKey) || 0) + 1);
  
  const methodKey = ctx.method;
  requestCounts.byMethod.set(methodKey, (requestCounts.byMethod.get(methodKey) || 0) + 1);
  
  try {
    await next();
    requestCounts.success++;
  } catch (err) {
    requestCounts.error++;
    throw err;
  } finally {
    const ms = Date.now() - start;
    responseTimes.push({ path: ctx.path, method: ctx.method, duration: ms, status: ctx.status, timestamp: Date.now() });
    
    if (responseTimes.length > maxResponseTimes) {
      responseTimes.splice(0, responseTimes.length - maxResponseTimes);
    }
    
    logger.info(`${ctx.method} ${ctx.url} - ${ms}ms - Status: ${ctx.status}`);
  }
});

app.use(deviceRoutes.routes());
app.use(deviceRoutes.allowedMethods());
app.use(signalRoutes.routes());
app.use(signalRoutes.allowedMethods());
app.use(topologyRoutes.routes());
app.use(topologyRoutes.allowedMethods());
app.use(alertRoutes.routes());
app.use(alertRoutes.allowedMethods());
app.use(strategyRoutes.routes());
app.use(strategyRoutes.allowedMethods());

app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = success({
      service: 'gateway',
      ws_clients: wsServer ? wsServer.getClientCount() : 0,
      uptime: process.uptime()
    }, '服务正常');
  } else if (ctx.path === '/api') {
    ctx.body = success({
      endpoints: [
        '/api/device/*',
        '/api/signal/*',
        '/api/topology/*',
        '/api/alert/*',
        '/api/strategy/*',
        '/api/metrics/*'
      ]
    }, 'API 入口');
  } else if (ctx.path === '/api/metrics/system') {
    await handleSystemMetrics(ctx);
  } else if (ctx.path === '/api/metrics/requests') {
    await handleRequestMetrics(ctx);
  } else if (ctx.path === '/api/metrics/database') {
    await handleDatabaseMetrics(ctx);
  } else if (ctx.path === '/api/metrics/performance') {
    await handlePerformanceMetrics(ctx);
  } else if (ctx.path === '/api/metrics/reset') {
    await handleResetMetrics(ctx);
  } else if (ctx.path === '/api/stress/echo' && ctx.method === 'POST') {
    await handleStressEcho(ctx);
  } else if (ctx.path === '/api/stress/db' && ctx.method === 'GET') {
    await handleStressDb(ctx);
  } else if (ctx.path === '/api/cache/clear' && ctx.method === 'POST') {
    await handleClearCache(ctx);
  } else if (ctx.path === '/api/queue/stats') {
    await handleQueueStats(ctx);
  } else if (ctx.path === '/api/queue/pause' && ctx.method === 'POST') {
    await handleQueuePause(ctx);
  } else if (ctx.path === '/api/queue/resume' && ctx.method === 'POST') {
    await handleQueueResume(ctx);
  } else if (ctx.path === '/api/queue/clear' && ctx.method === 'POST') {
    await handleQueueClear(ctx);
  } else {
    await next();
  }
});

async function handleSystemMetrics(ctx) {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  
  ctx.body = success({
    system: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: {
        count: cpus.length,
        model: cpus[0]?.model,
        cores: cpus[0]?.cores || cpus[0]?.times ? cpus[0].cores : cpus.length
      },
      load: {
        load1: loadAvg[0],
        load5: loadAvg[1],
        load15: loadAvg[2]
      },
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem(),
        usagePercent: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
      },
      uptime: os.uptime()
    },
    process: {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      versions: process.versions
    }
  }, '系统指标获取成功');
}

async function handleRequestMetrics(ctx) {
  const recentTimes = responseTimes.slice(-100);
  const avgResponseTime = recentTimes.length > 0
    ? recentTimes.reduce((sum, r) => sum + r.duration, 0) / recentTimes.length
    : 0;
  
  const p50 = calculatePercentile(recentTimes.map(r => r.duration), 50);
  const p95 = calculatePercentile(recentTimes.map(r => r.duration), 95);
  const p99 = calculatePercentile(recentTimes.map(r => r.duration), 99);
  
  ctx.body = success({
    requests: {
      total: requestCounts.total,
      success: requestCounts.success,
      error: requestCounts.error,
      successRate: requestCounts.total > 0
        ? (requestCounts.success / requestCounts.total * 100).toFixed(2)
        : '100.00'
    },
    responseTime: {
      average: avgResponseTime.toFixed(2),
      p50: p50.toFixed(2),
      p95: p95.toFixed(2),
      p99: p99.toFixed(2),
      sampleCount: recentTimes.length
    },
    byPath: Object.fromEntries(requestCounts.byPath),
    byMethod: Object.fromEntries(requestCounts.byMethod)
  }, '请求指标获取成功');
}

async function handleDatabaseMetrics(ctx) {
  const dbStats = getDbStats();
  const queryStats = getQueryPerformance();
  
  ctx.body = success({
    pool: dbStats.pool,
    cache: dbStats.cache,
    slowQueries: queryStats.slowQueries,
    frequentQueries: queryStats.frequentQueries
  }, '数据库指标获取成功');
}

async function handlePerformanceMetrics(ctx) {
  const { DeviceModel, SignalModel, AlertModel, StrategyModel } = require('../database');
  
  const deviceStats = await DeviceModel.getSummary();
  const alertStats = await AlertModel.getStats();
  const strategyStats = await StrategyModel.getStats();
  const dbStats = getDbStats();
  
  ctx.body = success({
    devices: deviceStats,
    alerts: alertStats,
    strategies: strategyStats,
    database: {
      pool: dbStats.pool,
      cache: dbStats.cache
    }
  }, '性能指标获取成功');
}

async function handleResetMetrics(ctx) {
  requestCounts.total = 0;
  requestCounts.success = 0;
  requestCounts.error = 0;
  requestCounts.byPath.clear();
  requestCounts.byMethod.clear();
  responseTimes.length = 0;
  
  ctx.body = success(null, '指标已重置');
}

async function handleStressEcho(ctx) {
  const { data = {}, count = 1 } = ctx.request.body;
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < Math.min(count, 1000); i++) {
    results.push({
      index: i,
      timestamp: Date.now(),
      data: data
    });
  }
  
  const duration = Date.now() - startTime;
  
  ctx.body = success({
    count: results.length,
    duration,
    throughput: results.length / (duration / 1000),
    results
  }, '压力测试完成');
}

async function handleStressDb(ctx) {
  const { limit = 100 } = ctx.query;
  const startTime = Date.now();
  
  const { SignalModel, DeviceModel } = require('../database');
  
  const signals = await SignalModel.getLatestAllDevices();
  const devices = await DeviceModel.getAll();
  
  const duration = Date.now() - startTime;
  
  ctx.body = success({
    signals: signals.length,
    devices: devices.length,
    duration,
    throughput: 2 / (duration / 1000)
  }, '数据库压测完成');
}

async function handleClearCache(ctx) {
  clearQueryCache();
  ctx.body = success(null, '查询缓存已清除');
}

async function handleQueueStats(ctx) {
  const stats = defaultTaskQueue.getStats();
  ctx.body = success(stats, '任务队列状态获取成功');
}

async function handleQueuePause(ctx) {
  defaultTaskQueue.pause();
  ctx.body = success(null, '任务队列已暂停');
}

async function handleQueueResume(ctx) {
  defaultTaskQueue.resume();
  ctx.body = success(null, '任务队列已恢复');
}

async function handleQueueClear(ctx) {
  const cleared = defaultTaskQueue.clear();
  ctx.body = success({ cleared }, '任务队列已清空');
}

function calculatePercentile(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)];
}

const server = http.createServer(app.callback());
const wsServer = new WebSocketServer(server);

setSignalWs(wsServer);
setAlertWs(wsServer);

server.listen(GATEWAY_PORT, () => {
  logger.info(`Gateway Service running on port ${GATEWAY_PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('WebSocket server ready');
  logger.info('Performance metrics endpoints available at /api/metrics/*');
});

process.on('SIGINT', () => {
  logger.info('Shutting down gateway...');
  wsServer.close();
  server.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = { wsServer };
