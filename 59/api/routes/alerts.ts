import { Router } from 'express'
import * as alertCtrl from '../controllers/alertController.js'

const router = Router()

router.get('/', alertCtrl.listAlerts)
router.get('/:id', alertCtrl.getAlert)
router.put('/:id/confirm', alertCtrl.confirmAlert)
router.put('/:id/resolve', alertCtrl.resolveAlert)

export default router
