import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './utils/config';
import { getLogger } from './modules/logger';
import { requestContext, requestLogger, errorHandler, notFoundHandler } from './api/middleware';
import routes from './api/routes';
import { queueRouterService } from './modules/queue-router';
import { messageForwarderService } from './modules/message-forwarder';
import { loadStatsService } from './modules/load-stats';

const logger = getLogger('Server');

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(requestContext);
app.use(requestLogger);

app.use('/api/v1', routes);

app.get('/', (_req, res) => {
  res.json({
    name: 'Multi-Region API Gateway',
    version: '1.0.0',
    description: '多模块后端 API 服务 - 队列路由、消息转发、区域负载统计、日志记录',
    endpoints: {
      health: '/api/v1/health',
      messages: '/api/v1/messages',
      stats: '/api/v1/stats/overview',
      admin: '/api/v1/admin',
    },
  });
});

app.use('*', notFoundHandler);
app.use(errorHandler);

async function startServer(): Promise<void> {
  try {
    logger.info('正在启动服务...');
    logger.info(`配置的区域集群: ${config.clusters.map(c => `${c.id} (${c.name})`).join(', ')}`);
    logger.info(`配置的队列: ${config.queues.map(q => q.name).join(', ')}`);

    const server = app.listen(config.port, () => {
      logger.info(`服务已启动，监听端口: ${config.port}`);
      logger.info(`API 文档: http://localhost:${config.port}`);
    });

    process.on('SIGTERM', async () => {
      logger.info('收到 SIGTERM 信号，正在优雅关闭...');
      server.close(async () => {
        await shutdownServices();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('收到 SIGINT 信号，正在优雅关闭...');
      server.close(async () => {
        await shutdownServices();
        process.exit(0);
      });
    });

    process.on('uncaughtException', (err) => {
      logger.fatal('未捕获的异常', err);
    });

    process.on('unhandledRejection', (reason) => {
      logger.error('未处理的 Promise 拒绝', reason instanceof Error ? reason : new Error(String(reason)));
    });
  } catch (error) {
    logger.fatal('服务启动失败', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

async function shutdownServices(): Promise<void> {
  logger.info('正在关闭各个模块...');

  try {
    await queueRouterService.shutdown();
    messageForwarderService.shutdown();
    loadStatsService.shutdown();
    logger.info('所有模块已成功关闭');
  } catch (error) {
    logger.error('关闭模块时发生错误', error instanceof Error ? error : new Error(String(error)));
  }
}

startServer();

export default app;
