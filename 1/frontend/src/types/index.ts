export type Environment = 'development' | 'production'

export type NodeStatus = 'online' | 'offline' | 'warning' | 'error'

export type RoomStatus = 'active' | 'maintenance' | 'offline'

export type UserRole = 'admin' | 'operator' | 'viewer'

export type AuditResult = 'success' | 'failed'

export interface UserInfo {
  id: string
  username: string
  role: UserRole
  status: string
  environment: Environment
  createdAt: string
  updatedAt: string
}

export interface LoginRequest {
  username: string
  password: string
  environment: Environment
}

export interface LoginResponse {
  token: string
  user: UserInfo
}

export interface NodeInfo {
  id: string
  name: string
  ip: string
  roomId: string
  parentId: string | null
  status: NodeStatus
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  uptime: number
  createdAt: string
  updatedAt: string
}

export interface TreeNode extends NodeInfo {
  children: TreeNode[]
}

export interface RoomInfo {
  id: string
  name: string
  location: string
  region: string
  status: RoomStatus
  nodeCount: number
  onlineCount: number
  warningCount: number
  errorCount: number
  description: string
  createdAt: string
  updatedAt: string
  children?: TreeNode[]
}

export interface NodeMetric {
  id: number
  nodeId: string
  cpuUsage: number
  memoryUsage: number
  diskUsage: number
  networkIn: number
  networkOut: number
  timestamp: string
}

export interface AuditLog {
  id: string
  traceId: string
  userId: string
  username: string
  action: string
  content: string
  module: string
  ip: string
  userAgent: string
  params: Record<string, any>
  result: AuditResult
  duration: number
  status: AuditResult
  operator: string
  requestParams: Record<string, any>
  responseData: Record<string, any>
  errorMessage: string | null
  nodeId: string | null
  roomId: string | null
  createdAt: string
}

export interface TraceSpan {
  spanId: string
  parentSpanId: string | null
  service: string
  name: string
  operation: string
  startTime: number
  endTime: number
  duration: number
  status: 'success' | 'error'
  errorMessage: string | null
  nodeId: string | null
  tags: Record<string, any>
  startTimeStr: string
  endTimeStr: string
}

export interface TraceLink {
  traceId: string
  spans: TraceSpan[]
  totalTime: number
  status: 'success' | 'error'
}

export interface PageQuery {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  roomId?: string
  region?: string
  startTime?: string
  endTime?: string
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  traceId?: string
  timestamp: number
}

export interface DashboardStats {
  totalNodes: number
  onlineNodes: number
  warningNodes: number
  errorNodes: number
  onlineRate: number
  totalRooms: number
  activeRooms: number
  todayAuditLogs: number
}

export interface RoomFilter {
  region?: string
  status?: RoomStatus
  keyword?: string
}
