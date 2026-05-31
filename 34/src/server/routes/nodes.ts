import express from 'express';
import NodeManager from '../services/NodeManager';
import logger from '../utils/logger';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const nodes = await NodeManager.getAllNodes();

    res.json({ nodes });
  } catch (err) {
    logger.error(`Get nodes error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get nodes' });
  }
});

router.get('/available', async (req, res) => {
  try {
    const nodes = await NodeManager.getAvailableNodes();

    res.json({ nodes });
  } catch (err) {
    logger.error(`Get available nodes error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get available nodes' });
  }
});

router.get('/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const node = await NodeManager.getNode(nodeId);

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    res.json(node);
  } catch (err) {
    logger.error(`Get node error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get node' });
  }
});

router.delete('/:nodeId', async (req, res) => {
  try {
    const { nodeId } = req.params;
    await NodeManager.removeNode(nodeId);

    res.json({ message: 'Node removed' });
  } catch (err) {
    logger.error(`Remove node error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to remove node' });
  }
});

router.get('/stats/count', async (req, res) => {
  try {
    const count = NodeManager.getConnectedNodeCount();

    res.json({ connectedNodes: count });
  } catch (err) {
    logger.error(`Get node count error: ${(err as Error).message}`);
    res.status(500).json({ error: 'Failed to get node count' });
  }
});

export default router;
