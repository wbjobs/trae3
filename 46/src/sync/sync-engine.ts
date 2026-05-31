import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { SyncApiClient } from './api-client';
import { TaskQueue, TaskQueueEvent, TaskHandler } from './task-queue';
import {
  SyncConfig,
  SyncStatus,
  SyncOperation,
  ConflictRecord,
  SyncError,
  VersionRecord,
  RemoteFileInfo,
  FileUploadRequest,
} from './types';
import { LocalFileManager } from '../local/file-manager';

export enum SyncEventType {
  SYNC_STARTED = 'sync:started',
  SYNC_COMPLETED = 'sync:completed',
  SYNC_FAILED = 'sync:failed',
  FILE_UPLOADED = 'file:uploaded',
  FILE_DOWNLOADED = 'file:downloaded',
  CONFLICT_DETECTED = 'conflict:detected',
  CONFLICT_RESOLVED = 'conflict:resolved',
  PROGRESS = 'progress',
  ERROR = 'error',
}

const OPERATION_RETRY_COUNT = 2;
const OPERATION_RETRY_DELAY = 2000;

export interface BatchSyncOptions {
  fileIds?: string[];
  forceUpload?: boolean;
  forceDownload?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export interface BatchSyncResult {
  taskId: string;
  totalFiles: number;
  uploaded: number;
  downloaded: number;
  failed: number;
  conflicts: number;
}

export class SyncEngine extends EventEmitter {
  private apiClient: SyncApiClient;
  private localManager: LocalFileManager;
  private config: SyncConfig;
  private status: SyncStatus;
  private syncTimer: NodeJS.Timeout | null = null;
  private syncPromise: Promise<void> | null = null;
  private taskQueue: TaskQueue;

  constructor(config: SyncConfig, localManager: LocalFileManager) {
    super();
    this.config = config;
    this.localManager = localManager;
    this.apiClient = new SyncApiClient(config);
    this.status = {
      lastSyncTime: null,
      syncInProgress: false,
      pendingUploads: 0,
      pendingDownloads: 0,
      conflicts: [],
      errors: [],
    };

    this.taskQueue = new TaskQueue({
      concurrency: 3,
      maxRetries: 2,
      retryDelay: 1000,
    });

    this.setupTaskHandlers();
  }

