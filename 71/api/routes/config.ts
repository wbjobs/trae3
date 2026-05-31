import { Router, type Request, type Response } from 'express'
import { applyConfig, getTemplates, saveTemplate, getHistory } from '../services/configService.js'
import { validateConfigParams } from '../services/validator.js'
import type { ConfigParams, ConfigTemplate } from '../../shared/types.js'

const router = Router()

router.post('/apply', async (req: Request, res: Response) => {
  const { deviceIds, params } = req.body as { deviceIds: string[]; params: ConfigParams }
  if (!deviceIds || !Array.isArray(deviceIds) || !params) {
    res.status(400).json({ success: false, error: '参数无效' })
    return
  }

  const validation = validateConfigParams(params)
  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.errors.join('; ') })
    return
  }

  const result = await applyConfig(deviceIds, params)
  res.json({ taskId: result.taskId, results: result.results })
})

router.get('/templates', (_req: Request, res: Response) => {
  const templates = getTemplates()
  res.json({ templates })
})

router.post('/templates', (req: Request, res: Response) => {
  const template = req.body as Omit<ConfigTemplate, 'id' | 'createdAt'>
  if (!template.name || !template.params) {
    res.status(400).json({ success: false, error: '模板参数无效' })
    return
  }

  const saved = saveTemplate(template)
  res.json({ template: saved })
})

router.get('/history', (_req: Request, res: Response) => {
  const history = getHistory()
  res.json({ history })
})

export default router
