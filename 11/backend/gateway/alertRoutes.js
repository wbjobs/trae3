const Router = require('koa-router');
const { AlertModel } = require('../database');
const { 
  success, 
  error, 
  handleAsync, 
  validateParams, 
  Logger,
  WS_MESSAGE_TYPES
} = require('../common');

const logger = new Logger('AlertRoutes');
const router = new Router({ prefix: '/api/alert' });

let wsServer = null;

function setWebSocketServer(server) {
  wsServer = server;
}

router.get('/', handleAsync(async (ctx) => {
  const { limit = 100, status, severity } = ctx.query;
  logger.info('Get alerts', { limit, status, severity });
  
  const limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    ctx.status = 400;
    ctx.body = error('limit 参数必须是 1-1000 之间的整数', 400);
    return;
  }

  let alerts;
  if (severity) {
    const validSeverities = ['critical', 'warning', 'info'];
    if (!validSeverities.includes(severity)) {
      ctx.status = 400;
      ctx.body = error(`无效的告警级别，必须是: ${validSeverities.join(', ')}`, 400);
      return;
    }
    alerts = await AlertModel.getBySeverity(severity, limitNum);
  } else if (status === 'active') {
    alerts = await AlertModel.getActive();
  } else {
    alerts = await AlertModel.getAll(limitNum);
  }

  if (status) {
    alerts = alerts.filter(a => a.status === status);
  }

  ctx.body = success(alerts, '获取告警列表成功');
}));

router.get('/active', handleAsync(async (ctx) => {
  logger.info('Get active alerts');
  
  const alerts = await AlertModel.getActive();
  ctx.body = success(alerts, '获取未处理告警成功');
}));

router.get('/device/:deviceId', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { limit = 50 } = ctx.query;
  logger.info(`Get alerts for device: ${deviceId}`);
  
  const validation = validateParams(ctx.params, ['deviceId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    ctx.status = 400;
    ctx.body = error('limit 参数必须是 1-1000 之间的整数', 400);
    return;
  }

  const alerts = await AlertModel.getByDevice(deviceId, limitNum);
  ctx.body = success(alerts, '获取设备告警成功');
}));

router.get('/severity/:severity', handleAsync(async (ctx) => {
  const { severity } = ctx.params;
  const { limit = 50 } = ctx.query;
  logger.info(`Get alerts by severity: ${severity}`);
  
  const validation = validateParams(ctx.params, ['severity']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const validSeverities = ['critical', 'warning', 'info'];
  if (!validSeverities.includes(severity)) {
    ctx.status = 400;
    ctx.body = error(`无效的告警级别，必须是: ${validSeverities.join(', ')}`, 400);
    return;
  }

  const limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    ctx.status = 400;
    ctx.body = error('limit 参数必须是 1-1000 之间的整数', 400);
    return;
  }

  const alerts = await AlertModel.getBySeverity(severity, limitNum);
  ctx.body = success(alerts, '获取告警列表成功');
}));

router.get('/stats', handleAsync(async (ctx) => {
  logger.info('Get alert stats');
  
  const stats = await AlertModel.getCountBySeverity();
  ctx.body = success(stats, '获取告警统计成功');
}));

router.post('/', handleAsync(async (ctx) => {
  const alertData = ctx.request.body;
  logger.info('Create alert for device:', alertData.device_id);
  
  const validation = validateParams(alertData, ['device_id', 'alert_type', 'severity', 'message']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const validSeverities = ['critical', 'warning', 'info'];
  if (!validSeverities.includes(alertData.severity)) {
    ctx.status = 400;
    ctx.body = error(`无效的告警级别，必须是: ${validSeverities.join(', ')}`, 400);
    return;
  }

  const alert = await AlertModel.create(alertData);
  
  if (wsServer) {
    wsServer.broadcast(WS_MESSAGE_TYPES.ALERT_CREATED, alert);
  }
  
  ctx.body = success(alert, '创建告警成功');
}));

router.put('/:alertId/resolve', handleAsync(async (ctx) => {
  const { alertId } = ctx.params;
  logger.info(`Resolve alert: ${alertId}`);
  
  const validation = validateParams(ctx.params, ['alertId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const alert = await AlertModel.resolve(alertId);
  if (!alert) {
    ctx.status = 404;
    ctx.body = error('告警不存在', 404);
    return;
  }
  
  ctx.body = success(alert, '告警已处理');
}));

router.delete('/:alertId', handleAsync(async (ctx) => {
  const { alertId } = ctx.params;
  logger.info(`Delete alert: ${alertId}`);
  
  const validation = validateParams(ctx.params, ['alertId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const alert = await AlertModel.delete(alertId);
  if (!alert) {
    ctx.status = 404;
    ctx.body = error('告警不存在', 404);
    return;
  }
  
  ctx.body = success(alert, '删除告警成功');
}));

module.exports = { router, setWebSocketServer };
