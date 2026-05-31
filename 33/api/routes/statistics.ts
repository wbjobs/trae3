import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as sampleRepo from '../repositories/sampleRepository.js'
import * as transferRepo from '../repositories/transferRepository.js'
import * as labRepo from '../repositories/labRepository.js'
import db from '../db/main.js'

const router = Router()

router.use(authenticate)

router.get('/overview', (_req: Request, res: Response): void => {
  const totalSamples = (db.prepare('SELECT COUNT(*) as count FROM samples').get() as { count: number }).count
  const inStockCount = (db.prepare("SELECT COUNT(*) as count FROM samples WHERE status = 'in_stock'").get() as { count: number }).count
  const inTransitCount = (db.prepare("SELECT COUNT(*) as count FROM samples WHERE status = 'in_transit'").get() as { count: number }).count
  const receivedCount = (db.prepare("SELECT COUNT(*) as count FROM samples WHERE status = 'received'").get() as { count: number }).count
  const pendingApprovalCount = (db.prepare("SELECT COUNT(*) as count FROM transfers WHERE status = 'pending'").get() as { count: number }).count

  const byStatus = sampleRepo.countByStatus()
  const byType = sampleRepo.countByType()

  res.json({
    success: true,
    data: {
      totalSamples,
      inStockCount,
      inTransitCount,
      receivedCount,
      pendingApprovalCount,
      byStatus,
      byType,
    },
  })
})

router.get('/trend', (req: Request, res: Response): void => {
  const days = parseInt(req.query.days as string) || 30
  const trend = transferRepo.countTrend(days)
  res.json({ success: true, data: trend })
})

router.get('/lab-load', (_req: Request, res: Response): void => {
  const data = labRepo.getSampleCountByLab()
  res.json({ success: true, data })
})

router.get('/approval-efficiency', (_req: Request, res: Response): void => {
  const avgApprovalTime = db.prepare(`
    SELECT AVG(
      CAST((julianday(approved_at) - julianday(applied_at)) * 24 AS REAL)
    ) as avg_hours
    FROM transfers
    WHERE approved_at IS NOT NULL
  `).get() as { avg_hours: number | null }

  const approved = (db.prepare("SELECT COUNT(*) as count FROM transfers WHERE status IN ('approved', 'in_transit', 'received')").get() as { count: number }).count
  const rejected = (db.prepare("SELECT COUNT(*) as count FROM transfers WHERE status = 'rejected'").get() as { count: number }).count
  const total = approved + rejected

  res.json({
    success: true,
    data: {
      averageApprovalHours: avgApprovalTime.avg_hours ? Math.round(avgApprovalTime.avg_hours * 10) / 10 : 0,
      approvalRate: total > 0 ? Math.round((approved / total) * 100) : 0,
      rejectionRate: total > 0 ? Math.round((rejected / total) * 100) : 0,
      totalApproved: approved,
      totalRejected: rejected,
    },
  })
})

export default router
