import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import { createDetection, getDetectionById, getDetectionList, updateDetectionAnnotation, getDetectionsByIds } from '../services/detectionService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const unique = `${base}-${Date.now()}${ext}`
    cb(null, unique)
  },
})

const upload = multer({ storage })

const router = Router()

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: '请上传文件' })
      return
    }
    const filename = req.file.filename
    const originalUrl = `/uploads/${filename}`
    const result = await createDetection(filename, originalUrl)
    res.json({ success: true, data: result })
  } catch (error) {
    console.error('Upload error:', error)
    res.status(500).json({ success: false, error: '检测处理失败' })
  }
})

router.get('/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 10
    const status = req.query.status as string | undefined
    const faultType = req.query.faultType as string | undefined
    const startDate = req.query.startDate as string | undefined
    const endDate = req.query.endDate as string | undefined
    const result = await getDetectionList(page, pageSize, status, faultType, startDate, endDate)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取列表失败' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getDetectionById(req.params.id)
    if (!result) {
      res.status(404).json({ success: false, error: '检测记录不存在' })
      return
    }
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: '获取检测详情失败' })
  }
})

router.put('/:id/annotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { regions, classifications } = req.body
    if (!regions || !classifications) {
      res.status(400).json({ success: false, error: '缺少必要参数' })
      return
    }
    const result = await updateDetectionAnnotation(req.params.id, regions, classifications)
    if (!result) {
      res.status(404).json({ success: false, error: '检测记录不存在' })
      return
    }
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: '更新注释失败' })
  }
})

router.post('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, format = 'json' } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ success: false, error: '请提供要导出的检测记录ID' })
      return
    }

    const detections = await getDetectionsByIds(ids)

    if (format === 'json') {
      const jsonData = JSON.stringify(detections, null, 2)
      const base64 = Buffer.from(jsonData, 'utf-8').toString('base64')
      res.json({
        success: true,
        data: {
          format: 'json',
          filename: `detections-${Date.now()}.json`,
          base64,
          count: detections.length,
        },
      })
    } else if (format === 'excel' || format === 'pdf') {
      res.json({
        success: true,
        data: {
          format,
          filename: `detections-${Date.now()}.${format}`,
          downloadUrl: `/api/export/download/${Date.now()}.${format}`,
          count: detections.length,
        },
      })
    } else {
      res.status(400).json({ success: false, error: '不支持的导出格式' })
    }
  } catch (error) {
    res.status(500).json({ success: false, error: '导出失败' })
  }
})

export default router
