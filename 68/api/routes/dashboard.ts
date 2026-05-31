import { Router, type Request, type Response } from 'express'
import { getStats } from '../services/dashboardService.js'

const router = Router()

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getStats()
    res.json({ success: true, data: stats })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取统计数据失败' })
  }
})

export default router
