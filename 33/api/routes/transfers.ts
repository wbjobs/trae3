import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as processEngine from '../services/processEngine.js'
import * as transferRepo from '../repositories/transferRepository.js'

const router = Router()

router.use(authenticate)

router.get('/', (req: Request, res: Response): void => {
  const query = {
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 10,
    status: req.query.status as string | undefined,
    keyword: req.query.keyword as string | undefined,
  }
  const result = processEngine.listTransfers(query)
  res.json({ success: true, data: result })
})

router.get('/pending', (req: Request, res: Response): void => {
  const labId = req.user!.labId
  if (!labId) {
    res.json({ success: true, data: [] })
    return
  }
  const result = processEngine.getPendingApprovals(labId)
  res.json({ success: true, data: result })
})

router.get('/:id', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  const transfer = transferRepo.findById(id)
  if (!transfer) {
    res.status(404).json({ success: false, error: '流转记录不存在' })
    return
  }
  res.json({ success: true, data: transfer })
})

router.post('/', (req: Request, res: Response): void => {
  try {
    const { sampleId, toLabId, reason } = req.body
    const transfer = processEngine.createTransfer({
      sample_id: sampleId,
      to_lab_id: toLabId,
      reason: reason || '',
      applied_by: req.user!.id,
    })
    res.status(201).json({ success: true, data: transfer })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/:id/approve', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  const { approved, comment } = req.body
  if (approved === undefined) {
    res.status(400).json({ success: false, error: '请指定审批结果' })
    return
  }
  try {
    const transfer = processEngine.approveTransfer(id, req.user!.id, approved, comment)
    res.json({ success: true, data: transfer })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.post('/:id/receive', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  try {
    const transfer = processEngine.receiveTransfer(id, req.user!.id)
    res.json({ success: true, data: transfer })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

export default router
