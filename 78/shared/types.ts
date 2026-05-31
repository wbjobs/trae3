export interface Segment {
  label: string
  bbox: [number, number, number, number]
  text: string
  confidence: number
}

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

export interface ExtractResult {
  id: string
  fields: Invoice
  segments: Array<{
    label: string
    bbox: [number, number, number, number]
    text: string
    confidence: number
  }>
}
