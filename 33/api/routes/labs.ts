import { Router, type Request, type Response } from 'express'
import { authenticate } from '../middleware/auth.js'
import * as labRepo from '../repositories/labRepository.js'
import * as sampleRepo from '../repositories/sampleRepository.js'

const router = Router()

router.use(authenticate)

router.get('/', (_req: Request, res: Response): void => {
  const labs = labRepo.findAll()
  res.json({ success: true, data: labs })
})

router.get('/:id', (req: Request, res: Response): void => {
  const id = parseInt(req.params.id)
  const lab = labRepo.findById(id)
  if (!lab) {
    res.status(404).json({ success: false, error: '实验室不存在' })
    return
  }
  res.json({ success: true, data: lab })
})

router.get('/:id/samples', (req: Request, res: Response): void => {
  const labId = parseInt(req.params.id)
  const result = sampleRepo.findAll({ labId, pageSize: 50 })
  const samples = result.data.map(s => ({ sampleCode: s.sample_code, sampleName: s.name }))
  res.json({ success: true, data: samples })
})

export default router
