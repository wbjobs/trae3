import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

class Node extends Model {}

Node.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => uuidv4()
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 100]
      }
    },
    ip: {
      type: DataTypes.STRING(45),
      allowNull: false,
      validate: {
        isIP: true
      }
    },
    roomId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      field: 'roomId'
    },
    parentId: {
      type: DataTypes.STRING(36),
      allowNull: true,
      field: 'parentId'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'offline',
      validate: {
        isIn: [['online', 'offline', 'warning', 'error']]
      }
    },
    cpuUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'cpuUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    memoryUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'memoryUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    diskUsage: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      field: 'diskUsage',
      validate: {
        min: 0,
        max: 100
      }
    },
    uptime: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '运行时长（秒）'
    }
  },
  {
    sequelize,
    modelName: 'Node',
    tableName: 'node',
    timestamps: true,
    indexes: [
      {
        name: 'idx_room',
        fields: ['roomId']
      },
      {
        name: 'idx_parent',
        fields: ['parentId']
      },
      {
        name: 'idx_status',
        fields: ['status']
      }
    ]
  }
)

export default Node
