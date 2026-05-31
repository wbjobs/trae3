const Router = require('koa-router');
const { SignalModel, DeviceModel, AlertModel } = require('../database');
const { 
  success, 
  error, 
  handleAsync, 
  validateParams, 
  Logger,
  WS_MESSAGE_TYPES,
  isValidSignalData,
  formatSignalData,
  ThrottleManager,
  ChangeTracker,
  PartialUpdateGenerator
} = require('../common');

const logger = new Logger('SignalRoutes');
const router = new Router({ prefix: '/api/signal' });

let wsServer = null;

const throttleManager = new ThrottleManager({
  maxRequestsPerWindow: 5000,
  windowMs: 60000,
  maxBatchSize: 200,
  maxWaitMs: 300,
  dedupTtlMs: 2000,
  perDeviceLimit: 120,
  perDeviceWindowMs: 1000
});

const changeTracker = new ChangeTracker({
  debounceMs: 150,
  maxBatchSize: 100,
  maxWaitMs: 500
});

changeTracker.onChange(async (update, version) => {
  if (wsServer) {
    const partialUpdate = PartialUpdateGenerator.generateNodeUpdate(
      { status: update.data.oldStatus },
      update.data
    );
    if (partialUpdate) {
      wsServer.broadcast(WS_MESSAGE_TYPES.PARTIAL_UPDATE, partialUpdate);
    }
  }
});

throttleManager.setBatchHandler(async (key, batch) => {
  try {
    await SignalModel.bulkInsert(batch);
    
    const updatedDevices = [];
    for (const item of batch) {
      if (item.status) {
        const existingDevice = await DeviceModel.getById(item.device_id);
        if (existingDevice && existingDevice.status !== item.status) {
          const device = await DeviceModel.updateStatus(item.device_id, item.status);
          if (device) {
            changeTracker.trackUpdate(item.device_id, {
              ...device,
              oldStatus: existingDevice.status
            }, 'status_change');
            updatedDevices.push(device);
          }
        }
      }
    }

    if (wsServer) {
      wsServer.broadcast(WS_MESSAGE_TYPES.SIGNAL_UPDATE, batch);
      
      if (updatedDevices.length > 0) {
        const usePartial = PartialUpdateGenerator.shouldUsePartialUpdate(
          updatedDevices.length,
          updatedDevices.length + 10,
          0.3
        );
        
        if (usePartial) {
          const updates = updatedDevices.map(d => 
            PartialUpdateGenerator.generateNodeUpdate({}, d)
          ).filter(Boolean);
          wsServer.broadcast(WS_MESSAGE_TYPES.BATCH_UPDATE, 
            PartialUpdateGenerator.generateBatchUpdate(updates));
        } else {
          wsServer.broadcast(WS_MESSAGE_TYPES.DEVICE_STATUS, updatedDevices);
        }
      }
    }
  } catch (err) {
    logger.error('Batch processing error:', err.message);
  }
});

function setWebSocketServer(server) {
  wsServer = server;
}

router.post('/data', handleAsync(async (ctx) => {
  const { data } = ctx.request.body;
  
  if (!data || !Array.isArray(data)) {
    ctx.status = 400;
    ctx.body = error('请求参数无效，data 必须是数组', 400);
    return;
  }

  if (data.length === 0) {
    ctx.body = success({ received: 0, accepted: 0 }, '没有数据需要处理');
    return;
  }

  if (data.length > 2000) {
    ctx.status = 400;
    ctx.body = error('单次上报数据量不能超过 2000 条', 400);
    return;
  }

  const validData = [];
  const invalidData = [];
  const throttleResults = [];
  
  for (const item of data) {
    if (isValidSignalData(item)) {
      const formatted = formatSignalData(item);
      validData.push(formatted);
      
      const throttleResult = await throttleManager.processData(item.device_id, formatted);
      throttleResults.push(throttleResult);
    } else {
      invalidData.push(item);
    }
  }

  if (invalidData.length > 0) {
    logger.warn(`Invalid signal data: ${invalidData.length} items`);
  }

  const acceptedCount = throttleResults.filter(r => r.allowed).length;
  const rejectedCount = throttleResults.filter(r => !r.allowed).length;
  const duplicateCount = throttleResults.filter(r => r.reason === 'duplicate').length;

  const stats = throttleManager.getStats();
  
  logger.info(`Signal data processed: received=${data.length}, valid=${validData.length}, accepted=${acceptedCount}, rejected=${rejectedCount}, duplicates=${duplicateCount}`);

  ctx.body = success({
    received: data.length,
    valid: validData.length,
    invalid: invalidData.length,
    accepted: acceptedCount,
    rejected: rejectedCount,
    duplicates: duplicateCount,
    throttleStats: {
      acceptanceRate: stats.acceptanceRate,
      pendingBatches: stats.batchAggregator.pending,
      dedupHitRate: stats.deduplicator.hitRate
    }
  }, '信号数据已接收并进入处理队列');
}));

router.get('/latest', handleAsync(async (ctx) => {
  logger.info('Get latest signal for all devices');
  
  const data = await SignalModel.getLatestAllDevices();
  ctx.body = success(data, '获取最新信号数据成功');
}));

router.get('/device/:deviceId', handleAsync(async (ctx) => {
  const { deviceId } = ctx.params;
  const { limit = 10 } = ctx.query;
  logger.info(`Get signal history for device: ${deviceId}, limit: ${limit}`);
  
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

router.get('/throttle/stats', handleAsync(async (ctx) => {
  logger.info('Get throttle manager stats');
  const stats = throttleManager.getStats();
  const changeStats = {
    pendingUpdates: changeTracker.getPendingCount(),
    version: changeTracker.getVersion()
  };
  ctx.body = success({
    throttle: stats,
    changeTracker: changeStats
  }, '获取节流统计成功');
}));

router.post('/throttle/reset', handleAsync(async (ctx) => {
  logger.info('Reset throttle stats');
  throttleManager.resetStats();
  ctx.body = success(null, '节流统计已重置');
}));

module.exports = { router, setWebSocketServer };
