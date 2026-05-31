export type MetricType = 'cpu' | 'memory' | 'disk' | 'network'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type NodeStatus = 'healthy' | 'warning' | 'critical'
export type AnomalyEventType = 'trigger' | 'escalate' | 'mitigate' | 'resolve'
export type DataTier = 'hot' | 'cold' | 'archive'

export interface MetricDataPoint {
  timestamp: string
  value: number
}

export interface MetricSeries {
  metricType: MetricType
  serviceName: string
  nodeId: string
  data: MetricDataPoint[]
  tier?: DataTier
}

export interface MetricQuery {
  metricTypes: MetricType[]
  serviceNames?: string[]
  nodeIds?: string[]
  startTime: string
  endTime: string
  interval?: '1m' | '5m' | '15m' | '1h'
  tier?: DataTier
}

export interface AnomalyRecord {
  id: string
  metricType: MetricType
  serviceName: string
  nodeId: string
  severity: Severity
  detectedAt: string
  recoveredAt: string | null
  description: string
  rootCauseHint: string
  relatedMetrics: MetricType[]
}

export interface AnomalyEvent {
  timestamp: string
  event: string
  type: AnomalyEventType
}

export interface AnomalyDetail extends AnomalyRecord {
  timeline: AnomalyEvent[]
  relatedSeries: MetricSeries[]
}

export interface AnomalyQuery {
  severity?: Severity
  metricType?: MetricType
  serviceName?: string
  startTime?: string
  endTime?: string
  limit?: number
  offset?: number
}

export interface ServiceInfo {
  name: string
  status: NodeStatus
  nodes: NodeInfo[]
  dependencies?: string[]
}

export interface NodeInfo {
  id: string
  status: NodeStatus
  role?: 'primary' | 'replica' | 'standby'
  rack?: string
}

export interface AlertRule {
  id: number
  metricType: MetricType
  condition: string
  threshold: number
  severity: Severity
  enabled: boolean
}

export interface DataPoint {
  metricType: MetricType
  serviceName: string
  nodeId: string
  value: number
  timestamp?: string
}

export interface WSMessage {
  type: 'metric_update' | 'anomaly_detected' | 'anomaly_resolved'
  payload: MetricDataPoint | AnomalyRecord
}

export interface HealthSummary {
  metricType: MetricType
  currentValue: number
  status: NodeStatus
  trend: 'up' | 'down' | 'stable'
  trendPercent: number
}

export interface TierStats {
  tier: DataTier
  pointCount: number
  timeRange: { start: string; end: string } | null
}

export interface DataArchiveInfo {
  archiveId: string
  startTime: string
  endTime: string
  pointCount: number
  sizeBytes: number
  tier: DataTier
  createdAt: string
}

export interface TraceNode {
  id: string
  type: 'service' | 'node' | 'metric' | 'database' | 'network'
  name: string
  status: NodeStatus
  metricType?: MetricType
  value?: number
  anomalies: string[]
}

export interface TraceEdge {
  from: string
  to: string
  type: 'dependency' | 'network' | 'dataflow' | 'causal'
  weight: number
}

export interface RootCauseCandidate {
  nodeId: string
  nodeName: string
  score: number
  confidence: number
  evidence: string[]
  impactScope: string[]
  recommendedAction: string
}

export interface TraceResult {
  targetAnomalyId: string
  nodes: TraceNode[]
  edges: TraceEdge[]
  rootCauses: RootCauseCandidate[]
  propagationPath: string[]
  analysisTimeMs: number
}

export interface CorrelationPair {
  seriesA: { metricType: MetricType; serviceName: string; nodeId: string }
  seriesB: { metricType: MetricType; serviceName: string; nodeId: string }
  correlation: number
  lagMs: number
  significance: number
}

export interface SynchronousAnomaly {
  anomalyIds: string[]
  metricTypes: MetricType[]
  services: string[]
  nodes: string[]
  startTime: string
  endTime: string
  correlation: number
  pattern: 'spike' | 'trend' | 'oscillation' | 'step'
}

export interface CorrelationResult {
  pairs: CorrelationPair[]
  synchronousAnomalies: SynchronousAnomaly[]
  analysisTimeMs: number
  parameters: {
    startTime: string
    endTime: string
    threshold: number
  }
}

export interface SSEMessage {
  type: 'metric_batch' | 'anomaly_event' | 'health_update' | 'correlation_alert' | 'trace_result'
  id: string
  data: unknown
  timestamp: string
}

export interface WindowAggregate {
  windowStart: string
  windowEnd: string
  metricType: MetricType
  serviceName: string
  nodeId: string
  count: number
  min: number
  max: number
  avg: number
  sum: number
  p50: number
  p95: number
  p99: number
}

export interface StreamStats {
  totalPointsProcessed: number
  pointsPerSecond: number
  windowsActive: number
  backlogSize: number
  anomaliesDetected: number
  processingLatencyMs: number
}
