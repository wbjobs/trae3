const Koa = require('koa');
const Router = require('koa-router');
const cors = require('koa-cors');
const bodyParser = require('koa-bodyparser');
const dotenv = require('dotenv');

const StrategyEngine = require('./strategyEngine');
const SignalSubscriber = require('./signalSubscriber');
const { success, error, handleAsync, validateParams, Logger } = require('../common');

const logger = new Logger('StrategyServer');

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });

const app = new Koa();
const router = new Router();
const engine = new StrategyEngine();
const subscriber = new SignalSubscriber(engine);

const STRATEGY_PORT = process.env.STRATEGY_PORT || 3002;

app.use(cors());
app.use(bodyParser());

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  logger.info(`${ctx.method} ${ctx.url} - ${ms}ms`);
});

router.get('/health', handleAsync(async (ctx) => {
  ctx.body = success({
    service: 'strategy-engine',
    cachedDevices: engine.deviceSignalCache.size,
    conditionStates: engine.conditionState.size,
    uptime: process.uptime()
  }, '服务正常');
}));

router.get('/cache', handleAsync(async (ctx) => {
  ctx.body = success({
    count: engine.deviceSignalCache.size,
    data: engine.getAllCachedSignals()
  });
}));

router.get('/cache/:deviceId', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const validation = validateParams(ctx.params, ['deviceId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }
  const data = engine.getCachedSignal(deviceId);
  ctx.body = success(data || null);
}));

router.get('/states', handleAsync(async (ctx) => {
  ctx.body = success({
    count: engine.conditionState.size,
    data: engine.getAllConditionStates()
  });
}));

router.delete('/cache', handleAsync(async (ctx) => {
  engine.clearCache();
  ctx.body = success(null, '缓存已清除');
}));

router.post('/test', handleAsync(async (ctx) => {
  const { signalData } = ctx.request.body;
  const validation = validateParams(ctx.request.body, ['signalData']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }
  const results = await engine.processSignalData(signalData);
  ctx.body = success({ results }, '策略执行完成');
}));

app.use(router.routes());
app.use(router.allowedMethods());

async function startServer() {
  await subscriber.start();

  app.listen(STRATEGY_PORT, () => {
    logger.info(`Strategy Engine Service running on port ${STRATEGY_PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

process.on('SIGINT', () => {
  logger.info('Shutting down strategy engine...');
  subscriber.close();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
