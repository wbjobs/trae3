import UserRepository from './UserRepository.js'
import RoomRepository from './RoomRepository.js'
import NodeRepository from './NodeRepository.js'
import NodeMetricRepository from './NodeMetricRepository.js'
import AuditLogRepository from './AuditLogRepository.js'
import TraceSpanRepository from './TraceSpanRepository.js'
import NodeCollectTaskRepository from './NodeCollectTaskRepository.js'
import BaseRepository from './BaseRepository.js'

export {
  BaseRepository,
  UserRepository,
  RoomRepository,
  NodeRepository,
  NodeMetricRepository,
  AuditLogRepository,
  TraceSpanRepository,
  NodeCollectTaskRepository
}

export default {
  user: UserRepository,
  room: RoomRepository,
  node: NodeRepository,
  nodeMetric: NodeMetricRepository,
  auditLog: AuditLogRepository,
  traceSpan: TraceSpanRepository,
  nodeCollectTask: NodeCollectTaskRepository
}
