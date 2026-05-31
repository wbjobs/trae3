import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import { EventEmitter } from 'events';
import { createModuleLogger } from '../logger';
import { HttpClient } from '../network/HttpClient';
import { FirmwareValidator } from '../firmware/FirmwareValidator';
import { delay, retryAsync, withTimeout } from '../../utils';
import {
  UpgradeTask,
  TaskStatus,
  TaskProgress,
  TerminalUpgradeStatus,
  Terminal,
  Firmware,
  TerminalStatus,
  PaginatedResponse,
  PaginationParams
} from '@shared/types';
import { UpgradeTaskEntity } from '@backend/database/entities/UpgradeTask.entity';
import { TaskProgressEntity } from '@backend/database/entities/TaskProgress.entity';
import { Repository } from 'typeorm';
import {
  DEFAULT_MAX_CONCURRENT_TASKS,
  MAX_RETRY_COUNT,
  RETRY_DELAY_MS,
  REBOOT_TIMEOUT_MS,
  REBOOT_CHECK_INTERVAL_MS,
  TERMINAL_API_PORT
} from '../../constants';

const logger = createModuleLogger('UpgradeTaskManager');

export interface CreateTaskOptions {
  name: string;
  firmwareId: string;
  terminalIds: string[];
}

export interface UpgradeContext {
  taskId: string;
  task: UpgradeTask;
  firmware: Firmware;
  terminals: Terminal[];
  httpClient: HttpClient;
  validator: FirmwareValidator;
  completedCount: number;
  failedCount: number;
}

export class UpgradeTaskManager extends EventEmitter {
  private taskRepository: Repository<UpgradeTaskEntity> | null = null;
  private progressRepository: Repository<TaskProgressEntity> | null = null;
  private taskQueue: string[] = [];
  private runningTasks: Map<string, UpgradeContext> = new Map();
  private mutex: Mutex = new Mutex();
  private maxConcurrentTasks: number = DEFAULT_MAX_CONCURRENT_TASKS;
  private taskCancelTokens = new Map<string, boolean>();

  constructor() {
    super();
    logger.info('init', '升级任务管理器初始化完成');
  }

  setRepositories(
    taskRepo: Repository<UpgradeTaskEntity>,
    progressRepo: Repository<TaskProgressEntity>
  ): void {
    this.taskRepository = taskRepo;
    this.progressRepository = progressRepo;
  }

  setMaxConcurrentTasks(max: number): void {
    this.maxConcurrentTasks = max;
    logger.info('set_max_concurrent', '更新最大并发任务数', { max });
  }

  getMaxConcurrentTasks(): number {
    return this.maxConcurrentTasks;
  }

  private getTaskRepository(): Repository<UpgradeTaskEntity> {
    if (!this.taskRepository) {
      throw new Error('任务数据库仓库未初始化');
    }
    return this.taskRepository;
  }

  private getProgressRepository(): Repository<TaskProgressEntity> {
    if (!this.progressRepository) {
      throw new Error('进度数据库仓库未初始化');
    }
    return this.progressRepository;
  }

  private entityToTask(entity: UpgradeTaskEntity): UpgradeTask {
    return {
      id: entity.id,
      name: entity.name,
      firmwareId: entity.firmwareId,
      terminalIds: entity.terminalIds,
      status: entity.status,
      progress: entity.progress,
      completedCount: entity.completedCount,
      totalCount: entity.totalCount,
      createdAt: entity.createdAt,
      startedAt: entity.startedAt,
      finishedAt: entity.finishedAt,
      errorMessage: entity.errorMessage
    };
  }

  private entityToProgress(entity: TaskProgressEntity): TaskProgress {
    return {
      taskId: entity.taskId,
      terminalId: entity.terminalId,
      status: entity.status,
      progress: entity.progress,
      message: entity.message,
      updatedAt: entity.updatedAt
    };
  }

  async createTask(options: CreateTaskOptions): Promise<UpgradeTask> {
    if (options.terminalIds.length === 0) {
      throw new Error('至少需要选择一个终端');
    }

    const task: UpgradeTask = {
      id: uuidv4(),
      name: options.name,
      firmwareId: options.firmwareId,
      terminalIds: options.terminalIds,
      status: TaskStatus.PENDING,
      progress: 0,
      completedCount: 0,
      totalCount: options.terminalIds.length,
      createdAt: new Date()
    };

    const repo = this.getTaskRepository();
    const entity = repo.create(task);
    await repo.save(entity);

    const progressRepo = this.getProgressRepository();
    for (const terminalId of options.terminalIds) {
      const progress = progressRepo.create({
        taskId: task.id,
        terminalId,
        status: TerminalUpgradeStatus.PENDING,
        progress: 0,
        message: '等待升级'
      });
      await progressRepo.save(progress);
    }

    this.taskCancelTokens.set(task.id, false);

    logger.info('create_task', '升级任务创建成功', {
      taskId: task.id,
      name: task.name,
      terminalCount: task.totalCount
    });

    this.emit('task:created', task);
    return task;
  }

