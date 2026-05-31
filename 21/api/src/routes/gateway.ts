import express from 'express'
import { gatewayController } from '../controllers/GatewayController'

const router = express.Router()

router.post('/sensor', gatewayController.receiveSensorData)
router.post('/sensor/batch', gatewayController.receiveBatchData)

export default router