  private setupTaskHandlers(): void {
    const uploadHandler: TaskHandler = async (task, updateProgress) => {
      const fileId = task.data.fileId;
      updateProgress(10, '准备上传');

      const localFile = await this.localManager.getFile(fileId);
      if (!localFile) throw new Error(`文件 ${fileId} 不存在`);

      const content = await this.localManager.readFileContent(fileId);
      const hash = this.computeHash(content);

      if (hash !== localFile.hash) {
        this.addError('upload', `文件 ${fileId} 本地内容哈希不一致`, fileId);
      }

      updateProgress(30, '正在上传');

      const request: FileUploadRequest = {
        name: localFile.name,
        path: localFile.path,
        content,
        hash,
        deviceId: this.config.deviceId,
        changeDescription: task.data.description || '批量同步上传',
        baseVersion: localFile.version,
      };

      const response = await this.apiClient.uploadFile(request);

      if (!response.hash || typeof response.version !== 'number') {
        throw new Error(`文件 ${fileId} 上传响应缺少版本信息`);
      }

      updateProgress(80, '更新本地版本');
      await this.localManager.updateFileVersion(fileId, response.version, response.hash);

      updateProgress(100, '上传完成');

      return { fileId, version: response.version };
    };

    const downloadHandler: TaskHandler = async (task, updateProgress) => {
      const fileId = task.data.fileId;
      updateProgress(20, '正在下载');

      const response = await this.apiClient.downloadFile(fileId, task.data.version);

      const downloadedHash = this.computeHash(response.content);
      if (downloadedHash !== response.hash) {
        throw new Error(`文件 ${fileId} 下载内容哈希校验失败`);
      }

      updateProgress(80, '保存到本地');
      await this.localManager.saveFile(
        fileId,
        response.name,
        response.content,
        response.version,
        response.hash
      );

      updateProgress(100, '下载完成');

      return { fileId, version: response.version };
    };

    const fullSyncHandler: TaskHandler = async (task, updateProgress) => {
      updateProgress(5, '获取远程文件列表');

      const remoteFiles = await this.apiClient.listFiles();
      const localFiles = await this.localManager.listFiles();

      updateProgress(10, '计算同步操作');
      const operations = this.computeSyncOperations(localFiles, remoteFiles);

      const total = operations.length;
      let completed = 0;

      updateProgress(15, `准备同步 ${total} 个文件`);

      this.status.pendingUploads = operations.filter(o => o.type === 'upload').length;
      this.status.pendingDownloads = operations.filter(o => o.type === 'download').length;

      const results = { uploaded: 0, downloaded: 0, conflicts: 0, failed: 0 };

      for (const op of operations) {
        try {
          updateProgress(
            15 + Math.floor((completed / total) * 75),
            `同步中 ${completed + 1}/${total}: ${op.fileName}`
          );

          if (op.type === 'upload') {
            await uploadHandler({ ...task, data: { fileId: op.fileId } }, () => {});
            results.uploaded++;
          } else if (op.type === 'download') {
            await downloadHandler({ ...task, data: { fileId: op.fileId } }, () => {});
            results.downloaded++;
          } else if (op.type === 'conflict') {
            await this.handleConflict(op.fileId, op.localVersion!, op.remoteVersion!);
            results.conflicts++;
          }

          completed++;
        } catch (err) {
          results.failed++;
          this.addError(op.type, (err as Error).message, op.fileId);
        }
      }

      updateProgress(95, '更新同步状态');

      this.status.lastSyncTime = new Date().toISOString();
      this.status.pendingUploads = 0;
      this.status.pendingDownloads = 0;

      updateProgress(100, '同步完成');

      return results;
    };

    this.taskQueue.registerHandler('upload', uploadHandler);
    this.taskQueue.registerHandler('download', downloadHandler);
    this.taskQueue.registerHandler('sync', fullSyncHandler);
  }

  async start(): Promise<void> {
    const reachable = await this.apiClient.ping();
    if (!reachable) {
      this.addError('start', '无法连接到同步服务器');
      this.emit(SyncEventType.ERROR, new Error('无法连接到同步服务器'));
      return;
    }

    if (this.config.autoSync) {
      this.syncTimer = setInterval(
        () => {
          this.sync().catch(err => {
            this.addError('auto-sync', (err as Error).message);
          });
        },
        this.config.syncInterval * 1000
      );
    }

    await this.sync();
  }

  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.taskQueue.pause();
  }

  async sync(): Promise<void> {
    if (this.status.syncInProgress) {
      return this.syncPromise;
    }

    this.status.syncInProgress = true;
    this.emit(SyncEventType.SYNC_STARTED);

    const task = this.taskQueue.addTask('sync', {}, { priority: 'high' });

    this.syncPromise = new Promise((resolve, reject) => {
      this.taskQueue.once(TaskQueueEvent.TASK_COMPLETED, (t) => {
        if (t.id === task.id) {
          this.status.syncInProgress = false;
          this.emit(SyncEventType.SYNC_COMPLETED, t.result);
          resolve();
        }
      });
      this.taskQueue.once(TaskQueueEvent.TASK_FAILED, (t, err) => {
        if (t.id === task.id) {
          this.status.syncInProgress = false;
          this.emit(SyncEventType.SYNC_FAILED, err);
          reject(new Error(err));
        }
      });
    });

    return this.syncPromise;
  }

  async batchUpload(fileIds: string[], options: { priority?: 'high' | 'normal' | 'low' } = {}): Promise<string[]> {
    const taskIds: string[] = [];
    for (const fileId of fileIds) {
      const task = this.taskQueue.addTask('upload', { fileId }, {
        priority: options.priority || 'normal',
      });
      taskIds.push(task.id);
    }
    return taskIds;
  }

  async batchDownload(fileIds: string[], options: { priority?: 'high' | 'normal' | 'low' } = {}): Promise<string[]> {
    const taskIds: string[] = [];
    for (const fileId of fileIds) {
      const task = this.taskQueue.addTask('download', { fileId }, {
        priority: options.priority || 'normal',
      });
      taskIds.push(task.id);
    }
    return taskIds;
  }

