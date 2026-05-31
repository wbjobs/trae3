import { EventEmitter } from 'events';

export type TaskPriority = 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'upload' | 'download' | 'delete' | 'sync' | 'parse' | 'convert' | 'validate';

export interface SyncTask {
  id: string;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  data: any;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: number;
  progressText: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  dependsOn: string[];
  result?: any;
  estimatedTime?: number;
  worker?: string;
}

export interface TaskQueueStats {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  avgDuration: number;
  throughput: number;
}

export interface QueueConfig {
  concurrency: number;
  maxRetries: number;
  retryDelay: number;
  priorityWeights: Record<TaskPriority, number>;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

const DEFAULT_CONFIG: QueueConfig = {
  concurrency: 3,
  maxRetries: 2,
  retryDelay: 1000,
  priorityWeights: {
    high: 3,
    normal: 2,
    low: 1,
  },
};

export enum TaskQueueEvent {
  TASK_ADDED = 'task:added',
  TASK_STARTED = 'task:started',
  TASK_PROGRESS = 'task:progress',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',
  TASK_CANCELLED = 'task:cancelled',
  TASK_RETRY = 'task:retry',
  QUEUE_DRAINED = 'queue:drained',
  QUEUE_PAUSED = 'queue:paused',
  QUEUE_RESUMED = 'queue:resumed',
}

export type TaskHandler = (task: SyncTask, updateProgress: (progress: number, text?: string) => void) => Promise<any>;

export class TaskQueue extends EventEmitter {
  private tasks: Map<string, SyncTask> = new Map();
  private taskOrder: string[] = [];
  private runningTasks: Set<string> = new Set();
  private paused: boolean = false;
  private config: QueueConfig;
  private handlers: Map<TaskType, TaskHandler> = new Map();
  private requestTimestamps: number[] = [];
  private processing: boolean = false;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  registerHandler(type: TaskType, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  addTask(
    type: TaskType,
    data: any,
    options: {
      priority?: TaskPriority;
      dependsOn?: string[];
      maxRetries?: number;
      taskId?: string;
    } = {}
  ): SyncTask {
    const task: SyncTask = {
      id: options.taskId || this.generateId(),
      type,
      status: 'queued',
      priority: options.priority || 'normal',
      data,
      createdAt: new Date().toISOString(),
      progress: 0,
      progressText: '等待中...',
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
      dependsOn: options.dependsOn || [],
    };

    this.tasks.set(task.id, task);
    this.insertTaskByPriority(task.id);

    this.emit(TaskQueueEvent.TASK_ADDED, task);

    setImmediate(() => this.processQueue());

    return task;
  }

  addBatch(
    tasks: Array<{ type: TaskType; data: any; priority?: TaskPriority }>
  ): SyncTask[] {
    const results: SyncTask[] = [];
    for (const t of tasks) {
      results.push(this.addTask(t.type, t.data, { priority: t.priority }));
    }
    return results;
  }

  private insertTaskByPriority(taskId: string): void {
    const newTask = this.tasks.get(taskId)!;
    const newWeight = this.config.priorityWeights[newTask.priority];

    let insertIndex = 0;
    for (let i = 0; i < this.taskOrder.length; i++) {
      const existing = this.tasks.get(this.taskOrder[i])!;
      const existingWeight = this.config.priorityWeights[existing.priority];
      if (existingWeight < newWeight) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    this.taskOrder.splice(insertIndex, 0, taskId);
  }

  private generateId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.paused) return;
    this.processing = true;

    try {
      while (this.runningTasks.size < this.config.concurrency && this.taskOrder.length > 0) {
        const nextTaskId = this.findNextRunnableTask();
        if (!nextTaskId) break;

        const task = this.tasks.get(nextTaskId)!;
        const depsReady = task.dependsOn.every(depId => {
          const dep = this.tasks.get(depId);
          return dep && dep.status === 'completed';
        });

        if (!depsReady) {
          continue;
        }

        if (!this.checkRateLimit()) {
          break;
        }

        this.runningTasks.add(nextTaskId);
        this.runTask(task);
      }
    } finally {
      this.processing = false;
    }
  }

  private findNextRunnableTask(): string | null {
    for (const taskId of this.taskOrder) {
      const task = this.tasks.get(taskId)!;
      if (task.status === 'queued') {
        const depsReady = task.dependsOn.every(depId => {
          const dep = this.tasks.get(depId);
          return dep && dep.status === 'completed';
        });
        if (depsReady) return taskId;
      }
    }
    return null;
  }

  private checkRateLimit(): boolean {
    if (!this.config.rateLimit) return true;

    const now = Date.now();
    const windowStart = now - this.config.rateLimit.windowMs;

    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);

    if (this.requestTimestamps.length >= this.config.rateLimit.maxRequests) {
      setTimeout(() => this.processQueue(), this.config.rateLimit!.windowMs);
      return false;
    }

