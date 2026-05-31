const Router = require('koa-router');
const { DeviceModel, SignalModel } = require('../database');
const { success, error, handleAsync, validateParams, Logger } = require('../common');

const logger = new Logger('DeviceRoutes');
const router = new Router({ prefix: '/api/device' });

router.get('/', handleAsync(async (ctx) => {
  logger.info('Get all devices');
  const devices = await DeviceModel.getAll();
  ctx.body = success(devices, '获取设备列表成功');
}));

router.get('/:deviceId', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  logger.info(`Get device: ${deviceId}`);
  
  const validation = validateParams(ctx.params, ['deviceId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const device = await DeviceModel.getById(deviceId);
  if (!device) {
    ctx.status = 404;
    ctx.body = error('设备不存在', 404);
    return;
  }
  
  ctx.body = success(device, '获取设备详情成功');
}));

router.get('/type/:type', handleAsync(async (ctx) => {
  const { type } = ctx.params;
  logger.info(`Get devices by type: ${type}`);
  
  const validation = validateParams(ctx.params, ['type']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const devices = await DeviceModel.getByType(type);
  ctx.body = success(devices, '获取设备列表成功');
}));

router.post('/', handleAsync(async (ctx) => {
  const deviceData = ctx.request.body;
  logger.info('Create device', deviceData.device_id);
  
  const validation = validateParams(deviceData, ['device_id', 'device_type', 'name']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const validTypes = ['ap', 'repeater', 'endpoint'];
  if (!validTypes.includes(deviceData.device_type)) {
    ctx.status = 400;
    ctx.body = error(`无效的设备类型，必须是: ${validTypes.join(', ')}`, 400);
    return;
  }

  const device = await DeviceModel.create(deviceData);
  ctx.body = success(device, '创建设备成功');
}));

router.put('/:deviceId/status', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { status } = ctx.request.body;
  logger.info(`Update device status: ${deviceId} -> ${status}`);
  
  const validation = validateParams({ deviceId, status }, ['deviceId', 'status']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const validStatus = ['online', 'offline', 'warning'];
  if (!validStatus.includes(status)) {
    ctx.status = 400;
    ctx.body = error(`无效的状态值，必须是: ${validStatus.join(', ')}`, 400);
    return;
  }

  const device = await DeviceModel.updateStatus(deviceId, status);
  if (!device) {
    ctx.status = 404;
    ctx.body = error('设备不存在', 404);
    return;
  }
  
  ctx.body = success(device, '更新设备状态成功');
}));

router.delete('/:deviceId', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  logger.info(`Delete device: ${deviceId}`);
  
  const validation = validateParams(ctx.params, ['deviceId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const device = await DeviceModel.delete(deviceId);
  if (!device) {
    ctx.status = 404;
    ctx.body = error('设备不存在', 404);
    return;
  }
  
  ctx.body = success(device, '删除设备成功');
}));

router.get('/:deviceId/signal/latest', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { limit = 1 } = ctx.query;
  logger.info(`Get latest signal for device: ${deviceId}, limit: ${limit}`);
  
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

  const data = await SignalModel.getLatestByDevice(deviceId, limitNum);
  ctx.body = success(data, '获取信号数据成功');
}));

router.get('/:deviceId/signal/history', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { start_time, end_time } = ctx.query;
  logger.info(`Get signal history for device: ${deviceId}`);
  
  const validation = validateParams({ deviceId, start_time, end_time }, ['deviceId', 'start_time', 'end_time']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const startTime = new Date(start_time);
  const endTime = new Date(end_time);
  
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    ctx.status = 400;
    ctx.body = error('时间格式无效，请使用 ISO 格式', 400);
    return;
  }

  if (startTime >= endTime) {
    ctx.status = 400;
    ctx.body = error('开始时间必须小于结束时间', 400);
    return;
  }

  const data = await SignalModel.getByTimeRange(deviceId, startTime, endTime);
  ctx.body = success(data, '获取历史信号数据成功');
}));

router.get('/:deviceId/signal/aggregated', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { start_time, end_time, interval = '5m' } = ctx.query;
  logger.info(`Get aggregated signal for device: ${deviceId}, interval: ${interval}`);
  
  const validation = validateParams({ deviceId, start_time, end_time }, ['deviceId', 'start_time', 'end_time']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const startTime = new Date(start_time);
  const endTime = new Date(end_time);
  
  if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
    ctx.status = 400;
    ctx.body = error('时间格式无效，请使用 ISO 格式', 400);
    return;
  }

  const validIntervals = ['1m', '5m', '15m', '30m', '1h', '12h', '1d'];
  if (!validIntervals.includes(interval)) {
    ctx.status = 400;
    ctx.body = error(`无效的时间间隔，必须是: ${validIntervals.join(', ')}`, 400);
    return;
  }

  const data = await SignalModel.getAggregated(deviceId, startTime, endTime, interval);
  ctx.body = success(data, '获取聚合信号数据成功');
}));

module.exports = router;
