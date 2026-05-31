import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import * as invoiceService from '../services/invoice.js'

const router = Router()

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.resolve(process.cwd(), 'uploads'))
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, `${uuidv4()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.pdf']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持 JPG、PNG、PDF 格式'))
    }
  },
})

router.post(
  '/upload',
  upload.array('file', 20),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[]
      if (!files || files.length === 0) {
        res.status(400).json({ success: false, error: '请选择文件' })
        return
      }
      const results = await invoiceService.uploadAndProcess(files)
      res.json({ success: true, data: results })
    } catch (err) {
      res.status(500).json({ success: false, error: '上传失败' })
    }
  },
)

router.get('/', (req: Request, res: Response): void => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10))
    const status = req.query.status as string | undefined
    const keyword = req.query.keyword as string | undefined
    const dateFrom = req.query.dateFrom as string | undefined
    const dateTo = req.query.dateTo as string | undefined

    const result = invoiceService.listInvoices({
      page,
      limit,
      status,
      keyword,
      dateFrom,
      dateTo,
    })
    res.json({ success: true, data: result.data, total: result.total })
  } catch {
    res.status(500).json({ success: false, error: '查询失败' })
  }
})

router.post(
  '/export',
  (req: Request, res: Response): void => {
    try {
      const format = (req.query.format as string) || (req.body.format as string) || 'csv'
      const status = req.body.status as string | undefined
      const keyword = req.body.keyword as string | undefined
      const dateFrom = req.body.dateFrom as string | undefined
      const dateTo = req.body.dateTo as string | undefined
      const ids = req.body.ids as string[] | undefined

      const content = invoiceService.exportInvoices(format, {
        status,
        keyword,
        dateFrom,
        dateTo,
      }, ids)

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv')
        res.send('\uFEFF' + content)
      } else if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', 'attachment; filename=invoices.json')
        res.send(content)
      } else {
        res.status(400).json({ success: false, error: '支持 CSV 和 JSON 格式' })
      }
    } catch {
      res.status(500).json({ success: false, error: '导出失败' })
    }
  },
)

router.get('/export', (req: Request, res: Response): void => {
  try {
    const format = (req.query.format as string) || 'csv'
    const status = req.query.status as string | undefined
    const keyword = req.query.keyword as string | undefined
    const dateFrom = req.query.dateFrom as string | undefined
    const dateTo = req.query.dateTo as string | undefined
    const idsParam = req.query.ids as string | undefined
    const ids = idsParam ? idsParam.split(',') : undefined

    const content = invoiceService.exportInvoices(format, {
      status,
      keyword,
      dateFrom,
      dateTo,
    }, ids)

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=invoices.csv')
      res.send('\uFEFF' + content)
    } else if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename=invoices.json')
      res.send(content)
    } else {
      res.status(400).json({ success: false, error: '支持 CSV 和 JSON 格式' })
    }
  } catch {
    res.status(500).json({ success: false, error: '导出失败' })
  }
})

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const result = invoiceService.getInvoiceDetail(req.params.id)
    if (!result) {
      res.status(404).json({ success: false, error: '票据不存在' })
      return
    }
    res.json({ success: true, data: result })
  } catch {
    res.status(500).json({ success: false, error: '获取失败' })
  }
})

router.put('/:id', (req: Request, res: Response): void => {
  try {
    const updated = invoiceService.updateInvoice(req.params.id, req.body)
    if (!updated) {
      res.status(404).json({ success: false, error: '票据不存在' })
      return
    }
    res.json({ success: true, data: updated })
  } catch {
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/:id', (req: Request, res: Response): void => {
  try {
    const success = invoiceService.deleteInvoice(req.params.id)
    if (!success) {
      res.status(404).json({ success: false, error: '票据不存在' })
      return
    }
    res.json({ success: true })
  } catch {
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

router.get('/:id/image', (req: Request, res: Response): void => {
  try {
    const result = invoiceService.getInvoiceDetail(req.params.id)
    if (!result || !result.fields.filePath) {
      res.status(404).json({ success: false, error: '图片不存在' })
      return
    }
    res.sendFile(path.resolve(result.fields.filePath))
  } catch {
    res.status(500).json({ success: false, error: '获取图片失败' })
  }
})

export default router
