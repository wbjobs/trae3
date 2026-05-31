import { Router } from 'express'
import * as deviceCtrl from '../controllers/deviceController.js'

const router = Router()

router.get('/overview', deviceCtrl.getStats)
router.get('/floor/:floor', deviceCtrl.getFloorStats)

export default router
