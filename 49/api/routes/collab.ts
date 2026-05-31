import { Router, type Request, type Response } from 'express'
import { getOnlineUsers } from '../websocket.js'

const router = Router()

router.get('/users', (_req: Request, res: Response): void => {
  const users = getOnlineUsers()
  res.json({ success: true, data: users })
})

export default router
