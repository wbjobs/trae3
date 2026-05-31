import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

class AuditLog extends Model {}

AuditLog.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => uuidv4()
    },
    traceId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      field: 'traceId'
    },
    userId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      field: 'userId'
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    content: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '操作描述'
    },
    module: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['auth', 'node', 'room', 'audit', 'settings', 'collector']]
      }
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: false,
      validate: {
        isIP: true
      }
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'userAgent',
      comment: '请求 User-Agent'
    },
    params: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('params')
        return raw ? JSON.parse(raw) : null
      },
      set(value) {
        this.setDataValue('params', value ? JSON.stringify(value) : null)
      }
    },
    result: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['success', 'failed']]
      }
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: '请求耗时（毫秒）'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'errorMessage',
      comment: '错误信息'
    },
    nodeId: {
      type: DataTypes.STRING(36),
      allowNull: true,
      field: 'nodeId',
      comment: '关联节点ID'
    },
    roomId: {
      type: DataTypes.STRING(36),
      allowNull: true,
      field: 'roomId',
      comment: '关联机房ID'
    }
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_log',
    timestamps: true,
    updatedAt: false,
    indexes: [
      {
        name: 'idx_trace',
        fields: ['traceId']
      },
      {
        name: 'idx_user',
        fields: ['userId']
      },
      {
        name: 'idx_time',
        fields: ['createdAt']
      },
      {
        name: 'idx_module',
        fields: ['module']
      },
      {
        name: 'idx_result',
        fields: ['result']
      },
      {
        name: 'idx_node',
        fields: ['nodeId']
      },
      {
        name: 'idx_room',
        fields: ['roomId']
      }
    ]
  }
)

export default AuditLog
