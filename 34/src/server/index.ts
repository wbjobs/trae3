import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'path';

import config from './config';
import logger from './utils/logger';
import taskRoutes from './routes/tasks';
import nodeRoutes from './routes/nodes';
import NodeManager from './services/NodeManager';
import DispatchCoordinator from './services/DispatchCoordinator';
import ResultStorage from './services/ResultStorage';

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/tasks', taskRoutes);
app.use('/api/nodes', nodeRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await DispatchCoordinator.getStats();
    const storageStats = await ResultStorage.getStorageStats();

    res.json({
      ...stats,
      storage: storageStats,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

if (config.env === 'production') {
  const clientDistPath = path.join(__dirname, '../../dist/client');
  app.use(express.static(clientDistPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

async function startServer(): Promise<void> {
  try {
    await mongoose.connect(config.mongodb.uri);
    logger.info('Connected to MongoDB');

    NodeManager.initialize(io);
    logger.info('Node Manager initialized');

    DispatchCoordinator.start();
    logger.info('Dispatch Coordinator started');

    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
    });

    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      DispatchCoordinator.stop();
      await mongoose.connection.close();
      server.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      DispatchCoordinator.stop();
      await mongoose.connection.close();
      server.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${(error as Error).message}`);
    process.exit(1);
  }
}

startServer();

export { app, server, io };
