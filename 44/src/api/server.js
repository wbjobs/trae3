const express = require('express');
const http = require('http');
const EventEmitter = require('events');
const config = require('../../config');
const logger = require('../common/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const createTaskRouter = require('./routes/tasks');
const createNodeRouter = require('./routes/nodes');
const createResultRouter = require('./routes/results');
const createSystemRouter = require('./routes/system');

class APIServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || config.server.port;
    this.taskScheduler = options.taskScheduler;
    this.nodeManager = options.nodeManager;
    this.resultStorage = options.resultStorage;

    this.app = express();
    this.server = null;
    this._setupMiddleware();
    this._setupRoutes();
    this._setupErrorHandling();
  }

  _setupMiddleware() {
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    this.app.use((req, res, next) => {
      res.setHeader('X-Powered-By', 'Geological Distributed Computing');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      logger.debug(`${req.method} ${req.path}`);
      next();
    });
  }

  _setupRoutes() {
    const taskRouter = createTaskRouter(this.taskScheduler, this.resultStorage);
    const nodeRouter = createNodeRouter(this.nodeManager, this.resultStorage);
    const resultRouter = createResultRouter(this.resultStorage);
    const systemRouter = createSystemRouter(this.taskScheduler, this.nodeManager, this.resultStorage);

    this.app.use('/api/v1/tasks', taskRouter);
    this.app.use('/api/v1/nodes', nodeRouter);
    this.app.use('/api/v1/results', resultRouter);
    this.app.use('/api/v1/system', systemRouter);

    this.app.get('/api/v1', (req, res) => {
      res.json({
        success: true,
        data: {
          name: 'Geological Distributed Computing API',
          version: '1.0.0',
          endpoints: {
            tasks: '/api/v1/tasks',
            nodes: '/api/v1/nodes',
            results: '/api/v1/results',
            system: '/api/v1/system',
          },
          docs: '/api/v1/api-docs',
        },
      });
    });

    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        data: {
          message: 'Geological Distributed Computing System',
          version: '1.0.0',
          status: 'running',
          api: '/api/v1',
          health: '/api/v1/system/health',
        },
      });
    });
  }

  _setupErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(this.app);

      this.server.listen(this.port, () => {
        logger.info(`API Server started on port ${this.port}`);
        logger.info(`API Documentation: http://localhost:${this.port}/api/v1`);
        this.emit('started');
        resolve(this.server);
      });

      this.server.on('error', (error) => {
        if (error.syscall !== 'listen') {
          throw error;
        }

        switch (error.code) {
          case 'EACCES':
            logger.error(`Port ${this.port} requires elevated privileges`);
            process.exit(1);
            break;
          case 'EADDRINUSE':
            logger.error(`Port ${this.port} is already in use`);
            process.exit(1);
            break;
          default:
            throw error;
        }

        reject(error);
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('API Server stopped');
          this.emit('stopped');
          resolve();
        });
      });
    }
  }

  getApp() {
    return this.app;
  }

  getServer() {
    return this.server;
  }
}

module.exports = APIServer;