  async batchSync(options: BatchSyncOptions = {}): Promise<BatchSyncResult> {
    const task = this.taskQueue.addTask('sync', options, {
      priority: options.priority || 'normal',
    });

    return new Promise((resolve, reject) => {
      this.taskQueue.on(TaskQueueEvent.TASK_COMPLETED, (t) => {
        if (t.id === task.id) {
          resolve(t.result);
        }
      });
      this.taskQueue.on(TaskQueueEvent.TASK_FAILED, (t, err) => {
        if (t.id === task.id) {
          reject(new Error(err));
        }
      });
    });
  }

  private computeSyncOperations(
    localFiles: Array<{ id: string; name: string; version: number; hash: string; lastModified: string }>,
    remoteFiles: RemoteFileInfo[]
  ): SyncOperation[] {
    const operations: SyncOperation[] = [];
    const localMap = new Map(localFiles.map(f => [f.id, f]));
    const remoteMap = new Map(remoteFiles.map(f => [f.id, f]));

    for (const [id, local] of localMap) {
      const remote = remoteMap.get(id);
      if (!remote) {
        operations.push({
          type: 'upload',
          fileId: id,
          fileName: local.name,
          localVersion: local.version,
        });
      } else if (local.version < remote.version && local.hash !== remote.hash) {
        operations.push({
          type: 'download',
          fileId: id,
          fileName: local.name,
          localVersion: local.version,
          remoteVersion: remote.version,
        });
      } else if (local.hash !== remote.hash && local.version === remote.version) {
        operations.push({
          type: 'conflict',
          fileId: id,
          fileName: local.name,
          localVersion: local.version,
          remoteVersion: remote.version,
        });
      } else if (local.hash !== remote.hash && local.version > remote.version) {
        operations.push({
          type: 'upload',
          fileId: id,
          fileName: local.name,
          localVersion: local.version,
          remoteVersion: remote.version,
        });
      }
    }

    for (const [id, remote] of remoteMap) {
      if (!localMap.has(id)) {
        operations.push({
          type: 'download',
          fileId: id,
          fileName: remote.name,
          remoteVersion: remote.version,
        });
      }
    }

    return operations;
  }

  private async uploadFile(fileId: string): Promise<void> {
    const localFile = await this.localManager.getFile(fileId);
    if (!localFile) return;

    const content = await this.localManager.readFileContent(fileId);
    const hash = this.computeHash(content);

    if (hash !== localFile.hash) {
      this.addError('upload', `文件 ${fileId} 本地内容哈希不一致`, fileId);
    }

    const request: FileUploadRequest = {
      name: localFile.name,
      path: localFile.path,
      content,
      hash,
      deviceId: this.config.deviceId,
      changeDescription: '自动同步上传',
      baseVersion: localFile.version,
    };

    const response = await this.apiClient.uploadFile(request);

    if (!response.hash || typeof response.version !== 'number') {
      throw new Error(`文件 ${fileId} 上传响应缺少版本信息`);
    }

    await this.localManager.updateFileVersion(fileId, response.version, response.hash);

    this.emit(SyncEventType.FILE_UPLOADED, { fileId, version: response.version });
  }

  private async downloadFile(fileId: string): Promise<void> {
    const response = await this.apiClient.downloadFile(fileId);

    const downloadedHash = this.computeHash(response.content);
    if (downloadedHash !== response.hash) {
      throw new Error(`文件 ${fileId} 下载内容哈希校验失败`);
    }

    await this.localManager.saveFile(
      fileId,
      response.name,
      response.content,
      response.version,
      response.hash
    );

    this.emit(SyncEventType.FILE_DOWNLOADED, { fileId, version: response.version });
  }

