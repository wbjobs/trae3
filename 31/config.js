const path = require('path');

module.exports = {
  server: {
    host: '0.0.0.0',
    port: 3200,
    wsPath: '/ws/log-trace',
  },
  database: {
    dbPath: path.join(__dirname, 'data', 'log_trace.db'),
  },
  trace: {
    traceIdHeader: 'X-Trace-Id',
    spanIdHeader: 'X-Span-Id',
    maxRetentionDays: 30,
  },
  terminal: {
    heartbeatInterval: 15000,
    reconnectDelay: 3000,
    maxReconnectAttempts: 10,
    supportedTypes: ['browser', 'embedded', 'iot', 'mobile'],
  },
  log: {
    batchSize: 50,
    flushInterval: 5000,
    maxPayloadSize: 1024 * 1024,
  },
};
