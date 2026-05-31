export interface DefectBox {
  x: number
  y: number
  width: number
  height: number
  confidence: number
  label: string
  type: string
  type_name?: string
  severity: "low" | "medium" | "high" | "critical"
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface DefectUpdate {
  bbox?: BoundingBox
  type?: string
  severity?: "low" | "medium" | "high" | "critical"
  description?: string
  confidence?: number
}

export interface DefectRecord {
  id: string
  type: string
  type_name: string
  severity: "low" | "medium" | "high" | "critical"
  description: string
  image_url: string
  inspection_id: string
  confidence: number
  confirmed: boolean
  confirmed_by: string | null
  vector_id: string
  similarity?: number
  created_at: string
}

export interface InspectionResult {
  id: string
  filename: string
  status: "processing" | "completed" | "failed"
  defects: DefectBox[]
  annotated_image_url: string
  created_at: string
}

export interface DefectType {
  id: string
  name: string
  code: string
  description: string
  count: number
}

export interface SummaryData {
  total_inspections: number
  total_defects: number
  defect_rate: number
  severity_distribution: Record<string, number>
}

export interface DistributionData {
  labels: string[]
  values: number[]
}

export interface TrendData {
  dates: string[]
  counts: number[]
}

export interface InferenceStats {
  total_images: number
  avg_inference_time_ms: number
  cache_hits: number
  cache_misses: number
  cache_size: number
  cache_hit_rate: number
  config: {
    max_defects: number
    min_confidence: number
    feature_dim: number
    use_quantization: boolean
    batch_size: number
  }
}

export interface VectorStoreStats {
  total_vectors: number
  cache_stats: {
    size: number
    capacity: number
    hits: number
    misses: number
    hit_rate: number
  }
  hnsw_params: Record<string, any>
  vector_dim: number
}

export interface SystemStats {
  inspections: {
    total: number
    completed: number
    processing: number
    failed: number
    total_defects: number
  }
  inference_engine: InferenceStats
  vector_store: VectorStoreStats
}

