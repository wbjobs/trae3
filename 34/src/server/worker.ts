import { io, Socket } from 'socket.io-client';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

import config from './config';
import ComputeKernel from './services/ComputeKernel';
import logger from './utils/logger';
import { TaskChunk } from './types';

class ComputeWorker {
  private socket: Socket;
  private nodeId?: string;
  private currentTask?: TaskChunk;
  private isRunning: boolean = false;
  private workerId: string;
  private tempPath: string;
  private serverUrl: string;

  constructor() {
    this.workerId = `worker_${uuidv4().slice(0, 8)}`;
    this.tempPath = path.join(config.storage.basePath, 'worker', this.workerId);

    this.serverUrl = process.env.SERVER_URL || 'http://localhost:8080';
    this.socket = io(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.socket.on('connect', () => {
      logger.info('Connected to scheduler server');
      this.register();
    });

    this.socket.on('disconnect', () => {
      logger.warn('Disconnected from scheduler server');
      this.isRunning = false;
    });

    this.socket.on('node:registered', (data) => {
      this.nodeId = data.nodeId;
      logger.info(`Registered as node: ${this.nodeId}`);
      this.startHeartbeat();
    });

    this.socket.on('node:error', (data) => {
      logger.error(`Node error: ${data.message}`);
    });

    this.socket.on('task:assign', async (chunk: TaskChunk) => {
      logger.info(`Received task assignment: ${chunk.id}`);
      await this.executeTask(chunk);
    });

    this.socket.on('task:cancel', (data) => {
      logger.info(`Task cancellation requested: ${data.taskId}`);
      this.cancelCurrentTask();
    });
  }

  private register(): void {
    const nodeInfo = {
      name: `${os.hostname()}-${this.workerId}`,
      hostname: os.hostname(),
      port: parseInt(process.env.WORKER_PORT || '9000', 10),
      cpuCores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      gpuCount: parseInt(process.env.GPU_COUNT || '0', 10),
      capabilities: ['cfd', 'multiphase'],
    };

    this.socket.emit('node:register', nodeInfo);
  }

  private startHeartbeat(): void {
    setInterval(() => {
      if (!this.nodeId || !this.socket.connected) return;

      const stats = {
        currentLoad: Math.round(os.loadavg()[0] * 100 / os.cpus().length),
        memoryUsage: Math.round((1 - os.freemem() / os.totalmem()) * 100),
        currentTask: this.currentTask?.id,
      };

      this.socket.emit('node:heartbeat', {
        nodeId: this.nodeId,
        stats,
      });
    }, config.scheduler.heartbeatInterval);
  }

  private async executeTask(chunk: TaskChunk): Promise<void> {
    if (this.isRunning) {
      logger.warn('Worker is busy, rejecting task');
      return;
    }

    this.isRunning = true;
    this.currentTask = chunk;

    const casePath = path.join(this.tempPath, chunk.id);

    try {
      await fs.mkdir(casePath, { recursive: true });

      this.sendProgress(chunk.id, 10, 'Generating case directory...');
      await ComputeKernel.generateCaseDirectory(chunk.parameters, casePath);

      this.sendProgress(chunk.id, 20, 'Generating mesh...');
      const meshSuccess = await ComputeKernel.runMeshGeneration(casePath);
      if (!meshSuccess) {
        throw new Error('Mesh generation failed');
      }

      this.sendProgress(chunk.id, 30, 'Starting simulation...');
      const result = await ComputeKernel.runSimulation(
        casePath,
        chunk.parameters.simulation.solver,
        (timestep, message) => {
          const totalTimesteps = Math.ceil(
            (chunk.parameters.simulation.endTime - chunk.parameters.simulation.startTime) /
            chunk.parameters.simulation.timeStep
          );
          const progress = 30 + Math.min(60, (timestep / totalTimesteps) * 60);
          this.sendProgress(chunk.id, Math.round(progress), message);
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Simulation failed');
      }

      this.sendProgress(chunk.id, 95, 'Finalizing...');

      this.socket.emit('task:complete', {
        chunkId: chunk.id,
        nodeId: this.nodeId,
        resultPath: casePath,
        variables: result.variables,
        timesteps: result.timesteps,
      });

      this.sendProgress(chunk.id, 100, 'Completed');
      logger.info(`Task ${chunk.id} completed successfully`);
    } catch (error) {
      logger.error(`Task ${chunk.id} failed: ${(error as Error).message}`);

      this.socket.emit('task:error', {
        chunkId: chunk.id,
        nodeId: this.nodeId,
        error: (error as Error).message,
      });
    } finally {
      this.isRunning = false;
      this.currentTask = undefined;
    }
  }

  private sendProgress(chunkId: string, progress: number, message?: string): void {
    this.socket.emit('task:progress', {
      chunkId,
      nodeId: this.nodeId,
      progress,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  private cancelCurrentTask(): void {
    if (this.currentTask) {
      logger.info(`Cancelling task: ${this.currentTask.id}`);
    }
  }

  start(): void {
    logger.info(`Starting compute worker: ${this.workerId}`);
    logger.info(`Connecting to: ${this.serverUrl}`);
  }
}

const worker = new ComputeWorker();
worker.start();

process.on('SIGINT', () => {
  logger.info('Shutting down worker...');
  process.exit(0);
});
