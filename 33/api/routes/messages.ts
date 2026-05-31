import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as messageService from '../services/messageService.js'

const router = Router()

router.use(authenticate)

router.get('/', (req: Request, res: Response): void => {
  const messages = messageService.getUserMessages(req.user!.id)
  res.json({ success: true, data: messages })
})

router.get('/unread-count', (req: Request, res: Response): void => {
  const count = messageService.getUnreadCount(req.user!.id)
  res.json({ success: true, data: { count } })
})

router.post('/:id/read', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  messageService.markAsRead(id)
  res.json({ success: true })
})

router.post('/read-all', (req: Request, res: Response): void => {
  messageService.markAllAsRead(req.user!.id)
  res.json({ success: true })
})

export default router
