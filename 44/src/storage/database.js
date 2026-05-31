const { Sequelize, DataTypes } = require('sequelize');
const config = require('../../config');
const logger = require('../common/logger');

const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres',
    logging: config.server.env === 'development' ? logger.debug : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000,
    },
  }
);

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
  batchId: {
    type: DataTypes.UUID,
    allowNull: true,
    index: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
  },
  status: {
    type: DataTypes.ENUM('pending', 'scheduled', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'pending',
    index: true,
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  parameterName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true,
  },
  geologicalLayer: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true,
  },
  algorithm: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  inputData: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  callbackUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  totalSubtasks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completedSubtasks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    index: true,
  },
}, {
  tableName: 'tasks',
  timestamps: true,
  indexes: [
    { fields: ['status', 'createdAt'] },
    { fields: ['parameterName', 'geologicalLayer'] },
  ],
});

const TaskResult = sequelize.define('TaskResult', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4,
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: Task,
      key: 'id',
    },
    index: true,
  },
  parameterName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true,
  },
  geologicalLayer: {
    type: DataTypes.STRING(100),
    allowNull: false,
    index: true,
  },
  grid: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  values: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: false,
  },
  variance: {
    type: DataTypes.ARRAY(DataTypes.FLOAT),
    allowNull: true,
  },
  stats: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  success: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    index: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  executionTime: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  nodeId: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true,
  },
}, {
  tableName: 'task_results',
  timestamps: false,
  indexes: [
    { fields: ['taskId', 'createdAt'] },
    { fields: ['parameterName', 'geologicalLayer', 'createdAt'] },
  ],
});

const Batch = sequelize.define('Batch', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 5,
  },
  status: {
    type: DataTypes.ENUM('processing', 'completed', 'failed'),
    defaultValue: 'processing',
    index: true,
  },
  taskCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  completedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  failedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {},
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    index: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'batches',
  timestamps: false,
});

const ComputeNode = sequelize.define('ComputeNode', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('cpu', 'gpu', 'hybrid'),
    defaultValue: 'cpu',
  },
  host: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  capacity: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  supportedAlgorithms: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'busy'),
    defaultValue: 'offline',
    index: true,
  },
  currentLoad: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  cpuUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  memoryUsage: {
    type: DataTypes.FLOAT,
    allowNull: true,
  },
  totalTasksCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  totalTasksFailed: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  totalCpuTime: {
    type: DataTypes.FLOAT,
    defaultValue: 0,
  },
  lastHeartbeat: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  registeredAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'compute_nodes',
  timestamps: false,
});

const SubTask = sequelize.define('SubTask', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: false,
    index: true,
  },
  subtaskIndex: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  totalSubtasks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('queued', 'running', 'completed', 'failed', 'cancelled'),
    defaultValue: 'queued',
    index: true,
  },
  progress: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  inputData: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  checkpointData: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  resultData: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  nodeId: {
    type: DataTypes.UUID,
    allowNull: true,
    index: true,
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'subtasks',
  timestamps: false,
  indexes: [
    { fields: ['parentId', 'status'] },
    { fields: ['status', 'updatedAt'] },
  ],
});

Batch.hasMany(Task, { foreignKey: 'batchId' });
Task.belongsTo(Batch, { foreignKey: 'batchId' });
Task.hasMany(TaskResult, { foreignKey: 'taskId' });
TaskResult.belongsTo(Task, { foreignKey: 'taskId' });
Task.hasMany(SubTask, { foreignKey: 'parentId' });
SubTask.belongsTo(Task, { foreignKey: 'parentId' });

async function initDatabase() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    await sequelize.sync({ alter: config.server.env === 'development' });
    logger.info('Database models synchronized');
    return true;
  } catch (error) {
    logger.error('Database initialization failed:', error);
    return false;
  }
}

async function closeDatabase() {
  try {
    await sequelize.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}

module.exports = {
  sequelize,
  initDatabase,
  closeDatabase,
  Task,
  TaskResult,
  Batch,
  ComputeNode,
  SubTask,
};
