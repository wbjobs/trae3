import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'

class NodeMetric extends Model {}

NodeMetric.init(
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    nodeId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      field: 'nodeId'
    },
    cpuUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'cpuUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    memoryUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'memoryUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    diskUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      field: 'diskUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    networkIn: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'networkIn',
      comment: '入站流量（MB/s）'
    },
    networkOut: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'networkOut',
      comment: '出站流量（MB/s）'
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'NodeMetric',
    tableName: 'node_metric',
    timestamps: false,
    indexes: [
      {
        name: 'idx_node_time',
        fields: ['nodeId', 'timestamp']
      }
    ]
  }
)

export default NodeMetric
