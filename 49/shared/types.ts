export interface PipeNode {
  id: string
  name: string
  areaId: string
  type: 'junction' | 'valve' | 'pump' | 'meter'
  position: { x: number; y: number; z: number }
}

export interface PipeSegment {
  id: string
  name: string
  areaId: string
  material: string
  diameter: number
  length: number
  installDate: string
  status: 'normal' | 'warning' | 'alarm'
  position: { x: number; y: number; z: number }
  endpoints: [string, string]
}

export interface RealtimeData {
  pipeId: string
  pressure: number
  flow: number
  temperature: number
  timestamp: number
  status: 'normal' | 'warning' | 'alarm'
}

export interface AlarmRecord {
  id: string
  pipeId: string
  type: 'pressure_high' | 'pressure_low' | 'flow_abnormal' | 'temperature_high'
  level: 'info' | 'warning' | 'critical'
  value: number
  threshold: number
  message: string
  timestamp: number
  acknowledged: boolean
  acknowledgedBy?: string
}

export interface CollaborationUser {
  id: string
  name: string
  role: 'engineer' | 'operator' | 'manager'
  color: string
  cursor?: { x: number; y: number; z: number }
  cameraPosition?: { x: number; y: number; z: number }
  cameraTarget?: { x: number; y: number; z: number }
}

export interface Annotation {
  id: string
  pipeId: string
  userId: string
  userName: string
  content: string
  position: { x: number; y: number; z: number }
  timestamp: number
}

export interface InspectionPath {
  id: string
  name: string
  waypoints: InspectionWaypoint[]
  createdBy: string
}

export interface InspectionWaypoint {
  id: string
  pipeId: string
  position: { x: number; y: number; z: number }
  stayDuration: number
}

export interface Area {
  id: string
  name: string
  description: string
}

export interface CrossSectionData {
  pipeId: string
  diameter: number
  outerDiameter?: number
  innerDiameter?: number
  wallThickness: number
  material: string
  pressure?: number
  maxPressure?: number
  riskLevel: 'low' | 'medium' | 'high'
  corrosionLayers: CorrosionLayer[]
  pressureDistribution: PressurePoint[]
  estimatedLife: number
  maintenanceRecommendations: string[]
}

export interface CorrosionLayer {
  id: string
  startAngle: number
  endAngle: number
  depth: number
  severity: 'mild' | 'moderate' | 'severe'
}

export interface PressurePoint {
  angle: number
  value: number
}

export interface PlannedPath {
  id: string
  name: string
  waypoints: PlannedWaypoint[]
  totalDistance: number
  estimatedDuration: number
  pipeCount: number
  createdAt: number
}

export interface PlannedWaypoint {
  id: string
  nodeId: string
  position: { x: number; y: number; z: number }
  order: number
  stayDuration: number
}

export interface PathPlanningParams {
  startNodeId?: string
  endNodeId?: string
  nodeIds?: string[]
  areaId?: string
  optimizeFor?: 'distance' | 'time' | 'coverage'
}

export type WsEventType =
  | 'realtime:update'
  | 'realtime:delta'
  | 'alarm:new'
  | 'collab:join'
  | 'collab:leave'
  | 'collab:cursor'
  | 'collab:camera'
  | 'collab:annotation'

export interface WsMessage<T = unknown> {
  event: WsEventType
  data: T
}

export interface WsDeltaMessage {
  event: 'realtime:delta'
  data: (Partial<RealtimeData> & { pipeId: string; timestamp: number })[]
}
