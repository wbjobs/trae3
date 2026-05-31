import { Router } from 'express'
import { getSystemStatus, triggerCleanup } from '../controllers/systemController.js'

const router = Router()

router.get('/status', getSystemStatus)
router.post('/cleanup', triggerCleanup)

export default router