  async startTask(taskId: string, firmware: Firmware, terminals: Terminal[]): Promise<boolean> {
    const release = await this.mutex.acquire();

    try {
      if (this.runningTasks.size >= this.maxConcurrentTasks) {
        logger.warn('start_task', '并发任务数已达上限', {
          taskId,
          maxConcurrent: this.maxConcurrentTasks
        });
        this.taskQueue.push(taskId);
        return false;
      }

      const repo = this.getTaskRepository();
      const entity = await repo.findOne({ where: { id: taskId } });

      if (!entity) {
        logger.error('start_task', '任务不存在', { taskId });
        return false;
      }

      if (entity.status !== TaskStatus.PENDING) {
        logger.warn('start_task', '任务状态不正确', { taskId, status: entity.status });
        return false;
      }

      entity.status = TaskStatus.RUNNING;
      entity.startedAt = new Date();
      await repo.save(entity);

      this.taskCancelTokens.set(taskId, false);

      const context: UpgradeContext = {
        taskId,
        task: this.entityToTask(entity),
        firmware,
        terminals,
        httpClient: new HttpClient({ timeout: 120000 }),
        validator: new FirmwareValidator(),
        completedCount: 0,
        failedCount: 0
      };

      this.runningTasks.set(taskId, context);

      logger.info('start_task', '升级任务开始执行', { taskId, name: entity.name });

      this.executeTask(context).catch((error) => {
        logger.error('execute_task', '任务执行异常', { taskId, error: error.message });
      });

      this.emit('task:started', this.entityToTask(entity));
      return true;
    } finally {
      release();
    }
  }

  private async executeTask(context: UpgradeContext): Promise<void> {
    const { taskId, task, firmware, terminals } = context;
    const repo = this.getTaskRepository();

    try {
      const integrity = await context.validator.verifyIntegrity(firmware);
      if (!integrity.valid) {
        throw new Error(`固件完整性校验失败: ${integrity.error || '未知错误'}`);
      }

      for (const terminal of terminals) {
        if (this.taskCancelTokens.get(taskId)) {
          logger.info('task_cancelled', `任务 ${taskId} 已取消`, { taskId });
          break;
        }

        try {
          await this.upgradeTerminal(context, terminal);
          context.completedCount++;
        } catch (error) {
          context.failedCount++;
          logger.error('upgrade_failed', `终端 ${terminal.name} 升级失败`, {
            terminalId: terminal.id,
            error: (error as Error).message
          });
        }

        const entity = await repo.findOne({ where: { id: taskId } });
        if (entity) {
          entity.completedCount = context.completedCount;
          const totalProcessed = context.completedCount + context.failedCount;
          entity.progress = Math.round((totalProcessed / terminals.length) * 100);
          await repo.save(entity);

          this.emit('task:progress', {
            taskId,
            progress: entity.progress,
            completedCount: entity.completedCount
          });
        }
      }

      const finalEntity = await repo.findOne({ where: { id: taskId } });
      if (finalEntity) {
        if (this.taskCancelTokens.get(taskId)) {
          finalEntity.status = TaskStatus.CANCELLED;
          finalEntity.finishedAt = new Date();
          await repo.save(finalEntity);
          logger.info('task_cancelled', '升级任务已取消', { taskId });
          this.emit('task:cancelled', this.entityToTask(finalEntity));
        } else if (context.failedCount > 0 && context.completedCount === 0) {
          finalEntity.status = TaskStatus.FAILED;
          finalEntity.finishedAt = new Date();
          finalEntity.errorMessage = '所有终端升级失败';
          await repo.save(finalEntity);
          logger.error('task_failed', '升级任务执行失败', { taskId, error: '所有终端升级失败' });
          this.emit('task:failed', {
            task: this.entityToTask(finalEntity),
            error: '所有终端升级失败'
          });
        } else {
          finalEntity.status = TaskStatus.COMPLETED;
          finalEntity.finishedAt = new Date();
          finalEntity.progress = 100;
          await repo.save(finalEntity);
          logger.info('task_complete', '升级任务执行完成', { taskId, completed: context.completedCount, failed: context.failedCount });
          this.emit('task:completed', this.entityToTask(finalEntity));
        }
      }
    } catch (error) {
      const entity = await repo.findOne({ where: { id: taskId } });
      if (entity) {
        entity.status = TaskStatus.FAILED;
        entity.finishedAt = new Date();
        entity.errorMessage = (error as Error).message;
        await repo.save(entity);

        logger.error('task_failed', '升级任务执行失败', {
          taskId,
          error: (error as Error).message
        });
        this.emit('task:failed', {
          task: this.entityToTask(entity),
          error: (error as Error).message
        });
      }
    } finally {
      this.runningTasks.delete(taskId);
      this.taskCancelTokens.delete(taskId);
      this.processQueue();
    }
  }

