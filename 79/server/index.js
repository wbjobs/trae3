const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const zlib = require('zlib');
const { DataSimulator } = require('./dataSimulator');
const { tanksConfig } = require('./tanksConfig');
const { Logger, LOG_DIR } = require('./logger');
const { LogArchiver } = require('./logArchiver');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const logger = new Logger('server');
const dataSimulator = new DataSimulator(tanksConfig);
const logArchiver = new LogArchiver(LOG_DIR);

const MAX_CLIENTS = 100;
const HEARTBEAT_INTERVAL = 30000;
const MESSAGE_QUEUE_MAX_SIZE = 1000;
const BATCH_THRESHOLD = 3;

const clients = new Map();
const messageCache = new Map();

logArchiver.start();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    clients: clients.size,
    uptime: process.uptime(),
    memory: process.memoryUsage().heapUsed,
    batchUpdates: dataSimulator.getStats()
  });
});

app.get('/api/tanks', (req, res) => {
  res.json(tanksConfig);
});

app.get('/api/tanks/batch', (req, res) => {
  const data = dataSimulator.getAllCurrentData();
  
  if (req.headers['accept-encoding']?.includes('gzip')) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Content-Type', 'application/json');
    zlib.gzip(JSON.stringify(data), (err, compressed) => {
      if (err) {
        res.json(data);
      } else {
        res.send(compressed);
      }
    });
  } else {
    res.json(data);
  }
});

app.get('/api/tanks/:id', (req, res) => {
  const tank = tanksConfig.find(t => t.id === req.params.id);
  if (!tank) {
    return res.status(404).json({ error: '储罐未找到' });
  }
  const currentData = dataSimulator.getCurrentData(req.params.id);
  res.json({ ...tank, currentData });
});

app.get('/api/tanks/:id/history', (req, res) => {
  const { startTime, endTime, limit = 100 } = req.query;
  const history = dataSimulator.getHistoryData(
    req.params.id,
    startTime ? parseInt(startTime) : undefined,
    endTime ? parseInt(endTime) : undefined,
    parseInt(limit)
  );
  res.json(history);
});

app.get('/api/tanks/:id/alerts', (req, res) => {
  const { limit = 50 } = req.query;
  const alerts = dataSimulator.getAlerts(req.params.id, parseInt(limit));
  res.json(alerts);
});

const broadcast = (type, payload) => {
  if (clients.size === 0) return;

  const cacheKey = `${type}-${JSON.stringify(payload)}`;
  let message = messageCache.get(cacheKey);
  
  if (!message) {
    message = JSON.stringify({ type, ...payload });
    messageCache.set(cacheKey, message);
    
    if (messageCache.size > MESSAGE_QUEUE_MAX_SIZE) {
      const firstKey = messageCache.keys().next().value;
      messageCache.delete(firstKey);
    }
  }

  let successCount = 0;
  let failCount = 0;

  clients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(message, (error) => {
          if (error) {
            failCount++;
            logger.warn('发送消息失败', { error: error.message });
          }
        });
        successCount++;
      } catch (e) {
        failCount++;
        logger.error('发送消息异常', { error: e.message });
      }
    }
  });

  if (failCount > 0) {
    logger.warn('广播完成', { success: successCount, failed: failCount });
  }
};

const sendToClient = (ws, type, payload) => {
  if (ws.readyState !== WebSocket.OPEN) return false;
  
  try {
    const message = JSON.stringify({ type, ...payload });
    ws.send(message);
    return true;
  } catch (e) {
    logger.error('发送到客户端失败', { error: e.message });
    return false;
  }
};

const heartbeat = () => {
  clients.forEach((info, ws) => {
    if (!info.isAlive) {
      logger.warn('客户端心跳超时，强制断开', { clientId: info.id });
      ws.terminate();
      return;
    }
    
    info.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      logger.error('发送ping失败', { error: e.message });
    }
  });
};

setInterval(heartbeat, HEARTBEAT_INTERVAL);

wss.on('connection', (ws, req) => {
  if (clients.size >= MAX_CLIENTS) {
    logger.warn('连接数已满，拒绝新连接');
    ws.close(1013, 'Too many connections');
    return;
  }

  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const clientInfo = {
    id: clientId,
    ip: req.socket.remoteAddress,
    connectedAt: Date.now(),
    isAlive: true,
    subscriptions: new Set(),
    supportsBatch: true
  };

  clients.set(ws, clientInfo);
  logger.info('新客户端连接', { clientId, totalClients: clients.size });

  ws.on('pong', () => {
    const info = clients.get(ws);
    if (info) {
      info.isAlive = true;
    }
  });

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const info = clients.get(ws);

      switch (data.type) {
        case 'subscribe':
          const tankIds = data.tankIds || tanksConfig.map(t => t.id);
          tankIds.forEach(id => {
            if (info) info.subscriptions.add(id);
            const currentData = dataSimulator.getCurrentData(id);
            if (currentData) {
              sendToClient(ws, 'tankData', { tankId: id, data: currentData });
            }
          });
          logger.debug('订阅储罐', { clientId: info?.id, tankIds });
          break;

        case 'unsubscribe':
          if (data.tankIds && info) {
            data.tankIds.forEach(id => info.subscriptions.delete(id));
          }
          break;

        case 'ping':
          sendToClient(ws, 'pong', { timestamp: Date.now() });
          break;

        default:
          logger.warn('未知消息类型', { type: data.type });
      }
    } catch (e) {
      logger.error('消息解析错误', { error: e.message });
    }
  });

  ws.on('error', (error) => {
    const info = clients.get(ws);
    logger.error('WebSocket错误', { clientId: info?.id, error: error.message });
  });

  ws.on('close', (code, reason) => {
    const info = clients.get(ws);
    clients.delete(ws);
    logger.info('客户端断开', { 
      clientId: info?.id, 
      code, 
      reason: reason.toString(),
      totalClients: clients.size 
    });
  });

  sendToClient(ws, 'welcome', { 
    clientId, 
    serverTime: Date.now(),
    tankCount: tanksConfig.length,
    supportsBatch: true
  });
});

dataSimulator.on('dataUpdate', (tankId, data) => {
  broadcast('tankData', { tankId, data });
});

dataSimulator.on('batchUpdate', (batchData) => {
  broadcast('batchData', { data: batchData });
});

dataSimulator.on('alert', (alert) => {
  logger.warn('报警触发', { 
    tankId: alert.tankId, 
    type: alert.type, 
    severity: alert.severity,
    message: alert.message 
  });
  broadcast('alert', { alert });
});

process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM，正在关闭服务器...');
  dataSimulator.stop();
  await logArchiver.stop();
  
  clients.forEach((info, ws) => {
    ws.close(1001, 'Server shutting down');
  });

  server.close(() => {
    logger.info('服务器已关闭');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获异常', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝', { reason: reason?.message });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  logger.info(`服务器运行在 http://localhost:${PORT}`);
  logger.info(`WebSocket 服务器已启动，最大连接数: ${MAX_CLIENTS}`);
  dataSimulator.start();
});
