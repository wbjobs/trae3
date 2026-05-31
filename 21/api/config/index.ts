import dotenv from 'dotenv'

dotenv.config()

type DeployEnvironment = 'nearshore' | 'offshore'

const env: DeployEnvironment = (process.env.DEPLOY_ENV as DeployEnvironment) || 'nearshore'

const baseConfig = {
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://localhost:8086',
    token: process.env.INFLUXDB_TOKEN || 'my-token',
    org: process.env.INFLUXDB_ORG || 'ship-monitor',
    bucket: process.env.INFLUXDB_BUCKET || 'sensor_data',
  },
  
  sqlite: {
    path: process.env.SQLITE_PATH || './data/ship_monitor.db',
  },
  
  websocket: {
    path: '/ws',
    cors: {
      origin: '*',
    },
  },
  
  dataSimulator: {
    enabled: process.env.SIMULATOR_ENABLED !== 'false',
    interval: parseInt(process.env.SIMULATOR_INTERVAL || '2000'),
  },
  
  alarm: {
    checkInterval: parseInt(process.env.ALARM_CHECK_INTERVAL || '5000'),
    autoResolveTimeout: parseInt(process.env.ALARM_AUTO_RESOLVE || '300000'),
  },
}

const nearshoreConfig = {
  ...baseConfig,
  env: 'nearshore' as DeployEnvironment,
  influxdb: {
    ...baseConfig.influxdb,
    retentionPolicy: '30d',
  },
  dataSimulator: {
    ...baseConfig.dataSimulator,
    interval: 1000,
  },
}

const offshoreConfig = {
  ...baseConfig,
  env: 'offshore' as DeployEnvironment,
  influxdb: {
    ...baseConfig.influxdb,
    retentionPolicy: '90d',
  },
  dataSimulator: {
    ...baseConfig.dataSimulator,
    interval: 3000,
  },
  alarm: {
    ...baseConfig.alarm,
    checkInterval: 10000,
  },
}

export const config = env === 'offshore' ? offshoreConfig : nearshoreConfig

export const getEnvironment = (): DeployEnvironment => env

export default config
