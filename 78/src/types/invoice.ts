export interface Invoice {
  id: string
  fileName: string
  filePath: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  invoiceCode: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  amount: number | null
  taxAmount: number | null
  totalAmount: number | null
  sellerName: string | null
  sellerTaxNumber: string | null
  buyerName: string | null
  buyerTaxNumber: string | null
  checkCode: string | null
  remarks: string | null
  confidence: string | null
  verified: number
  createdAt: string
  updatedAt: string
}

export interface UploadResponse {
  id: string
  fileName: string
  status: Invoice['status']
}

export interface Segment {
  label: string
  bbox: [number, number, number, number]
  text: string
  confidence: number
}

export interface ExtractResult {
  id: string
  fields: Invoice
  segments: Segment[]
}

export interface FieldInfo {
  value: string
  confidence: number
}

export const FIELD_LABELS: Record<string, string> = {
  invoiceCode: '发票代码',
  invoiceNumber: '发票号码',
  invoiceDate: '开票日期',
  checkCode: '校验码',
  amount: '金额',
  taxAmount: '税额',
  totalAmount: '价税合计',
  sellerName: '销售方名称',
  sellerTaxNumber: '销售方税号',
  buyerName: '购买方名称',
  buyerTaxNumber: '购买方税号',
  remarks: '备注信息',
}

export const FIELD_GROUPS = [
  {
    title: '基本信息',
    keys: ['invoiceCode', 'invoiceNumber', 'invoiceDate', 'checkCode'] as const,
  },
  {
    title: '金额信息',
    keys: ['amount', 'taxAmount', 'totalAmount'] as const,
  },
  {
    title: '销售方信息',
    keys: ['sellerName', 'sellerTaxNumber'] as const,
  },
  {
    title: '购买方信息',
    keys: ['buyerName', 'buyerTaxNumber'] as const,
  },
  {
    title: '备注',
    keys: ['remarks'] as const,
  },
]

export function parseConfidence(confidenceStr: string | null): Record<string, number> {
  if (!confidenceStr) return {}
  try {
    return JSON.parse(confidenceStr)
  } catch {
    return {}
  }
}

export function getFieldValue(invoice: Invoice, key: string): string {
  const val = (invoice as unknown as Record<string, unknown>)[key]
  if (val === null || val === undefined) return ''
  return String(val)
}

export function getImageUrl(id: string): string {
  return `/api/invoices/${id}/image`
}
