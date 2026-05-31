export interface OCRLine {
  text: string
  confidence: number
  position?: number[][]
}

export interface OCRResult {
  lines: OCRLine[]
  raw_text: string
  average_confidence: number
}

export interface ExtractedInfo {
  equipment_name?: string
  equipment_model?: string
  serial_number?: string
  manufacturer?: string
  production_date?: string
  rated_power?: string
  rated_voltage?: string
  rated_current?: string
  weight?: string
  dimensions?: string
  inspection_cycle?: string
}

export interface NameplateRecord {
  id: number
  filename: string
  original_path: string
  processed_path?: string
  equipment_name?: string
  equipment_model?: string
  serial_number?: string
  manufacturer?: string
  production_date?: string
  rated_power?: string
  rated_voltage?: string
  rated_current?: string
  weight?: string
  dimensions?: string
  inspection_cycle?: string
  raw_text?: string
  confidence: number
  ocr_result?: string
  status: string
  created_at: string
  updated_at?: string
}

export interface RecognitionResponse {
  success: boolean
  record_id: number
  ocr_result: OCRResult
  extracted_info: ExtractedInfo
  message: string
}

export interface UploadResponse {
  success: boolean
  file_id: string
  filename: string
  file_path: string
  message: string
}

export interface RecordListResponse {
  total: number
  page: number
  page_size: number
  records: NameplateRecord[]
}

export interface StatisticsResponse {
  total_records: number
  completed_records: number
  pending_records: number
  average_confidence: number
  top_manufacturers: Array<{ name: string; count: number }>
}

export const FieldLabels: Record<keyof ExtractedInfo, string> = {
  equipment_name: '设备名称',
  equipment_model: '型号规格',
  serial_number: '出厂编号',
  manufacturer: '制造厂家',
  production_date: '生产日期',
  rated_power: '额定功率',
  rated_voltage: '额定电压',
  rated_current: '额定电流',
  weight: '重量',
  dimensions: '外形尺寸',
  inspection_cycle: '检验周期'
}
