import express from 'express'
import { controlController } from '../controllers/ControlController'

const router = express.Router()

router.get('/devices', controlController.getDevices)
router.get('/devices/:deviceId', controlController.getDeviceById)
router.post('/device', controlController.controlDevice)
router.post('/batch', controlController.batchControl)
router.get('/linkage-rules', controlController.getLinkageRules)

export default router
