import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as messageRepo from '../repositories/messageRepository.js'
import * as alertService from '../services/alertService.js'

const router = Router()
router.use(authenticate)

router.get('/', (req: Request, res: Response): void => {
  alertService.checkTimeoutAlerts()
  const userId = req.user!.id
  const alerts = messageRepo.findByUserId(userId).filter(
    (m: any) => ['transfer_timeout', 'lab_capacity', 'status_anomaly'].includes(m.type)
  )
  res.json({ success: true, data: alerts })
})

export default router
