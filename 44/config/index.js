require('dotenv').config();

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    name: process.env.DB_NAME || 'geological_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  master: {
    host: process.env.MASTER_HOST || 'localhost',
    port: parseInt(process.env.MASTER_PORT, 10) || 8080,
  },
  task: {
    taskQueueName: process.env.TASK_QUEUE_NAME || 'geological_tasks',
    resultQueueName: process.env.RESULT_QUEUE_NAME || 'geological_results',
    maxParallel: parseInt(process.env.MAX_TASK_PARALLEL, 10) || 10,
    timeout: parseInt(process.env.TASK_TIMEOUT, 10) || 3600000,
  },
  node: {
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL, 10) || 5000,
    nodeTimeout: parseInt(process.env.NODE_TIMEOUT, 10) || 15000,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/app.log',
  },
};

module.exports = config;
