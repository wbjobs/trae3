import { Router, type Request, type Response } from 'express'
import { getDevices } from '../db.js'

const router = Router()

router.get('/', (_req: Request, res: Response): void => {
  const devices = getDevices()
  res.json({ success: true, data: devices })
})

export default router
