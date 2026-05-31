require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const rateLimit = require('express-rate-limit');

const { initDatabase, getDb } = require('./database');
const { createLogRouter } = require('./api/logs');
const { createTerminalRouter } = require('./api/terminals');
const { createAlertRouter } = require('./api/alerts');
const { WebSocketServer } = require('./websocket/server');
const { LogFilter } = require('./utils/logFilter');
const { AlertEngine } = require('./utils/alertEngine');
const { PartitionManager } = require('./utils/partitionManager');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 1000,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(limiter);

const initServer = async () => {
  try {
    await initDatabase();
    logger.info('数据库初始化完成');

    const db = getDb();
    const logFilter = new LogFilter();
    const alertEngine = new AlertEngine();
    const partitionManager = new PartitionManager();

    await partitionManager.initialize();
    logger.info('分区管理器初始化完成');

    const wss = new WebSocketServer({
      server,
      db,
      logFilter,
      alertEngine,
      maxConnections: parseInt(process.env.MAX_CONNECTIONS) || 50000,
    });
    wss.start();

    app.use('/api/logs', createLogRouter({ db, logFilter, partitionManager }));
    app.use('/api/terminals', createTerminalRouter({ db, partitionManager }));
    app.use('/api/alerts', createAlertRouter({ db, alertEngine }));
    app.use('/api/partitions', createPartitionRouter({ partitionManager }));

    const clientSubscribers = new Map();

    app.get('/api/alerts/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const subId = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      clientSubscribers.set(subId, res);

      const unsubscribe = alertEngine.subscribe((alert) => {
        try {
          res.write(`data: ${JSON.stringify(alert)}\n\n`);
        } catch (e) {
          unsubscribe();
          clientSubscribers.delete(subId);
        }
      });

      req.on('close', () => {
        unsubscribe();
        clientSubscribers.delete(subId);
      });
    });

    app.get('/api/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...wss.getStats(),
        alertRules: alertEngine.getRules().length,
        partitions: partitionManager.getPartitionInfo().length,
      });
    });

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      logger.info(`HTTP 服务运行在端口 ${PORT}`);
      logger.info(`WebSocket 服务运行在 ws://localhost:${PORT}`);
    });

    process.on('SIGINT', () => {
      logger.info('正在关闭服务...');
      wss.shutdown();
      db.close();
      server.close(() => {
        logger.info('服务已关闭');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('服务启动失败:', error);
    process.exit(1);
  }
};

function createPartitionRouter({ partitionManager }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json(partitionManager.getPartitionInfo());
  });

  router.post('/cleanup', async (req, res) => {
    try {
      const { retentionDays } = req.body;
      const result = await partitionManager.cleanup(retentionDays);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

initServer();