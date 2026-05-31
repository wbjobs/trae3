const os = require('os');
const { v4: uuidv4 } = require('uuid');
const logger = require('./common/logger');
const config = require('../config');
const { TaskScheduler } = require('./task-dispatcher');
const { NodeManager, nodeManager } = require('./node-manager');
const { ResultStorage, resultStorage } = require('./storage');
const { computeKernel } = require('./compute-kernel');
const APIServer = require('./api/server');
const { database } = require('./storage');

class DistributedComputingSystem {
  constructor(options = {}) {
    this.role = options.role || 'master';
    this.options = options;
    this.isRunning = false;

    if (this.role === 'master' || this.role === 'all') {
      this.resultStorage = options.resultStorage || resultStorage;
      this.nodeManager = options.nodeManager || nodeManager;
      this.taskScheduler = new TaskScheduler({
        resultStorage: this.resultStorage,
        nodeManager: this.nodeManager,
        ...options.schedulerOptions,
      });
      this.apiServer = new APIServer({
        port: options.port,
        taskScheduler: this.taskScheduler,
        nodeManager: this.nodeManager,
        resultStorage: this.resultStorage,
      });
    }

    if (this.role === 'worker' || this.role === 'all') {
      this.workerId = options.workerId || uuidv4();
      this.computeKernel = options.computeKernel || computeKernel;
    }

    this._setupEventListeners();
  }

  _setupEventListeners() {
    if (this.taskScheduler) {
      this.taskScheduler.on('task:submitted', (task) => {
        logger.info(`Task submitted: ${task.id} - ${task.name}`);
      });

      this.taskScheduler.on('task:completed', (result) => {
        logger.info(`Task completed: ${result.taskId}`);
      });

      this.taskScheduler.on('task:failed', (task) => {
        logger.error(`Task failed: ${task.id} - ${task.error}`);
      });

      this.taskScheduler.on('task:progress', (task) => {
        logger.debug(`Task progress: ${task.id} - ${task.progress}%`);
      });

      this.taskScheduler.on('batch:completed', (batch) => {
        logger.info(`Batch completed: ${batch.id} - ${batch.name}`);
      });
    }

    if (this.nodeManager) {
      this.nodeManager.on('node:registered', (node) => {
        logger.info(`Node registered: ${node.name} (${node.id})`);
      });

      this.nodeManager.on('node:unregistered', (node) => {
        logger.info(`Node unregistered: ${node.name} (${node.id})`);
      });

      this.nodeManager.on('node:online', (node) => {
        logger.info(`Node online: ${node.name} (${node.id})`);
      });

      this.nodeManager.on('node:offline', (node) => {
        logger.warn(`Node offline: ${node.name} (${node.id})`);
      });
    }

    process.on('SIGINT', () => this._gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this._gracefulShutdown('SIGTERM'));
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this._gracefulShutdown('uncaughtException');
    });
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  async start() {
    logger.info(`Starting Distributed Computing System in ${this.role} mode...`);

    try {
      if (this.options.initDatabase !== false && this.resultStorage) {
        await database.initDatabase();
      }

      if (this.apiServer) {
        await this.apiServer.start();
      }

      if (this.role === 'worker' || this.role === 'all') {
        await this._registerWorker();
      }

      this.isRunning = true;
      logger.info('Distributed Computing System started successfully');

      return this;
    } catch (error) {
      logger.error('Failed to start system:', error);
      await this.stop();
      throw error;
    }
  }

  async _registerWorker() {
    const nodeData = {
      id: this.workerId,
      name: this.options.workerName || `worker-${os.hostname()}-${process.pid}`,
      type: this.options.workerType || 'cpu',
      host: this.options.workerHost || os.hostname(),
      port: this.options.workerPort || 0,
      capacity: {
        cores: this.options.cores || os.cpus().length,
        memory: this.options.memory || os.totalmem(),
        gpus: this.options.gpus || 0,
      },
      supportedAlgorithms: ['kriging', 'idw', 'nearest', 'linear'],
    };

    try {
      if (this.nodeManager) {
        this.nodeManager.registerNode(nodeData);
      }

      if (this.options.registerToMaster) {
        const axios = require('axios');
        await axios.post(
          `http://${config.master.host}:${config.master.port}/api/v1/nodes/register`,
          nodeData
        );
      }

      logger.info(`Worker registered: ${this.workerId}`);
      this._startHeartbeat();
    } catch (error) {
      logger.warn('Worker registration failed, continuing in local mode:', error.message);
    }
  }

  _startHeartbeat() {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const metrics = {
        cpuUsage: this._getCpuUsage(),
        memoryUsage: this._getMemoryUsage(),
        loadAverage: os.loadavg()[0],
      };

      try {
        if (this.nodeManager) {
          this.nodeManager.heartbeat(this.workerId, metrics);
        }

        if (this.options.registerToMaster) {
          const axios = require('axios');
          await axios.post(
            `http://${config.master.host}:${config.master.port}/api/v1/nodes/${this.workerId}/heartbeat`,
            metrics
          );
        }
      } catch (error) {
        logger.debug('Heartbeat update failed:', error.message);
      }
    }, config.node.heartbeatInterval);
  }

  _getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    return 1 - totalIdle / totalTick;
  }

  _getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return 1 - freeMem / totalMem;
  }

  async _gracefulShutdown(signal) {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    await this.stop();
    process.exit(0);
  }

  async stop() {
    if (!this.isRunning) return;

    logger.info('Stopping Distributed Computing System...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.apiServer) {
      await this.apiServer.stop();
    }

    if (this.taskScheduler) {
      await this.taskScheduler.shutdown();
    }

    if (this.nodeManager && this.workerId) {
      try {
        this.nodeManager.unregisterNode(this.workerId);
      } catch (error) {
        logger.debug('Worker unregistration failed:', error.message);
      }
    }

    if (this.nodeManager) {
      await this.nodeManager.shutdown();
    }

    if (this.resultStorage) {
      await this.resultStorage.close();
    }

    await database.closeDatabase();

    this.isRunning = false;
    logger.info('Distributed Computing System stopped');
  }

  getTaskScheduler() {
    return this.taskScheduler;
  }

  getNodeManager() {
    return this.nodeManager;
  }

  getResultStorage() {
    return this.resultStorage;
  }

  getAPIServer() {
    return this.apiServer;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--role' && args[i + 1]) {
      options.role = args[i + 1];
      i++;
    } else if (arg === '--port' && args[i + 1]) {
      options.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--worker-id' && args[i + 1]) {
      options.workerId = args[i + 1];
      i++;
    } else if (arg === '--worker-name' && args[i + 1]) {
      options.workerName = args[i + 1];
      i++;
    } else if (arg === '--register-to-master') {
      options.registerToMaster = true;
    } else if (arg === '--no-db') {
      options.initDatabase = false;
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  const system = new DistributedComputingSystem(options);

  try {
    await system.start();
    return system;
  } catch (error) {
    logger.error('Failed to start system:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DistributedComputingSystem,
  parseArgs,
};
