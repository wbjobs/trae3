// 文件服务 - 分片上传、断点续传、文件管理

import { Injectable, inject } from '@angular/core';
import {
  Observable, Subject, BehaviorSubject, forkJoin, of, from, throwError } from 'rxjs';
import {
  map,
  tap,
  switchMap,
  catchError,
  finalize,
  take } from 'rxjs/operators';
import { HttpClient, HttpRequest, HttpEvent, HttpEventType } from '@angular/common/http';
import { v4 as uuidv4 from 'uuid';
import { ApiService } from '../../../../core/services/api.service';
import {
  FileInfo,
  FileStatus,
  FileType,
  FileAccess,
  ChunkUploadRequest,
  ChunkUploadResponse,
  InitializeUploadRequest,
  InitializeUploadResponse,
  CompleteUploadRequest,
  CompleteUploadResponse,
  UploadProgress,
  FileFilter,
  FilePageResponse,
  FileBatchRequest,
  FileShareRequest,
  FileProcessingJob,
  FileChunkInfo,
  DropzoneConfig
} from '../../../../core/models/file.model';

export interface ChunkUploadTask {
  fileId: string;
  file: File;
  config: DropzoneConfig;
  chunks: Blob[];
  uploadedChunks: Set<number>;
  failedChunks: Map<number, number>;
  progress: UploadProgress;
  isPaused: boolean;
  isCancelled: boolean;
  startTime: number;
  uploadedBytes: number;
}

@Injectable({ providedIn: 'root' })
export class FileService {
  private readonly apiService = inject(ApiService);
  private readonly http = inject(HttpClient);

  private readonly defaultChunkSize = 5 * 1024 * 1024;
  private readonly maxParallelChunks = 3;
  private readonly maxRetryAttempts = 3;

  private readonly uploadTasks = new Map<string, ChunkUploadTask>();
  private readonly progressSubject = new Subject<UploadProgress>();
  private readonly activeUploads = new BehaviorSubject<Map<string, ChunkUploadTask>>(new Map());

  readonly progress$ = this.progressSubject.asObservable();
  readonly activeUploads$ = this.activeUploads.asObservable();

  getFiles(filter?: FileFilter): Observable<FilePageResponse> {
    const params: any = {};

    if (filter) {
      if (filter.projectId) params.projectId = filter.projectId;
      if (filter.type) params.type = Array.isArray(filter.type) ? filter.type.join(',') : filter.type;
      if (filter.status) params.status = Array.isArray(filter.status) ? filter.status.join(',') : filter.status;
      if (filter.access) params.access = Array.isArray(filter.access) ? filter.access.join(',') : filter.access;
      if (filter.uploadedBy) params.uploadedBy = filter.uploadedBy;
      if (filter.searchText) params.searchText = filter.searchText;
      if (filter.tags) params.tags = filter.tags.join(',');
      if (filter.minSize) params.minSize = filter.minSize;
      if (filter.maxSize) params.maxSize = filter.maxSize;
      if (filter.startDate) params.startDate = filter.startDate.toISOString();
      if (filter.endDate) params.endDate = filter.endDate.toISOString();
      if (filter.page) params.page = filter.page;
      if (filter.pageSize) params.pageSize = filter.pageSize;
      if (filter.sortBy) params.sortBy = filter.sortBy;
      if (filter.sortOrder) params.sortOrder = filter.sortOrder;
    }

    return this.apiService.get<FilePageResponse>('/files', { params });
  }

  getFile(id: string): Observable<FileInfo> {
    return this.apiService.get<FileInfo>(`/files/${id}`);
  }

  deleteFile(id: string): Observable<void> {
    return this.apiService.delete<void>(`/files/${id}`);
  }

  updateFile(id: string, data: Partial<FileInfo>): Observable<FileInfo> {
    return this.apiService.put<FileInfo>(`/files/${id}`, data);
  }

  batchOperation(request: FileBatchRequest): Observable<any> {
    return this.apiService.post<any>('/files/batch', request);
  }

  shareFile(request: FileShareRequest): Observable<FileInfo> {
    return this.apiService.post<FileInfo>(`/files/${request.fileId}/share`, request);
  }

  downloadFile(id: string): Observable<Blob> {
    return this.apiService.downloadFile(`/files/${id}/download`);
  }

  getProcessingJobs(fileId: string): Observable<FileProcessingJob[]> {
    return this.apiService.get<FileProcessingJob[]>(`/files/${fileId}/jobs`);
  }

  initializeUpload(request: InitializeUploadRequest): Observable<InitializeUploadResponse> {
    return this.apiService.post<InitializeUploadResponse>('/files/upload/initialize', {
      ...request,
      chunkSize: request.chunkSize || this.defaultChunkSize
    });
  }

  uploadChunk(
    fileId: string,
    chunkIndex: number,
    chunk: Blob,
    request: ChunkUploadRequest
  ): Observable<ChunkUploadResponse> {
    const formData = new FormData();
    formData.append('chunk', chunk, `chunk_${chunkIndex}');
    formData.append('fileId', fileId);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', request.totalChunks.toString());
    formData.append('chunkSize', request.chunkSize.toString());
    formData.append('totalSize', request.totalSize.toString());
    formData.append('fileName', request.fileName);
    formData.append('fileType', request.fileType);

    if (request.projectId) formData.append('projectId', request.projectId);
    if (request.access) formData.append('access', request.access);
    if (request.checksum) formData.append('checksum', request.checksum);

    return this.apiService.post<ChunkUploadResponse>(
      '/files/upload/chunk',
      formData,
      {
        headers: {}
      }
    );
  }

  completeUpload(request: CompleteUploadRequest): Observable<CompleteUploadResponse> {
    return this.apiService.post<CompleteUploadResponse>(
      `/files/upload/complete`,
      request
    );
  }

  uploadFile(
    file: File,
    config?: Partial<DropzoneConfig>): Observable<UploadProgress> {
    const task = this.createUploadTask(file, config);

    return new Observable<UploadProgress>(observer => {
      this.initializeUpload({
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        chunkSize: task.config.chunkSize,
        projectId: config?.projectId,
        access: config?.access,
        description: config?.description,
        tags: config?.tags,
        metadata: config?.metadata
      }).pipe(
          switchMap(initResponse => {
            task.fileId = initResponse.fileId;

            if (initResponse.exists && initResponse.uploadedChunks) {
              initResponse.uploadedChunks.forEach(index =>
                task.uploadedChunks.add(index)
              );
            }

            task.progress = this.createProgress(task);

            return this.uploadChunks(task);
          }),
          switchMap(() => {
            return this.completeUpload({
              fileId: task.fileId
            });
          }),
          tap(completeResponse => {
              task.progress.status = FileStatus.COMPLETED;
              task.progress.progress = 100;
              this.updateProgress(task);
              observer.next(task.progress);
              observer.complete();
              this.cleanupTask(task.fileId);
            }),
          catchError(error => {
            task.progress.status = FileStatus.FAILED;
            task.progress.error = error.message;
            this.updateProgress(task);
            observer.error(error);
            this.cleanupTask(task.fileId);
            return throwError(() => error);
          })
        ).subscribe();

      return () => {
        this.cancelUpload(task.fileId);
      };
    });
  }

  private createUploadTask(
    file: File,
    config?: Partial<DropzoneConfig>
  ): ChunkUploadTask {
    const chunkSize = config?.chunkSize || this.defaultChunkSize;
    const chunks: Blob[] = [];
    const totalChunks = Math.ceil(file.size / chunkSize);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      chunks.push(file.slice(start, end));
    }

    const task: ChunkUploadTask = {
      fileId: uuidv4(),
      file,
      config: {
        multiple: config?.multiple || false,
        maxFiles: config?.maxFiles || 10,
        maxFileSize: config?.maxFileSize || 500 * 1024 * 1024,
        acceptedTypes: config?.acceptedTypes || [],
        autoUpload: config?.autoUpload || false,
        chunkSize,
        parallelChunks: config?.parallelChunks || this.maxParallelChunks,
        retryAttempts: config?.retryAttempts || this.maxRetryAttempts
      },
      chunks,
      uploadedChunks: new Set<number>(),
      failedChunks: new Map<number, number>(),
      progress: {
        fileId: '',
        fileName: file.name,
        totalSize: file.size,
        uploadedSize: 0,
        progress: 0,
        speed: 0,
        remainingTime: 0,
        status: FileStatus.UPLOADING,
        chunks: {
          total: totalChunks,
          uploaded: 0,
          failed: 0
        }
      },
      isPaused: false,
      isCancelled: false,
      startTime: Date.now(),
      uploadedBytes: 0
    };

    this.uploadTasks.set(task.fileId, task);
    this.updateActiveUploads();

    return task;
  }

  private uploadChunks(task: ChunkUploadTask): Observable<void> {
    const totalChunks = task.chunks.length;
    const parallelChunks = task.config.parallelChunks;

    return new Observable<void>(observer => {
      let currentIndex = 0;
      let activeCount = 0;
      let completed = false;

      const uploadNext = () => {
        if (task.isCancelled) {
          observer.error(new Error('Upload cancelled'));
          return;
        }

        while (
          activeCount < parallelChunks &&
          currentIndex < totalChunks &&
          !task.isPaused
        ) {
          if (task.uploadedChunks.has(currentIndex)) {
            currentIndex++;
            continue;
          } else {
            activeCount++;
            this.uploadSingleChunk(task, currentIndex).subscribe({
              next: () => {
                activeCount--;
                if (currentIndex < totalChunks) {
                  uploadNext();
                } else if (activeCount === 0 && !completed) {
                  completed = true;
                  observer.next();
                  observer.complete();
                }
              },
              error: (error) => {
                activeCount--;
                if (task.isCancelled) {
                  observer.error(error);
                } else if (currentIndex < totalChunks) {
                  uploadNext();
                } else if (activeCount === 0 && !completed) {
                  if (task.failedChunks.size > 0) {
                    observer.error(new Error('Some chunks failed to upload'));
                  } else {
                    completed = true;
                    observer.next();
                    observer.complete();
                  }
                }
              }
            });
            currentIndex++;
          }
        }

        if (task.isPaused && activeCount === 0 && !completed) {
        }
      };

      uploadNext();
    });
  }

  private uploadSingleChunk(
    task: ChunkUploadTask,
    chunkIndex: number
  ): Observable<void> {
    const chunk = task.chunks[chunkIndex];
    const request: ChunkUploadRequest = {
      fileId: task.fileId,
      chunkIndex,
      totalChunks: task.chunks.length,
      chunkSize: task.config.chunkSize,
      totalSize: task.file.size,
      fileName: task.file.name,
      fileType: task.file.type,
      projectId: task.config.projectId,
      access: task.config.access
    };

    return this.uploadChunk(task.fileId, chunkIndex, chunk, request).pipe(
      tap(response => {
        task.uploadedChunks.add(chunkIndex);
        task.failedChunks.delete(chunkIndex);
        task.uploadedBytes += chunk.size;

        task.progress = this.createProgress(task);
        this.updateProgress(task);
      }),
      catchError(error => {
        const retryCount = task.failedChunks.get(chunkIndex) || 0;
        if (retryCount < task.config.retryAttempts) {
          task.failedChunks.set(chunkIndex, retryCount + 1);
          return this.uploadSingleChunk(task, chunkIndex);
        } else {
            task.progress.chunks.failed++;
            task.progress.error = error.message;
            this.updateProgress(task);
            return throwError(() => error);
        }
      })
    );
  }

  private createProgress(task: ChunkUploadTask): UploadProgress {
    const uploadedSize = task.uploadedChunks.size * task.config.chunkSize;
    const progress = (uploadedSize / task.file.size) * 100;
    const elapsed = (Date.now() - task.startTime) / 1000;
    const speed = elapsed > 0 ? uploadedSize / elapsed : 0;
    const remaining = speed > 0 ? (task.file.size - uploadedSize) / speed : 0;

    return {
      fileId: task.fileId,
      fileName: task.file.name,
      totalSize: task.file.size,
      uploadedSize,
      progress,
      speed,
      remainingTime: remaining,
      status: task.progress.status,
      chunks: {
        total: task.chunks.length,
        uploaded: task.uploadedChunks.size,
        failed: task.failedChunks.size
      }
    };
  }

  private updateProgress(task: ChunkUploadTask): void {
    this.progressSubject.next(task.progress);
    this.updateActiveUploads();
  }

  private updateActiveUploads(): void {
    this.activeUploads.next(new Map(this.uploadTasks));
  }

  private cleanupTask(fileId: string): void {
    this.uploadTasks.delete(fileId);
    this.updateActiveUploads();
  }

  pauseUpload(fileId: string): void {
    const task = this.uploadTasks.get(fileId);
    if (task) {
      task.isPaused = true;
      task.progress.status = FileStatus.PAUSED;
      this.updateProgress(task);
    }
  }

  resumeUpload(fileId: string): Observable<UploadProgress> {
    const task = this.uploadTasks.get(fileId);
    if (!task) {
      return throwError(() => new Error('Upload task not found'));
    }

    task.isPaused = false;
    task.progress.status = FileStatus.UPLOADING;
    this.updateProgress(task);

    return this.uploadChunks(task).pipe(
      switchMap(() => this.completeUpload({ fileId: task.fileId })),
      map(() => task.progress),
      tap(() => this.cleanupTask(task.fileId)),
      catchError(error => {
        task.progress.status = FileStatus.FAILED;
        task.progress.error = error.message;
        this.updateProgress(task);
        this.cleanupTask(task.fileId);
        return throwError(() => error);
      })
    );
  }

  cancelUpload(fileId: string): void {
    const task = this.uploadTasks.get(fileId);
    if (task) {
      task.isCancelled = true;
      this.cleanupTask(fileId);
    }
  }

  getUploadProgress(fileId: string): UploadProgress | undefined {
    const task = this.uploadTasks.get(fileId);
    return task?.progress;
  }

  calculateChecksum(chunk: Blob): Observable<string> {
    return from(
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          const hash = this.simpleHash(arrayBuffer);
          resolve(hash);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(chunk);
      })
    );
  }

  private simpleHash(buffer: ArrayBuffer): string {
    const view = new Uint8Array(buffer);
    let hash = 0;
    for (let i = 0; i < view.length; i++) {
      hash = ((hash << 5) - hash) + view[i];
      hash |= 0;
    }
    return hash.toString(16);
  }

  getFileTypeFromMimeType(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) return FileType.IMAGE;
    if (mimeType === 'application/pdf') return FileType.PDF;
    if (
      mimeType.startsWith('text/') ||
      mimeType.includes('word') ||
      mimeType.includes('excel') ||
      mimeType.includes('spreadsheet') ||
      mimeType.includes('presentation')
    ) {
      return FileType.DOCUMENT;
    }
    if (mimeType.startsWith('audio/')) return FileType.AUDIO;
    if (mimeType.startsWith('video/')) return FileType.VIDEO;
    if (
      mimeType.includes('zip') ||
      mimeType.includes('rar') ||
      mimeType.includes('7z') ||
      mimeType.includes('tar')
    ) {
      return FileType.ARCHIVE;
    }
    return FileType.OTHER;
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  getFileIcon(type: FileType): string {
    switch (type) {
      case FileType.IMAGE:
        return 'image';
      case FileType.PDF:
        return 'picture_as_pdf';
      case FileType.DOCUMENT:
        return 'description';
      case FileType.ARCHIVE:
        return 'folder_zip';
      case FileType.AUDIO:
        return 'audio_file';
      case FileType.VIDEO:
        return 'videocam';
      default:
        return 'insert_drive_file';
    }
  }

  getStatusColor(status: FileStatus): string {
    switch (status) {
      case FileStatus.UPLOADING:
        return '#2196F3';
      case FileStatus.PAUSED:
        return '#FF9800';
      case FileStatus.COMPLETED:
        return '#4CAF50';
      case FileStatus.FAILED:
        return '#F44336';
      case FileStatus.PROCESSING:
        return '#9C27B0';
      case FileStatus.READY:
        return '#4CAF50';
      default:
        return '#9E9E9E';
    }
  }

  getStatusText(status: FileStatus): string {
    switch (status) {
      case FileStatus.UPLOADING:
        return '上传中';
      case FileStatus.PAUSED:
        return '已暂停';
      case FileStatus.COMPLETED:
        return '已完成';
      case FileStatus.FAILED:
        return '失败';
      case FileStatus.PROCESSING:
        return '处理中';
      case FileStatus.READY:
        return '就绪';
      default:
        return '未知';
    }
  }

  convertImage(file: File, quality: number = 0.8, format: string = 'webp'): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('quality', quality.toString());
    formData.append('format', format);
    return this.apiService.post<any>('/images/convert', formData);
  }

  generateThumbnail(fileId: string, width: number = 400, height: number = 400): Observable<FileInfo> {
    return this.apiService.post<FileInfo>(`/images/${fileId}/thumbnail`, null, {
      params: { width, height }
    });
  }

  generatePyramidTiles(fileId: string): Observable<any> {
    return this.apiService.post<any>(`/images/${fileId}/pyramid`);
  }

  compressProjectImages(projectId: number, quality: number = 0.8): Observable<void> {
    return this.apiService.post<void>(`/images/projects/${projectId}/compress`, null, {
      params: { quality }
    });
  }

  getConversionHistory(projectId: number): Observable<any[]> {
    return this.apiService.get<any[]>(`/images/projects/${projectId}/conversion-history`);
  }

  getCompressionInfo(fileId: string): Observable<any> {
    return this.apiService.get<any>(`/images/${fileId}/compression-info`);
  }

  getOptimizedUrl(fileId: string): Observable<string> {
    return this.apiService.get<string>(`/images/${fileId}/optimized-url`);
  }

  getThumbnailUrl(fileId: string, size: number = 400): Observable<string> {
    return this.apiService.get<string>(`/images/${fileId}/thumbnail-url`, {
      params: { size }
    });
  }
}
