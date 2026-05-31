import User from './User.js'
import Room from './Room.js'
import Node from './Node.js'
import NodeMetric from './NodeMetric.js'
import AuditLog from './AuditLog.js'
import TraceSpan from './TraceSpan.js'
import NodeCollectTask from './NodeCollectTask.js'

Room.hasMany(Node, {
  foreignKey: 'roomId',
  as: 'nodes'
})

Node.belongsTo(Room, {
  foreignKey: 'roomId',
  as: 'room'
})

Node.hasMany(Node, {
  foreignKey: 'parentId',
  as: 'children'
})

Node.belongsTo(Node, {
  foreignKey: 'parentId',
  as: 'parent'
})

Node.hasMany(NodeMetric, {
  foreignKey: 'nodeId',
  as: 'metrics'
})

NodeMetric.belongsTo(Node, {
  foreignKey: 'nodeId',
  as: 'node'
})

User.hasMany(AuditLog, {
  foreignKey: 'userId',
  as: 'auditLogs'
})

AuditLog.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
})

AuditLog.hasMany(TraceSpan, {
  foreignKey: 'traceId',
  sourceKey: 'traceId',
  as: 'spans'
})

TraceSpan.belongsTo(AuditLog, {
  foreignKey: 'traceId',
  targetKey: 'traceId',
  as: 'auditLog'
})

Node.hasOne(NodeCollectTask, {
  foreignKey: 'nodeId',
  as: 'collectTask'
})

NodeCollectTask.belongsTo(Node, {
  foreignKey: 'nodeId',
  as: 'node'
})

export {
  User,
  Room,
  Node,
  NodeMetric,
  AuditLog,
  TraceSpan,
  NodeCollectTask
}
