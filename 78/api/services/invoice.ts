import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { fileURLToPath } from 'url'
import * as invoiceRepo from '../repository/invoice.js'
import { recognizeInvoice, prewarmWorker } from './ocr.js'
import type { Invoice, UploadResponse, ExtractResult, Segment } from '../../shared/types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const segmentsCache = new Map<string, Segment[]>()

export { prewarmWorker }

export async function uploadAndProcess(
  files: Express.Multer.File[],
): Promise<UploadResponse[]> {
  const results: UploadResponse[] = []

  for (const file of files) {
    const id = uuidv4()
    const invoice = invoiceRepo.create({
      id,
      fileName: file.originalname,
      filePath: file.path,
    })
    results.push({ id: invoice.id, fileName: invoice.fileName, status: invoice.status })

    processOcr(id, file.path).catch(() => {})
  }

  return results
}

async function processOcr(id: string, filePath: string): Promise<void> {
  try {
    invoiceRepo.update(id, { status: 'processing' })

    const { fields, segments } = await recognizeInvoice(filePath)

    segmentsCache.set(id, segments)

    invoiceRepo.update(id, {
      status: 'completed',
      invoiceCode: fields.invoiceCode ?? null,
      invoiceNumber: fields.invoiceNumber ?? null,
      invoiceDate: fields.invoiceDate ?? null,
      amount: fields.amount ?? null,
      taxAmount: fields.taxAmount ?? null,
      totalAmount: fields.totalAmount ?? null,
      sellerName: fields.sellerName ?? null,
      sellerTaxNumber: fields.sellerTaxNumber ?? null,
      buyerName: fields.buyerName ?? null,
      buyerTaxNumber: fields.buyerTaxNumber ?? null,
      checkCode: fields.checkCode ?? null,
      remarks: fields.remarks ?? null,
      confidence: fields.confidence ?? null,
    })
  } catch (err) {
    console.error('OCR processing error:', err)
    invoiceRepo.update(id, { status: 'failed' })
  }
}

export function getInvoiceDetail(id: string): ExtractResult | undefined {
  const invoice = invoiceRepo.findById(id)
  if (!invoice) return undefined

  return {
    id: invoice.id,
    fields: invoice,
    segments: segmentsCache.get(id) || [],
  }
}

interface ListFilters {
  page: number
  limit: number
  status?: string
  keyword?: string
  dateFrom?: string
  dateTo?: string
}

export function listInvoices(filters: ListFilters) {
  const data = invoiceRepo.findAll(filters)
  const total = invoiceRepo.count(filters)
  return { data, total }
}

export function updateInvoice(
  id: string,
  data: Partial<
    Pick<
      Invoice,
      | 'invoiceCode'
      | 'invoiceNumber'
      | 'invoiceDate'
      | 'amount'
      | 'taxAmount'
      | 'totalAmount'
      | 'sellerName'
      | 'sellerTaxNumber'
      | 'buyerName'
      | 'buyerTaxNumber'
      | 'checkCode'
      | 'remarks'
    > & { verified?: number }
  >,
) {
  return invoiceRepo.update(id, data)
}

export function deleteInvoice(id: string): boolean {
  const invoice = invoiceRepo.findById(id)
  if (!invoice) return false

  if (invoice.filePath && fs.existsSync(invoice.filePath)) {
    fs.unlinkSync(invoice.filePath)
  }

  return invoiceRepo.remove(id)
}

export function exportInvoices(
  format: string,
  filters: Omit<ListFilters, 'page' | 'limit'>,
  ids?: string[],
): string | Buffer {
  let invoices: Invoice[]

  if (ids && ids.length > 0) {
    invoices = invoiceRepo.findByIds(ids)
  } else {
    const allFilters = { ...filters, page: 1, limit: 99999 }
    invoices = invoiceRepo.findAll(allFilters)
  }

  if (format === 'csv') {
    const headers = [
      'ID', '文件名', '状态', '发票代码', '发票号码', '开票日期',
      '金额', '税额', '价税合计', '销售方名称', '销售方税号',
      '购买方名称', '购买方税号', '校验码', '备注', '是否核验', '创建时间',
    ]

    const escapeCsv = (val: unknown): string => {
      const str = val === null || val === undefined ? '' : String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = invoices.map((inv) =>
      [
        escapeCsv(inv.id), escapeCsv(inv.fileName), escapeCsv(inv.status),
        escapeCsv(inv.invoiceCode), escapeCsv(inv.invoiceNumber), escapeCsv(inv.invoiceDate),
        escapeCsv(inv.amount), escapeCsv(inv.taxAmount), escapeCsv(inv.totalAmount),
        escapeCsv(inv.sellerName), escapeCsv(inv.sellerTaxNumber),
        escapeCsv(inv.buyerName), escapeCsv(inv.buyerTaxNumber),
        escapeCsv(inv.checkCode), escapeCsv(inv.remarks),
        escapeCsv(inv.verified), escapeCsv(inv.createdAt),
      ].join(','),
    )

    return [headers.join(','), ...rows].join('\n')
  }

  if (format === 'json') {
    const jsonData = invoices.map((inv) => ({
      id: inv.id,
      fileName: inv.fileName,
      status: inv.status,
      invoiceCode: inv.invoiceCode,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      amount: inv.amount,
      taxAmount: inv.taxAmount,
      totalAmount: inv.totalAmount,
      sellerName: inv.sellerName,
      sellerTaxNumber: inv.sellerTaxNumber,
      buyerName: inv.buyerName,
      buyerTaxNumber: inv.buyerTaxNumber,
      checkCode: inv.checkCode,
      remarks: inv.remarks,
      verified: inv.verified === 1,
      createdAt: inv.createdAt,
      updatedAt: inv.updatedAt,
    }))
    return Buffer.from(JSON.stringify(jsonData, null, 2), 'utf-8')
  }

  throw new Error(`Unsupported export format: ${format}`)
}
