import { Router, type Request, type Response } from 'express'
import { createSSEStream } from '../services/streamService.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  try {
    createSSEStream(res)
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router
