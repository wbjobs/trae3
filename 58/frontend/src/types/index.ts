export interface OCRLine {
  text: string
  confidence: number
  bbox: number[][]
}

export interface StructuredField {
  name: string
  value: string
  confidence: number
}

export interface DocumentStruct {
  title: string
  date: string
  sender: string
  receiver: string
  signature: string
  content: string
  keywords: string[]
  custom_fields: StructuredField[]
}

export interface OCRResult {
  raw_text: string
  lines: OCRLine[]
  confidence: number
}

export interface ProcessResult {
  _id?: string
  id: string
  filename: string
  original_image: string
  preprocessed_image: string
  ocr_result: OCRResult
  structured_data: DocumentStruct
  created_at: string
  processing_time: number
}

export interface DocumentRecord {
  _id: string
  filename: string
  ocr_result: OCRResult
  structured_data: DocumentStruct
  created_at: string
  processing_time: number
}

export interface SearchParams {
  keyword?: string
  start_date?: string
  end_date?: string
  page?: number
  page_size?: number
  min_confidence?: number
  sender?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResponse {
  total: number
  page: number
  page_size: number
  items: DocumentRecord[]
}

export interface CorrectionRequest {
  ocr_result?: Partial<OCRResult>
  structured_data?: Partial<DocumentStruct>
  correction_note?: string
}

export interface BatchExportRequest {
  ids?: string[]
  keyword?: string
  start_date?: string
  end_date?: string
  format?: 'json' | 'csv' | 'excel'
  include_images?: boolean
}

export interface BatchOperationResult {
  success_count: number
  failed_count: number
  failed_ids: string[]
}

export interface DbStats {
  total_documents: number
  avg_confidence: number
  avg_processing_time: number
  date_range: {
    min: string
    max: string
  }
  query_count: number
}

export interface OcrStats {
  cache_hit_rate: number
  precision: string
  use_quantization: boolean
  max_batch_size: number
}

export interface SystemStatsResponse {
  db_stats: DbStats
  ocr_stats: OcrStats
}
