import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/cfd_scheduler',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-key-change-in-production',
    expiresIn: '24h',
  },

  scheduler: {
    maxWorkers: parseInt(process.env.MAX_WORKERS || '10', 10),
    taskTimeout: parseInt(process.env.TASK_TIMEOUT || '3600000', 10),
    maxRetryAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
    heartbeatInterval: 5000,
    nodeTimeout: 30000,
    chunkTimeout: 300000,
  },

  cfd: {
    solverPath: process.env.CFD_SOLVER_PATH || '/usr/lib/openfoam',
    scriptsPath: process.env.COMPUTE_SCRIPTS_PATH || path.resolve(process.cwd(), 'scripts'),
  },

  storage: {
    basePath: process.env.STORAGE_PATH || path.resolve(process.cwd(), 'storage'),
    maxSize: parseInt(process.env.MAX_STORAGE_SIZE || '10737418240', 10),
    taskResultsPath: 'results',
    tempPath: 'temp',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || path.resolve(process.cwd(), 'logs', 'app.log'),
  },
};

export default config;