    this.requestTimestamps.push(now);
    return true;
  }

  private async runTask(task: SyncTask): Promise<void> {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.progress = 0;
    task.progressText = '开始执行...';

    this.emit(TaskQueueEvent.TASK_STARTED, task);

    const handler = this.handlers.get(task.type);
    if (!handler) {
      this.failTask(task, `未找到类型为 ${task.type} 的处理器`);
      return;
    }

    const updateProgress = (progress: number, text?: string) => {
      task.progress = Math.min(100, Math.max(0, progress));
      if (text) task.progressText = text;
      this.emit(TaskQueueEvent.TASK_PROGRESS, task);
    };

    try {
      const result = await handler(task, updateProgress);
      this.completeTask(task, result);
    } catch (err) {
      if (task.retryCount < task.maxRetries) {
        task.retryCount++;
        this.emit(TaskQueueEvent.TASK_RETRY, task, (err as Error).message);
        setTimeout(() => {
          task.status = 'queued';
          this.runningTasks.delete(task.id);
          this.processQueue();
        }, this.config.retryDelay * Math.pow(2, task.retryCount - 1));
      } else {
        this.failTask(task, (err as Error).message);
      }
    }
  }

  private completeTask(task: SyncTask, result: any): void {
    task.status = 'completed';
    task.progress = 100;
    task.progressText = '完成';
    task.completedAt = new Date().toISOString();
    task.result = result;

    this.runningTasks.delete(task.id);
    this.removeFromOrder(task.id);

    this.emit(TaskQueueEvent.TASK_COMPLETED, task);

    if (this.taskOrder.length === 0 && this.runningTasks.size === 0) {
      this.emit(TaskQueueEvent.QUEUE_DRAINED);
    }

    setImmediate(() => this.processQueue());
  }

  private failTask(task: SyncTask, error: string): void {
    task.status = 'failed';
    task.progressText = `失败: ${error}`;
    task.error = error;
    task.completedAt = new Date().toISOString();

    this.runningTasks.delete(task.id);
    this.removeFromOrder(task.id);

    this.emit(TaskQueueEvent.TASK_FAILED, task, error);

    setImmediate(() => this.processQueue());
  }

  private removeFromOrder(taskId: string): void {
    const idx = this.taskOrder.indexOf(taskId);
    if (idx !== -1) {
      this.taskOrder.splice(idx, 1);
    }
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;
    if (task.status === 'running' || task.status === 'completed' || task.status === 'failed') {
      return false;
    }

    task.status = 'cancelled';
    task.progressText = '已取消';
    this.removeFromOrder(taskId);

    this.emit(TaskQueueEvent.TASK_CANCELLED, task);
    return true;
  }

  cancelAll(): void {
    for (const taskId of this.taskOrder) {
      const task = this.tasks.get(taskId)!;
      if (task.status === 'queued') {
        task.status = 'cancelled';
        task.progressText = '已取消';
      }
    }
    this.taskOrder = [];
  }

  pause(): void {
    this.paused = true;
    this.emit(TaskQueueEvent.QUEUE_PAUSED);
  }

  resume(): void {
    this.paused = false;
    this.emit(TaskQueueEvent.QUEUE_RESUMED);
    setImmediate(() => this.processQueue());
  }

  getTask(taskId: string): SyncTask | undefined {
    return this.tasks.get(taskId);
  }

  getTasks(filter?: { status?: TaskStatus; type?: TaskType }): SyncTask[] {
    let results = Array.from(this.tasks.values());

    if (filter?.status) {
      results = results.filter(t => t.status === filter.status);
    }
    if (filter?.type) {
      results = results.filter(t => t.type === filter.type);
    }

    return results;
  }

  getStats(): TaskQueueStats {
    const tasks = Array.from(this.tasks.values());
    const completed = tasks.filter(t => t.status === 'completed');

    let totalDuration = 0;
    for (const t of completed) {
      if (t.startedAt && t.completedAt) {
        totalDuration += new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
      }
    }

    const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'queued').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: completed.length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      avgDuration,
      throughput: avgDuration > 0 ? 1000 / avgDuration : 0,
    };
  }

  clearCompleted(olderThanMs?: number): void {
    const now = Date.now();
    for (const [id, task] of this.tasks) {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        if (olderThanMs && task.completedAt) {
          const age = now - new Date(task.completedAt).getTime();
          if (age < olderThanMs) continue;
        }
        this.tasks.delete(id);
      }
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  isEmpty(): boolean {
    return this.taskOrder.length === 0 && this.runningTasks.size === 0;
  }

  updateConfig(config: Partial<QueueConfig>): void {
    Object.assign(this.config, config);
  }

  getConfig(): Readonly<QueueConfig> {
    return { ...this.config };
  }
}