  private async upgradeTerminal(context: UpgradeContext, terminal: Terminal): Promise<void> {
    const { taskId, firmware, httpClient } = context;
    const progressRepo = this.getProgressRepository();

    const updateProgress = async (status: TerminalUpgradeStatus, progress: number, message?: string) => {
      await progressRepo.createQueryBuilder()
        .update()
        .set({ status, progress, message, updatedAt: new Date() })
        .where('taskId = :taskId AND terminalId = :terminalId', { taskId, terminalId: terminal.id })
        .execute();

      this.emit('terminal:progress', {
        taskId,
        terminalId: terminal.id,
        status,
        progress,
        message
      });
    };

    const upgradeFn = async (attempt: number = 1) => {
      logger.info('upgrade_start', `开始升级终端 ${terminal.name}，尝试 ${attempt}/${MAX_RETRY_COUNT}`, {
        taskId,
        terminalId: terminal.id
      });

      try {
        await updateProgress(TerminalUpgradeStatus.DOWNLOADING, 10, '开始下载固件');

        const baseUrl = `http://${terminal.ip}:${TERMINAL_API_PORT}`;

        const uploadForm = new FormData();
        const fs = require('fs');
        const fileBuffer = fs.readFileSync(firmware.filePath);
        const blob = new Blob([fileBuffer], { type: 'application/octet-stream' });
        uploadForm.append('firmware', blob, firmware.name);
        uploadForm.append('md5', firmware.md5);
        uploadForm.append('version', firmware.version);

        await updateProgress(TerminalUpgradeStatus.DOWNLOADING, 30, '正在上传固件');

        const uploadResponse = await withTimeout(
          httpClient.post(`${baseUrl}/api/firmware/upload`, uploadForm, {
            headers: {
              'Content-Type': 'multipart/form-data'
            },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 70) / progressEvent.total) + 10;
                updateProgress(TerminalUpgradeStatus.DOWNLOADING, Math.min(percent, 80), '正在上传固件').catch(() => {});
              }
            }
          }),
          120000,
          '上传固件超时'
        );

        if (!uploadResponse.success) {
          throw new Error(`固件上传失败: ${uploadResponse.error || '未知错误'}`);
        }

        await updateProgress(TerminalUpgradeStatus.VERIFYING, 80, '正在校验固件');

        const verifyResponse = await withTimeout(
          httpClient.post(`${baseUrl}/api/firmware/verify`, {
            md5: firmware.md5,
            sha256: firmware.sha256
          }),
          30000,
          '校验固件超时'
        );

        if (!verifyResponse.success) {
          throw new Error(`固件校验失败: ${verifyResponse.error || '未知错误'}`);
        }

        await updateProgress(TerminalUpgradeStatus.INSTALLING, 90, '正在安装固件');

        const installResponse = await withTimeout(
          httpClient.post(`${baseUrl}/api/firmware/install`, {
            version: firmware.version
          }),
          60000,
          '安装固件超时'
        );

        if (!installResponse.success) {
          throw new Error(`固件安装失败: ${installResponse.error || '未知错误'}`);
        }

        await updateProgress(TerminalUpgradeStatus.REBOOTING, 95, '正在重启终端');

        await this.waitForTerminalReboot(terminal.ip, taskId);

        await updateProgress(TerminalUpgradeStatus.SUCCESS, 100, '升级成功');

        logger.info('upgrade_success', `终端 ${terminal.name} 升级成功`, {
          taskId,
          terminalId: terminal.id
        });
      } catch (error) {
        await updateProgress(TerminalUpgradeStatus.FAILED, 0, `升级失败: ${(error as Error).message}`);
        throw error;
      }
    };

    await retryAsync(
      upgradeFn,
      MAX_RETRY_COUNT,
      RETRY_DELAY_MS,
      (attempt, error) => {
        logger.warn('upgrade_retry', `终端 ${terminal.name} 升级重试 ${attempt}`, {
          taskId,
          terminalId: terminal.id,
          error: error.message
        });
        updateProgress(TerminalUpgradeStatus.PENDING, 0, `升级失败，即将重试 (${attempt}/${MAX_RETRY_COUNT})`).catch(() => {});
      }
    );
  }

  private async waitForTerminalReboot(ip: string, taskId: string): Promise<void> {
    const startTime = Date.now();
    const ping = require('ping');

    while (Date.now() - startTime < REBOOT_TIMEOUT_MS) {
      if (this.taskCancelTokens.get(taskId)) {
        throw new Error('升级已取消');
      }

      try {
        const result = await ping.promise.probe(ip, { timeout: 1 });
        if (!result.alive) {
          await delay(2000);
          const result2 = await ping.promise.probe(ip, { timeout: 1 });
          if (result2.alive) {
            await delay(3000);
            logger.info('reboot_success', `终端重启完成`, { terminalIp: ip });
            return;
          }
        }
      } catch {
        // Ignore ping errors
      }
      await delay(REBOOT_CHECK_INTERVAL_MS);
    }

    throw new Error('终端重启超时');
  }

  async cancelTask(taskId: string): Promise<boolean> {
    const repo = this.getTaskRepository();
    const entity = await repo.findOne({ where: { id: taskId } });

    if (!entity) {
      return false;
    }

    if (entity.status === TaskStatus.RUNNING) {
      this.taskCancelTokens.set(taskId, true);
      const context = this.runningTasks.get(taskId);
      if (context) {
        try {
          const baseUrl = `http://${context.terminals[0]?.ip}:${TERMINAL_API_PORT}`;
          await context.httpClient.post(`${baseUrl}/api/firmware/cancel`, {}).catch(() => {});
        } catch {
          // Ignore cancel errors
        }
      }
      logger.info('cancel_requested', `请求取消任务 ${taskId}`, { taskId });
      return true;
    }

    if (entity.status === TaskStatus.PENDING) {
      entity.status = TaskStatus.CANCELLED;
      entity.finishedAt = new Date();
      await repo.save(entity);

      this.taskQueue = this.taskQueue.filter(id => id !== taskId);
      this.taskCancelTokens.delete(taskId);

      logger.info('cancel_task', '任务已取消', { taskId });
      this.emit('task:cancelled', this.entityToTask(entity));
      return true;
    }

    return false;
  }

  private async processQueue(): Promise<void> {
    const release = await this.mutex.acquire();

    try {
      while (this.taskQueue.length > 0 && this.runningTasks.size < this.maxConcurrentTasks) {
        const taskId = this.taskQueue.shift();
        if (taskId) {
          this.emit('task:ready', taskId);
        }
      }
    } finally {
      release();
    }
  }

  async getTaskList(params: PaginationParams & { status?: TaskStatus } = { page: 1, pageSize: 20 }): Promise<PaginatedResponse<UpgradeTask>> {
    const repo = this.getTaskRepository();
    const queryBuilder = repo.createQueryBuilder('task');

    if (params.status) {
      queryBuilder.andWhere('task.status = :status', { status: params.status });
    }

    const [entities, total] = await queryBuilder
      .orderBy('task.createdAt', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();

    return {
      items: entities.map(e => this.entityToTask(e)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getTaskById(taskId: string): Promise<UpgradeTask | null> {
    const repo = this.getTaskRepository();
    const entity = await repo.findOne({ where: { id: taskId } });
    return entity ? this.entityToTask(entity) : null;
  }

  async getTaskProgress(taskId: string): Promise<TaskProgress[]> {
    const repo = this.getProgressRepository();
    const entities = await repo.find({
      where: { taskId },
      order: { updatedAt: 'DESC' }
    });
    return entities.map(e => this.entityToProgress(e));
  }

  async getTerminalProgress(taskId: string, terminalId: string): Promise<TaskProgress | null> {
    const repo = this.getProgressRepository();
    const entity = await repo.findOne({ where: { taskId, terminalId } });
    return entity ? this.entityToProgress(entity) : null;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const repo = this.getTaskRepository();
    const entity = await repo.findOne({ where: { id: taskId } });

    if (!entity) {
      return false;
    }

    if (entity.status === TaskStatus.RUNNING) {
      throw new Error('任务正在运行中，无法删除');
    }

    const progressRepo = this.getProgressRepository();
    await progressRepo.delete({ taskId });
    await repo.delete(taskId);

    this.taskQueue = this.taskQueue.filter(id => id !== taskId);
    this.taskCancelTokens.delete(taskId);

    logger.info('delete_task', '任务删除成功', { taskId });
    return true;
  }

  getRunningTasks(): UpgradeTask[] {
    return Array.from(this.runningTasks.values()).map(ctx => ctx.task);
  }

  getQueuedTasks(): string[] {
    return [...this.taskQueue];
  }
}

export const createUpgradeTaskManager = (): UpgradeTaskManager => {
  return new UpgradeTaskManager();
};

export default UpgradeTaskManager;
