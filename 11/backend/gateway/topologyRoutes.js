const Router = require('koa-router');
const { DeviceModel } = require('../database');
const { success, error, handleAsync, Logger } = require('../common');

const logger = new Logger('TopologyRoutes');
const router = new Router({ prefix: '/api/topology' });

router.get('/', handleAsync(async (ctx) => {
  logger.info('Get topology');
  
  const topology = await DeviceModel.getTopology();
  
  if (!topology.devices || !topology.links) {
    ctx.status = 500;
    ctx.body = error('获取拓扑数据失败', 500);
    return;
  }
  
  ctx.body = success(topology, '获取拓扑数据成功');
}));

router.get('/summary', handleAsync(async (ctx) => {
  logger.info('Get topology summary');
  
  const [onlineCount, offlineCount, devices] = await Promise.all([
    DeviceModel.getOnlineCount(),
    DeviceModel.getOfflineCount(),
    DeviceModel.getAll()
  ]).catch(err => {
    logger.error('Get summary error:', err);
    throw err;
  });

  const typeStats = devices.reduce((acc, dev) => {
    acc[dev.device_type] = (acc[dev.device_type] || 0) + 1;
    return acc;
  }, {});

  const statusStats = devices.reduce((acc, dev) => {
    acc[dev.status] = (acc[dev.status] || 0) + 1;
    return acc;
  }, {});

  ctx.body = success({
    total: devices.length,
    online: onlineCount,
    offline: offlineCount,
    by_type: typeStats,
    by_status: statusStats
  }, '获取统计摘要成功');
}));

router.get('/tree', handleAsync(async (ctx) => {
  logger.info('Get topology tree');
  
  const { devices, links } = await DeviceModel.getTopology();
  
  const deviceMap = new Map();
  devices.forEach(d => deviceMap.set(d.device_id, { ...d, children: [] }));
  
  const rootDevices = [];
  
  links.forEach(link => {
    const source = deviceMap.get(link.source_device_id);
    const target = deviceMap.get(link.target_device_id);
    
    if (source && target) {
      source.children.push({
        ...target,
        link_quality: link.quality,
        link_type: link.link_type
      });
    }
  });
  
  devices.forEach(d => {
    if (!d.parent_device_id) {
      rootDevices.push(deviceMap.get(d.device_id));
    }
  });

  ctx.body = success(rootDevices, '获取拓扑树成功');
}));

module.exports = router;
