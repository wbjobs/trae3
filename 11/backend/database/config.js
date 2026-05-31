const { Pool } = require('pg');
const dotenv = require('dotenv');
const { DatabaseCache, Logger } = require('../common');

const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';

dotenv.config({ path: envFile });

const logger = new Logger('DatabaseConfig');

const poolConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: process.env.NODE_ENV === 'production' ? 100 : 50,
  min: process.env.NODE_ENV === 'production' ? 10 : 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  query_timeout: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err.message);
});

pool.on('connect', (client) => {
  logger.debug('New database connection established');
});

pool.on('acquire', (client) => {
  logger.debug('Database connection acquired from pool');
});

pool.on('release', (client) => {
  logger.debug('Database connection released back to pool');
});

const dbCache = new DatabaseCache({
  maxCacheSize: process.env.NODE_ENV === 'production' ? 5000 : 2000,
  cacheTtlMs: 30000,
  cleanupIntervalMs: 60000
});

const cachedQuery = async (text, params, options = {}) => {
  return await dbCache.cachedQuery(pool, text, params, options);
};

const invalidateTableCache = (tableName) => {
  return dbCache.invalidateTable(tableName);
};

const getDbStats = () => {
  return {
    pool: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    },
    cache: dbCache.getStats()
  };
};

const getQueryPerformance = () => {
  return dbCache.getQueryStats();
};

const clearQueryCache = () => {
  dbCache.clearCache();
  logger.info('Query cache cleared');
};

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  cachedQuery,
  invalidateTableCache,
  getDbStats,
  getQueryPerformance,
  clearQueryCache,
  dbCache
};