  private async handleConflict(fileId: string, localVersion: number, remoteVersion: number): Promise<void> {
    const localFile = await this.localManager.getFile(fileId);
    const remoteInfo = await this.apiClient.getFileInfo(fileId);

    const conflict: ConflictRecord = {
      id: `${fileId}-${Date.now()}`,
      fileId,
      fileName: localFile?.name || remoteInfo.name,
      localVersion: {
        id: '',
        fileId,
        version: localVersion,
        hash: localFile?.hash || '',
        contentHash: '',
        timestamp: localFile?.lastModified || new Date().toISOString(),
        author: 'local',
        deviceId: this.config.deviceId,
        changeDescription: '',
      },
      remoteVersion: {
        id: '',
        fileId,
        version: remoteVersion,
        hash: remoteInfo.hash,
        contentHash: '',
        timestamp: remoteInfo.lastModified,
        author: remoteInfo.updatedBy,
        deviceId: '',
        changeDescription: '',
      },
      resolved: false,
    };

    switch (this.config.conflictStrategy) {
      case 'local-wins':
        conflict.resolution = 'local';
        conflict.resolved = true;
        await this.uploadFile(fileId);
        break;
      case 'remote-wins':
        conflict.resolution = 'remote';
        conflict.resolved = true;
        await this.downloadFile(fileId);
        break;
      case 'manual':
        this.status.conflicts.push(conflict);
        this.emit(SyncEventType.CONFLICT_DETECTED, conflict);
        break;
    }

    if (conflict.resolved) {
      this.emit(SyncEventType.CONFLICT_RESOLVED, conflict);
    }
  }

  async resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'merge'): Promise<void> {
    const conflict = this.status.conflicts.find(c => c.id === conflictId);
    if (!conflict) throw new Error(`冲突记录 ${conflictId} 不存在`);

    switch (resolution) {
      case 'local':
        await this.uploadFile(conflict.fileId);
        break;
      case 'remote':
        await this.downloadFile(conflict.fileId);
        break;
      case 'merge':
        const localContent = await this.localManager.readFileContent(conflict.fileId);
        const remoteData = await this.apiClient.downloadFile(conflict.fileId);
        const merged = this.mergeContent(localContent, remoteData.content);
        const mergedHash = this.computeHash(merged);
        await this.localManager.saveFile(
          conflict.fileId,
          conflict.fileName,
          merged,
          remoteData.version,
          mergedHash
        );
        break;
    }

    conflict.resolution = resolution;
    conflict.resolved = true;
    this.status.conflicts = this.status.conflicts.filter(c => c.id !== conflictId);
    this.emit(SyncEventType.CONFLICT_RESOLVED, conflict);
  }

  private mergeContent(local: string, remote: string): string {
    const localLines = local.split('\n');
    const remoteLines = remote.split('\n');
    const merged: string[] = [];
    const usedRemoteLines = new Set<number>();

    for (let li = 0; li < localLines.length; li++) {
      const localLine = localLines[li];
      merged.push(localLine);

      const remoteIdx = remoteLines.findIndex(
        (rl, ri) => rl.trim() === localLine.trim() && !usedRemoteLines.has(ri)
      );

      if (remoteIdx === -1) {
        continue;
      }

      usedRemoteLines.add(remoteIdx);

      if (usedRemoteLines.size > 0) {
        const minUsed = Math.min(...Array.from(usedRemoteLines));
        for (let ri = minUsed; ri < remoteIdx; ri++) {
          if (!usedRemoteLines.has(ri)) {
            merged.push(remoteLines[ri]);
            usedRemoteLines.add(ri);
          }
        }
      }
    }

    for (let i = 0; i < remoteLines.length; i++) {
      if (!usedRemoteLines.has(i)) {
        merged.push(remoteLines[i]);
      }
    }

    return merged.join('\n');
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  private addError(operation: string, message: string, fileId?: string): void {
    this.status.errors.push({
      timestamp: new Date().toISOString(),
      operation,
      fileId,
      message,
      retryable: true,
    });

    if (this.status.errors.length > 100) {
      this.status.errors = this.status.errors.slice(-50);
    }
  }

  getStatus(): Readonly<SyncStatus> {
    return { ...this.status };
  }

  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }

  async getFileHistory(fileId: string): Promise<VersionRecord[]> {
    const response = await this.apiClient.getVersions(fileId);
    return response.versions;
  }

  async getFileVersion(fileId: string, version: number): Promise<string> {
    const response = await this.apiClient.downloadFile(fileId, version);
    return response.content;
  }
}
