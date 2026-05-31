import Router from 'koa-router'
import nodeController from '../controller/NodeController.js'
import authMiddleware from '../middleware/auth.js'
import validateMiddleware from '../middleware/validator.js'

const router = new Router({ prefix: '/api/nodes' })

router.get(
  '/',
  authMiddleware('node:view'),
  validateMiddleware('nodeQuery', 'query'),
  nodeController.getNodeList.bind(nodeController)
)

router.get(
  '/tree',
  authMiddleware('node:view'),
  nodeController.getNodeTree.bind(nodeController)
)

router.get(
  '/stats',
  authMiddleware('node:view'),
  nodeController.getNodeStats.bind(nodeController)
)

router.get(
  '/metrics',
  authMiddleware('node:view'),
  validateMiddleware('metricQuery', 'query'),
  nodeController.getNodeMetrics.bind(nodeController)
)

router.get(
  '/:id',
  authMiddleware('node:view'),
  validateMiddleware('nodeId', 'params'),
  nodeController.getNodeDetail.bind(nodeController)
)

router.get(
  '/:id/metrics/latest',
  authMiddleware('node:view'),
  validateMiddleware('nodeId', 'params'),
  nodeController.getNodeLatestMetric.bind(nodeController)
)

router.post(
  '/:id/control',
  authMiddleware('node:control'),
  validateMiddleware('nodeId', 'params'),
  nodeController.controlNode.bind(nodeController)
)

export default router
