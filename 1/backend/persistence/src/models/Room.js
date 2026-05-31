import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

class Room extends Model {}

Room.init(
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
    location: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    region: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['north', 'south', 'east', 'west', 'central']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'maintenance', 'offline']]
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'Room',
    tableName: 'room',
    timestamps: true,
    indexes: [
      {
        name: 'idx_region',
        fields: ['region']
      }
    ]
  }
)

export default Room
