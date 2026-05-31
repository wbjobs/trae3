import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as sampleService from '../services/sampleService.js'
import * as transferRepo from '../repositories/transferRepository.js'

const router = Router()

router.use(authenticate)

router.get('/', (req: Request, res: Response): void => {
  const query = {
    page: parseInt(req.query.page as string) || 1,
    pageSize: parseInt(req.query.pageSize as string) || 10,
    keyword: req.query.keyword as string | undefined,
    type: req.query.type as string | undefined,
    status: req.query.status as string | undefined,
    labId: req.query.labId ? parseInt(req.query.labId as string) : undefined,
  }
  const result = sampleService.listSamples(query)
  res.json({ success: true, data: result })
})

router.get('/:id', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  const sample = sampleService.getSample(id)
  if (!sample) {
    res.status(404).json({ success: false, error: '样本不存在' })
    return
  }
  res.json({ success: true, data: sample })
})

router.get('/:id/transfers', (req: Request, res: Response): void => {
  const sampleId = parseInt(req.params.id)
  const result = transferRepo.findAll({ keyword: '', page: 1, pageSize: 50 })
  const filtered = result.data.filter((t: any) => t.sample_id === sampleId)
  res.json({ success: true, data: filtered })
})

router.post('/', (req: Request, res: Response): void => {
  try {
    const { name, type, source, quantity, unit, storageCondition, labId } = req.body
    const sample = sampleService.createSample({
      name,
      type,
      source: source || '',
      quantity: quantity || 1,
      unit: unit || '份',
      storage_condition: storageCondition || '',
      lab_id: labId,
      created_by: req.user!.id,
    })
    res.status(201).json({ success: true, data: sample })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

router.patch('/:id/status', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  const { status } = req.body
  if (!status) {
    res.status(400).json({ success: false, error: '状态不能为空' })
    return
  }
  try {
    const sample = sampleService.updateSampleStatus(id, status)
    res.json({ success: true, data: sample })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

export default router
