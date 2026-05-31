import { Router } from 'express'
import * as deviceCtrl from '../controllers/deviceController.js'

const router = Router()

router.get('/', deviceCtrl.listDevices)
router.get('/:id', deviceCtrl.getDevice)
router.get('/:id/trend', deviceCtrl.getDeviceTrend)

export default router
