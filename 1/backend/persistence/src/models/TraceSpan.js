import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

class TraceSpan extends Model {}

TraceSpan.init(
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
    spanId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      field: 'spanId'
    },
    parentSpanId: {
      type: DataTypes.STRING(36),
      allowNull: true,
      field: 'parentSpanId',
      comment: '父 Span ID'
    },
    service: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['gateway', 'collector', 'persistence', 'frontend']]
      }
    },
    operation: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    startTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'startTime',
      comment: '开始时间戳（毫秒）'
    },
    endTime: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'endTime',
      comment: '结束时间戳（毫秒）'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [['success', 'error']]
      }
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
    tags: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue('tags')
        return raw ? JSON.parse(raw) : null
      },
      set(value) {
        this.setDataValue('tags', value ? JSON.stringify(value) : null)
      }
    }
  },
  {
    sequelize,
    modelName: 'TraceSpan',
    tableName: 'trace_span',
    timestamps: false,
    indexes: [
      {
        name: 'idx_trace',
        fields: ['traceId']
      },
      {
        name: 'idx_span',
        fields: ['spanId']
      },
      {
        name: 'idx_parent_span',
        fields: ['parentSpanId']
      },
      {
        name: 'idx_service',
        fields: ['service']
      }
    ]
  }
)

export default TraceSpan
