import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as archiveRepo from '../repositories/archiveRepository.js'

const router = Router()
router.use(authenticate)

router.get('/transfers', (req: Request, res: Response): void => {
  const query = {
    sampleCode: req.query.sampleCode as string | undefined,
    fromDate: req.query.fromDate as string | undefined,
    toDate: req.query.toDate as string | undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
  }
  const result = archiveRepo.findArchivedTransfers(query)
  res.json({ success: true, data: result })
})

router.get('/samples', (req: Request, res: Response): void => {
  const query = {
    sampleCode: req.query.sampleCode as string | undefined,
    type: req.query.type as string | undefined,
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 20,
  }
  const result = archiveRepo.findArchivedSamples(query)
  res.json({ success: true, data: result })
})

router.get('/stats', (_req: Request, res: Response): void => {
  const stats = archiveRepo.getArchiveStats()
  res.json({ success: true, data: stats })
})

router.post('/cleanup', (req: Request, res: Response): void => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ success: false, error: '仅管理员可执行归档清理' })
    return
  }
  const daysToKeep = parseInt(req.body.daysToKeep as string) || 365
  const deleted = archiveRepo.cleanupOldArchives(daysToKeep)
  res.json({ success: true, data: { deletedRows: deleted, daysToKeep } })
})

export default router
