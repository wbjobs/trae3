import sequelize, { config } from './config/database.js'
import * as models from './models/index.js'
import repositories from './repository/index.js'

async function testConnection() {
  try {
    await sequelize.authenticate()
    console.log(`数据库连接成功: ${config.database} @ ${config.host}:${config.port}`)
    return true
  } catch (err) {
    console.error('数据库连接失败:', err.message)
    return false
  }
}

export {
  sequelize,
  config,
  models,
  repositories
}

export {
  User,
  Room,
  Node,
  NodeMetric,
  AuditLog,
  TraceSpan,
  NodeCollectTask
} from './models/index.js'

export {
  UserRepository,
  RoomRepository,
  NodeRepository,
  NodeMetricRepository,
  AuditLogRepository,
  TraceSpanRepository,
  NodeCollectTaskRepository
} from './repository/index.js'

export default {
  sequelize,
  config,
  models,
  repositories,
  testConnection
}

if (process.argv[1] === import.meta.url.substring(7)) {
  testConnection()
}
