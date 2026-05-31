import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Message, ApiResponse } from '../types';
import { getLogger, cleanupLogs, getLogStats } from '../modules/logger';
import { queueRouterService } from '../modules/queue-router';
import { messageForwarderService } from '../modules/message-forwarder';
import { loadStatsService } from '../modules/load-stats';
import { validateMessage } from './middleware';

const logger = getLogger('APIRoutes');
const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '服务正常运行',
    data: {
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: '1.0.0',
    },
    requestId: uuidv4(),
    timestamp: Date.now(),
  };
  res.json(response);
});

router.post('/messages', validateMessage, async (req: Request, res: Response) => {
  try {
    const { type, priority, payload, targetRegion, source } = req.body;

    const message: Message = {
      id: uuidv4(),
      type,
      priority,
      payload,
      targetRegion,
      source: source || 'api-gateway',
      timestamp: Date.now(),
      metadata: {
        requestId: req.context.requestId,
        traceId: req.context.traceId,
        userId: req.headers['x-user-id'] as string,
        clientIp: req.ip,
        userAgent: req.get('User-Agent'),
        retryCount: 0,
      },
    };

    const job = await queueRouterService.enqueueMessage(message);

    const response: ApiResponse = {
      success: true,
      code: 202,
      message: '消息已接受，正在处理中',
      data: {
        messageId: message.id,
        jobId: job.id,
        status: job.status,
      },
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };

    res.status(202).json(response);
  } catch (error) {
    logger.error('消息入队失败', error as Error, req.context.requestId, req.context.traceId);
    const response: ApiResponse = {
      success: false,
      code: 500,
      message: '消息处理失败',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

router.post('/messages/sync', validateMessage, async (req: Request, res: Response) => {
  try {
    const { type, priority, payload, targetRegion, source } = req.body;

    const message: Message = {
      id: uuidv4(),
      type,
      priority,
      payload,
      targetRegion,
      source: source || 'api-gateway',
      timestamp: Date.now(),
      metadata: {
        requestId: req.context.requestId,
        traceId: req.context.traceId,
        userId: req.headers['x-user-id'] as string,
        clientIp: req.ip,
        userAgent: req.get('User-Agent'),
        retryCount: 0,
      },
    };

    const selectedRegion = targetRegion || queueRouterService.selectTargetRegion(message);

    if (!selectedRegion) {
      const response: ApiResponse = {
        success: false,
        code: 503,
        message: '没有可用的区域集群',
        requestId: req.context.requestId,
        timestamp: Date.now(),
      };
      res.status(503).json(response);
      return;
    }

    const result = await messageForwarderService.forwardMessageWithFallback(message, selectedRegion);

    const response: ApiResponse = {
      success: result.success,
      code: result.success ? 200 : 500,
      message: result.success ? '消息发送成功' : '消息发送失败',
      data: {
        messageId: result.messageId,
        regionId: result.regionId,
        latency: result.latency,
        error: result.error,
      },
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };

    res.status(result.success ? 200 : 500).json(response);
  } catch (error) {
    logger.error('同步消息发送失败', error as Error, req.context.requestId, req.context.traceId);
    const response: ApiResponse = {
      success: false,
      code: 500,
      message: '消息处理失败',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(500).json(response);
  }
});

router.get('/stats/overview', (_req: Request, res: Response) => {
  const overview = loadStatsService.getSystemOverview();

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取系统概览成功',
    data: overview,
    requestId: _req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/stats/regions', (_req: Request, res: Response) => {
  const regionStats = loadStatsService.getAllRegionStats();
  const clusterStatuses = messageForwarderService.getAllClusterStatuses();

  const data = clusterStatuses.map(cluster => ({
    ...cluster,
    stats: regionStats.get(cluster.id),
  }));

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取区域统计成功',
    data,
    requestId: _req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/stats/regions/:regionId', (req: Request, res: Response) => {
  const { regionId } = req.params;
  const stats = loadStatsService.getRegionStats(regionId);
  const cluster = messageForwarderService.getClusterStatus(regionId);

  if (!cluster) {
    const response: ApiResponse = {
      success: false,
      code: 404,
      message: '区域不存在',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(404).json(response);
    return;
  }

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取区域统计成功',
    data: {
      cluster,
      stats,
    },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/stats/regions/:regionId/history', (req: Request, res: Response) => {
  const { regionId } = req.params;
  const limit = parseInt(req.query.limit as string) || 100;

  const history = loadStatsService.getRegionHistory(regionId, limit);

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取区域历史统计成功',
    data: {
      regionId,
      history,
    },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/admin/queues', async (_req: Request, res: Response) => {
  const queueStats = await queueRouterService.getQueueStats();

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取队列统计成功',
    data: queueStats,
    requestId: _req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/admin/strategy', (req: Request, res: Response) => {
  const strategy = queueRouterService.getRoutingStrategy();

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取路由策略成功',
    data: { strategy },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.put('/admin/strategy', (req: Request, res: Response) => {
  const { strategy } = req.body;
  const validStrategies = ['round-robin', 'weighted', 'least-load', 'region-affinity'];

  if (!validStrategies.includes(strategy)) {
    const response: ApiResponse = {
      success: false,
      code: 400,
      message: '无效的路由策略',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(400).json(response);
    return;
  }

  queueRouterService.setRoutingStrategy(strategy);

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '路由策略已更新',
    data: { strategy },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.post('/admin/queues/:queueName/pause', async (req: Request, res: Response) => {
  const { queueName } = req.params;
  const success = await queueRouterService.pauseQueue(queueName);

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '队列已暂停' : '队列不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.post('/admin/queues/:queueName/resume', async (req: Request, res: Response) => {
  const { queueName } = req.params;
  const success = await queueRouterService.resumeQueue(queueName);

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '队列已恢复' : '队列不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.delete('/admin/queues/:queueName', async (req: Request, res: Response) => {
  const { queueName } = req.params;
  const success = await queueRouterService.clearQueue(queueName);

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '队列已清空' : '队列不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.post('/admin/regions/:regionId/reset', (req: Request, res: Response) => {
  const { regionId } = req.params;
  const success = messageForwarderService.resetClusterStatus(regionId);

  if (success) {
    loadStatsService.resetRegionStats(regionId);
  }

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '区域状态已重置' : '区域不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.get('/admin/clusters', (_req: Request, res: Response) => {
  const clusters = messageForwarderService.getAllClusterStatuses();

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取集群状态成功',
    data: clusters,
    requestId: _req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.post('/admin/clusters', (req: Request, res: Response) => {
  const { id, name, endpoint, weight, maxLoad } = req.body;

  if (!id || !name || !endpoint) {
    const response: ApiResponse = {
      success: false,
      code: 400,
      message: '缺少必要参数: id, name, endpoint',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(400).json(response);
    return;
  }

  const success = messageForwarderService.addCluster({
    id,
    name,
    endpoint,
    weight: weight || 100,
    status: 'online',
    currentLoad: 0,
    maxLoad: maxLoad || 1000,
  });

  const response: ApiResponse = {
    success,
    code: success ? 201 : 409,
    message: success ? '集群添加成功' : '集群已存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 201 : 409).json(response);
});

router.put('/admin/clusters/:clusterId', (req: Request, res: Response) => {
  const { clusterId } = req.params;
  const updates = req.body;

  const success = messageForwarderService.updateCluster(clusterId, updates);

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '集群更新成功' : '集群不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.delete('/admin/clusters/:clusterId', (req: Request, res: Response) => {
  const { clusterId } = req.params;
  const success = messageForwarderService.removeCluster(clusterId);

  const response: ApiResponse = {
    success,
    code: success ? 200 : 404,
    message: success ? '集群删除成功' : '集群不存在',
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.status(success ? 200 : 404).json(response);
});

router.post('/admin/clusters/reload', (req: Request, res: Response) => {
  const { clusters } = req.body;

  if (!Array.isArray(clusters)) {
    const response: ApiResponse = {
      success: false,
      code: 400,
      message: 'clusters 必须是数组',
      requestId: req.context.requestId,
      timestamp: Date.now(),
    };
    res.status(400).json(response);
    return;
  }

  const count = messageForwarderService.reloadClusters(clusters);

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '路由表重新加载成功',
    data: { clusterCount: count },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.get('/admin/logs/stats', (_req: Request, res: Response) => {
  const stats = getLogStats();

  const response: ApiResponse = {
    success: true,
    code: 200,
    message: '获取日志统计成功',
    data: {
      totalFiles: stats.totalFiles,
      totalSize: stats.totalSize,
      totalSizeFormatted: `${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
      fileBreakdown: stats.fileBreakdown,
    },
    requestId: _req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

router.post('/admin/logs/cleanup', (req: Request, res: Response) => {
  const { maxAgeDays, dryRun, cleanInvalid } = req.body;

  const result = cleanupLogs({
    maxAgeDays: maxAgeDays ? parseInt(maxAgeDays, 10) : undefined,
    dryRun: dryRun === true,
    cleanInvalid: cleanInvalid !== false,
  });

  const response: ApiResponse = {
    success: result.errors.length === 0,
    code: result.errors.length === 0 ? 200 : 500,
    message: result.errors.length === 0 ? '日志清理完成' : '日志清理完成但有错误',
    data: {
      deletedCount: result.deletedCount,
      freedSpace: result.freedSpace,
      freedSpaceFormatted: `${(result.freedSpace / 1024 / 1024).toFixed(2)} MB`,
      deletedFiles: result.deletedFiles,
      invalidFiles: result.invalidFiles,
      errors: result.errors,
      dryRun: dryRun === true,
    },
    requestId: req.context.requestId,
    timestamp: Date.now(),
  };

  res.json(response);
});

export default router;
