const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateNode } = require('../../common/validators');

function createNodeRouter(nodeManager, resultStorage) {
  const router = express.Router();

  router.post('/register', asyncHandler(async (req, res) => {
    const nodeData = validateNode(req.body);
    const node = nodeManager.registerNode(nodeData);

    if (resultStorage) {
      await resultStorage.storeNode(node);
    }

    res.status(201).json({
      success: true,
      data: node,
    });
  }));

  router.post('/:nodeId/heartbeat', asyncHandler(async (req, res) => {
    const { nodeId } = req.params;
    const metrics = req.body || {};
    const node = nodeManager.heartbeat(nodeId, metrics);

    if (resultStorage) {
      await resultStorage.updateNodeHeartbeat(nodeId, metrics);
    }

    res.json({
      success: true,
      data: {
        nodeId,
        status: node.status,
        serverTime: Date.now(),
      },
    });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { status } = req.query;
    const nodes = nodeManager.getAllNodes(status || null);
    res.json({
      success: true,
      data: nodes,
    });
  }));

  router.get('/stats', asyncHandler(async (req, res) => {
    const stats = nodeManager.getDetailedStats();
    res.json({
      success: true,
      data: stats,
    });
  }));

  router.get('/:nodeId', asyncHandler(async (req, res) => {
    const { nodeId } = req.params;
    const node = nodeManager.getNode(nodeId);
    res.json({
      success: true,
      data: node,
    });
  }));

  router.delete('/:nodeId', asyncHandler(async (req, res) => {
    const { nodeId } = req.params;
    const node = nodeManager.unregisterNode(nodeId);
    res.json({
      success: true,
      data: node,
    });
  }));

  router.put('/strategy', asyncHandler(async (req, res) => {
    const { strategy } = req.body;
    const availableStrategies = nodeManager.getLoadBalancingStrategies();

    if (!availableStrategies.includes(strategy)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid strategy. Available: ${availableStrategies.join(', ')}`,
          code: 'INVALID_STRATEGY',
        },
      });
    }

    nodeManager.setLoadBalancingStrategy(strategy);
    res.json({
      success: true,
      data: { strategy },
    });
  }));

  return router;
}

module.exports = createNodeRouter;
