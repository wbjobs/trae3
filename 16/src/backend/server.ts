import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { serviceContainer } from './services/ServiceContainer';
import { createModuleLogger } from '../shared/modules/logger';
import terminalRoutes from './routes/terminal.routes';
import groupRoutes from './routes/group.routes';
import firmwareRoutes from './routes/firmware.routes';
import taskRoutes from './routes/task.routes';
import logRoutes from './routes/log.routes';

const logger = createModuleLogger('BackendServer');

export const createBackendServer = async (port: number = 3000) => {
  await serviceContainer.initialize();

  const app = express();
  const server = http.createServer(app);
  const io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.use('/api/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        initialized: serviceContainer.isInitialized()
      }
    });
  });

  app.use('/api/terminals', terminalRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/firmwares', firmwareRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/logs', logRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'API not found' });
  });

  app.use((err: Error, _req: express.Request, res: express.Response) => {
    logger.error('server_error', '服务器内部错误', { error: err.message, stack: err.stack });
    res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
  });

  serviceContainer.taskManager.on('task:created', (task) => {
    io.emit('task:created', task);
  });

  serviceContainer.taskManager.on('task:started', (task) => {
    io.emit('task:started', task);
  });

  serviceContainer.taskManager.on('task:progress', (progress) => {
    io.emit('task:progress', progress);
  });

  serviceContainer.taskManager.on('task:completed', (task) => {
    io.emit('task:completed', task);
  });

  serviceContainer.taskManager.on('task:failed', (data) => {
    io.emit('task:failed', data);
  });

  serviceContainer.taskManager.on('task:cancelled', (task) => {
    io.emit('task:cancelled', task);
  });

  serviceContainer.taskManager.on('terminal:progress', (progress) => {
    io.emit('terminal:progress', progress);
  });

  serviceContainer.taskManager.on('task:ready', (taskId) => {
    io.emit('task:ready', taskId);
  });

  io.on('connection', (socket: Socket) => {
    logger.info('socket_connect', '客户端连接成功', { socketId: socket.id });

    socket.on('disconnect', () => {
      logger.info('socket_disconnect', '客户端断开连接', { socketId: socket.id });
    });
  });

  return new Promise<void>((resolve) => {
    server.listen(port, () => {
      logger.info('server_start', `后端服务启动成功，端口: ${port}`);
      resolve();
    });
  });
};

if (require.main === module) {
  const port = Number(process.env.BACKEND_PORT) || 3000;
  createBackendServer(port).catch((error) => {
    logger.error('server_fatal', '后端服务启动失败', { error: error.message });
    process.exit(1);
  });
}

export default createBackendServer;
