const express = require('express');
const os = require('os');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../../common/logger');

function createSystemRouter(taskScheduler, nodeManager, resultStorage) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
      },
    });
  });

  router.get('/info', asyncHandler(async (req, res) => {
    const [queueStats, nodeStats, cacheStats] = await Promise.all([
      taskScheduler ? taskScheduler.getQueueStats() : null,
      nodeManager ? nodeManager.getNodeStats() : null,
      resultStorage?.cache ? resultStorage.cache.getStats() : null,
    ]);

    const systemInfo = {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version,
      },
      system: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg(),
      },
      queue: queueStats,
      nodes: nodeStats,
      cache: cacheStats,
    };

    res.json({
      success: true,
      data: systemInfo,
    });
  }));

  router.get('/stats', asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    const [queueStats, nodeStats, resultStats] = await Promise.all([
      taskScheduler ? taskScheduler.getQueueStats() : null,
      nodeManager ? nodeManager.getDetailedStats() : null,
      resultStorage ? resultStorage.getStatistics({ startDate, endDate }) : null,
    ]);

    res.json({
      success: true,
      data: {
        queue: queueStats,
        nodes: nodeStats,
        results: resultStats,
        timestamp: Date.now(),
      },
    });
  }));

  router.post('/shutdown', asyncHandler(async (req, res) => {
    logger.info('Shutdown requested via API');

    res.json({
      success: true,
      data: {
        message: 'Shutdown initiated',
        timestamp: Date.now(),
      },
    });

    setTimeout(async () => {
      try {
        if (taskScheduler) await taskScheduler.shutdown();
        if (nodeManager) await nodeManager.shutdown();
        if (resultStorage) await resultStorage.close();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    }, 1000);
  }));

  router.get('/algorithms', (req, res) => {
    const algorithms = [
      {
        id: 'kriging',
        name: 'Kriging Interpolation',
        description: 'Geostatistical interpolation method providing optimal unbiased estimates with variance estimation',
        types: ['ordinary', 'simple', 'universal'],
        variogramModels: ['spherical', 'exponential', 'gaussian', 'linear'],
      },
      {
        id: 'idw',
        name: 'Inverse Distance Weighting',
        description: 'Deterministic interpolation method weighted by inverse distance',
        parameters: ['power', 'searchRadius', 'maxNeighbors'],
      },
      {
        id: 'nearest',
        name: 'Nearest Neighbor',
        description: 'Simple interpolation assigning the value of the closest sample point',
      },
      {
        id: 'linear',
        name: 'Linear Interpolation',
        description: 'Linear interpolation between neighboring sample points',
      },
    ];

    res.json({
      success: true,
      data: algorithms,
    });
  });

  router.get('/load-balancing-strategies', (req, res) => {
    const strategies = [
      { id: 'least-connections', name: 'Least Connections', description: 'Assign tasks to nodes with the least active tasks' },
      { id: 'round-robin', name: 'Round Robin', description: 'Distribute tasks evenly across all nodes in sequence' },
      { id: 'weighted-response', name: 'Weighted Response', description: 'Assign tasks based on node capacity and current load' },
      { id: 'cpu-usage', name: 'CPU Usage', description: 'Assign tasks to nodes with the lowest CPU usage' },
      { id: 'memory-available', name: 'Memory Available', description: 'Assign tasks to nodes with the most available memory' },
      { id: 'random', name: 'Random', description: 'Assign tasks randomly to available nodes' },
    ];

    res.json({
      success: true,
      data: strategies,
    });
  });

  return router;
}

module.exports = createSystemRouter;
