import Router from 'koa-router'
import roomController from '../controller/RoomController.js'
import authMiddleware from '../middleware/auth.js'
import validateMiddleware from '../middleware/validator.js'

const router = new Router({ prefix: '/api/rooms' })

router.get(
  '/',
  authMiddleware('room:view'),
  validateMiddleware('roomQuery', 'query'),
  roomController.getRoomList.bind(roomController)
)

router.get(
  '/regions',
  authMiddleware('room:view'),
  roomController.getRegions.bind(roomController)
)

router.get(
  '/stats',
  authMiddleware('room:view'),
  roomController.getRoomStats.bind(roomController)
)

router.get(
  '/tree',
  authMiddleware('room:view'),
  roomController.getRoomTree.bind(roomController)
)

router.get(
  '/:id',
  authMiddleware('room:view'),
  validateMiddleware('nodeId', 'params'),
  roomController.getRoomDetail.bind(roomController)
)

router.get(
  '/:id/nodes',
  authMiddleware('room:view'),
  validateMiddleware('nodeId', 'params'),
  roomController.getRoomNodes.bind(roomController)
)

router.post(
  '/:id/nodes/control',
  authMiddleware('room:control'),
  validateMiddleware('nodeId', 'params'),
  roomController.batchControlNodes.bind(roomController)
)

export default router
