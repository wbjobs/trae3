import { Router, type Request, type Response } from 'express'
import { getOverview } from '../services/dashboardService.js'

const router = Router()

router.get('/overview', (req: Request, res: Response): void => {
  try {
    const overview = getOverview()
    res.json({ success: true, ...overview })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router
