import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

class NodeCollectTask extends Model {}

NodeCollectTask.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => uuidv4()
    },
    nodeId: {
      type: DataTypes.STRING(36),
      allowNull: false,
      unique: true,
      field: 'nodeId'
    },
    interval: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30000,
      comment: '采集间隔（毫秒）'
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'paused', 'disabled']]
      }
    },
    lastRun: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'lastRun'
    },
    nextRun: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'nextRun'
    }
  },
  {
    sequelize,
    modelName: 'NodeCollectTask',
    tableName: 'node_collect_task',
    timestamps: true
  }
)

export default NodeCollectTask
