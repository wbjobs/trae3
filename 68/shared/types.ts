export type DetectionStatus = "processing" | "completed" | "failed";
export type FaultType = "overheating" | "connection_loose" | "insulation_failure" | "load_unbalance" | "normal";
export type Severity = "low" | "medium" | "high" | "critical";

export interface EnhancementLevels {
  low: number;
  medium: number;
  high: number;
}

export interface PreprocessingInfo {
  denoised: boolean;
  enhanced: boolean;
  normalized: boolean;
  contrastRatio: number;
  enhancementFactor: number;
  noiseLevel: number;
  dynamicRange: number;
  isLowContrast: boolean;
  multiScaleEnhanced: boolean;
  claheApplied: boolean;
  bilateralFiltered: boolean;
  edgeDetected: boolean;
  clipLimit: number;
  tileGridSize: number;
  enhancementLevels: EnhancementLevels;
  edgeStrength: number;
  processingTimeMs: number;
}

export interface FaultRegion {
  id: string;
  detectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  isManual?: boolean;
}

export interface FaultClassification {
  id: string;
  regionId: string;
  detectionId: string;
  faultType: FaultType;
  severity: Severity;
  confidence: number;
  description: string;
  suggestion: string;
  isManual?: boolean;
  notes?: string;
}

export interface Detection {
  id: string;
  filename: string;
  originalUrl: string;
  processedUrl: string;
  status: DetectionStatus;
  preprocessing: PreprocessingInfo;
  regions: FaultRegion[];
  classifications: FaultClassification[];
  createdAt: string;
  updatedAt: string;
}

export interface DetectionListItem {
  id: string;
  filename: string;
  thumbnailUrl: string;
  faultCount: number;
  maxSeverity: Severity | "";
  status: DetectionStatus;
  createdAt: string;
}

export interface DetectionListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: DetectionListItem[];
}

export interface DashboardStats {
  todayCount: number;
  todayFaultRate: number;
  criticalAlerts: number;
  totalCount: number;
  faultDistribution: Array<{ faultType: string; count: number }>;
  trend: Array<{ date: string; total: number; faultCount: number }>;
  recentCritical: Array<{
    id: string;
    filename: string;
    faultType: string;
    severity: string;
    createdAt: string;
  }>;
}

export interface InferenceMetadata {
  inferenceTimeMs: number;
  quantizedMode: boolean;
  nmsRemovedCount: number;
  cacheHit: boolean;
  earlyExit: boolean;
}

export const FAULT_TYPE_LABELS: Record<FaultType, string> = {
  overheating: "过热",
  connection_loose: "连接松动",
  insulation_failure: "绝缘故障",
  load_unbalance: "负载不平衡",
  normal: "正常",
};

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "严重",
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  low: "#22c55e",
  medium: "#f97316",
  high: "#ef4444",
  critical: "#dc2626",
};
