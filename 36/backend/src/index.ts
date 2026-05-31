import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, validateConfig } from './config';
import { initDatabase, closeDatabase } from './database';
import router from './routes';
import { corsMiddleware, requestLogger, errorHandler, notFoundHandler } from './middleware/auth';
import { Logger } from './utils/logger';

const logger = new Logger('Server');

async function startServer() {
  const configErrors = validateConfig();
  if (configErrors.length > 0) {
    logger.error('配置验证失败:', undefined, { errors: configErrors });
    process.exit(1);
  }

  await initDatabase();
  logger.info('数据库初始化完成');

  const app = express();

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  app.use(cors());
  app.use(corsMiddleware());
  app.use(compression());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(requestLogger);

  app.use('/', router);
  app.use(errorHandler);
  app.use(notFoundHandler);

  const server = app.listen(config.port, config.host, () => {
    logger.info(`服务已启动`);
    logger.info(`地址: http://${config.host}:${config.port}`);
    logger.info(`存储目录: ${config.storagePath}`);
    logger.info(`数据库: ${config.databasePath}`);
    
    if (config.apiKey) {
      logger.info('API 密钥认证已启用');
    } else {
      logger.warn('未配置 API 密钥，服务将允许匿名访问');
    }
  });

  server.timeout = 300000;

  async function gracefulShutdown(signal: string) {
    logger.info(`收到 ${signal} 信号，正在优雅关闭...`);
    
    server.close(async (err) => {
      if (err) {
        logger.error('关闭服务器时出错', err);
        process.exit(1);
      }

      await closeDatabase();
      logger.info('数据库连接已关闭');
      logger.info('服务器已正常关闭');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('强制关闭超时，正在退出...');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('未捕获的异常', err);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的 Promise 拒绝', undefined, { reason, promise });
  });

  return app;
}

startServer().catch((err) => {
  logger.error('服务启动失败', err);
  process.exit(1);
});

export default startServer;
