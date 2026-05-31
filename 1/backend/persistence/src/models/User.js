import { DataTypes, Model } from 'sequelize'
import sequelize from '../config/database.js'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'

class User extends Model {
  async validatePassword(password) {
    return bcrypt.compare(password, this.password)
  }

  static async hashPassword(password) {
    return bcrypt.hash(password, 10)
  }
}

User.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
      defaultValue: () => uuidv4()
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        len: [3, 50]
      }
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'user',
      validate: {
        isIn: [['admin', 'operator', 'viewer']]
      }
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'disabled']]
      }
    }
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'user',
    timestamps: true,
    paranoid: false,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await User.hashPassword(user.password)
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await User.hashPassword(user.password)
        }
      }
    }
  }
)

export default User
