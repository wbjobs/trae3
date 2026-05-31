import Router from 'koa-router'
import collectorController from '../controller/CollectorController.js'
import authMiddleware from '../middleware/auth.js'
import validateMiddleware from '../middleware/validator.js'

const router = new Router({ prefix: '/api/collector' })

router.get(
  '/status',
  authMiddleware(),
  collectorController.getStatus.bind(collectorController)
)

router.post(
  '/collect/:id',
  authMiddleware('node:control'),
  validateMiddleware('nodeId', 'params'),
  collectorController.manualCollect.bind(collectorController)
)

router.post(
  '/collect/all',
  authMiddleware('node:control'),
  collectorController.collectAll.bind(collectorController)
)

router.post(
  '/control/start',
  authMiddleware('node:control'),
  collectorController.startCollector.bind(collectorController)
)

router.post(
  '/control/stop',
  authMiddleware('node:control'),
  collectorController.stopCollector.bind(collectorController)
)

export default router
