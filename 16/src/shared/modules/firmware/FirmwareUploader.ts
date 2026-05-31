import * as fs from 'fs';
import * as path from 'path';
import { createModuleLogger } from '../logger';
import { delay, retryAsync } from '../../utils';

const logger = createModuleLogger('FirmwareUploader');

export interface ChunkUploadOptions {
  chunkSize?: number;           // 分片大小，默认 5MB
  concurrency?: number;         // 并发数，默认 3
  maxRetries?: number;          // 最大重试次数，默认 3
  retryDelay?: number;          // 重试延迟，默认 1000ms
  onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void;
  onChunkComplete?: (chunkIndex: number, uploadedBytes: number) => void;
}

export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  uploaded: boolean;
  retryCount: number;
}

export interface UploadSession {
  fileId: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  chunks: ChunkInfo[];
  uploadedBytes: number;
  uploadUrl: string;
  headers?: Record<string, string>;
}

export class FirmwareUploader {
  private defaultChunkSize = 5 * 1024 * 1024;  // 5MB
  private defaultConcurrency = 3;
  private defaultMaxRetries = 3;

  async createSession(
    filePath: string,
    uploadUrl: string,
    options: ChunkUploadOptions = {}
  ): Promise<UploadSession> {
    const stats = fs.statSync(filePath);
    const chunkSize = options.chunkSize || this.defaultChunkSize;
    const totalChunks = Math.ceil(stats.size / chunkSize);
    
    const chunks: ChunkInfo[] = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push({
        index: i,
        start: i * chunkSize,
        end: Math.min((i + 1) * chunkSize, stats.size),
        size: Math.min(chunkSize, stats.size - i * chunkSize),
        uploaded: false,
        retryCount: 0
      });
    }

    const session: UploadSession = {
      fileId: this.generateFileId(filePath, stats.size),
      filePath,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      chunkSize,
      totalChunks,
      chunks,
      uploadedBytes: 0,
      uploadUrl,
      headers: {}
    };

    logger.info('create_session', `创建上传会话`, {
      fileId: session.fileId,
      fileSize: stats.size,
      totalChunks
    });

    return session;
  }

  async upload(session: UploadSession, options: ChunkUploadOptions = {}): Promise<boolean> {
    const concurrency = options.concurrency || this.defaultConcurrency;
    const maxRetries = options.maxRetries || this.defaultMaxRetries;
    const retryDelay = options.retryDelay || 1000;

    const pendingChunks = [...session.chunks.filter(c => !c.uploaded)];
    let activeCount = 0;
    let chunkIndex = 0;
    let failed = false;

    const uploadChunk = async (chunk: ChunkInfo): Promise<void> => {
      try {
        await retryAsync(
          async () => {
            await this.uploadSingleChunk(session, chunk);
          },
          maxRetries,
          retryDelay,
          (attempt) => {
            chunk.retryCount = attempt;
            logger.warn('chunk_retry', `分片 ${chunk.index} 重试 ${attempt}`, {
              fileId: session.fileId,
              chunkIndex: chunk.index
            });
          }
        );

        chunk.uploaded = true;
        session.uploadedBytes += chunk.size;

        if (options.onProgress) {
          const progress = Math.round((session.uploadedBytes / session.fileSize) * 100);
          options.onProgress(progress, session.uploadedBytes, session.fileSize);
        }

        if (options.onChunkComplete) {
          options.onChunkComplete(chunk.index, session.uploadedBytes);
        }

        logger.debug('chunk_complete', `分片 ${chunk.index} 上传完成`, {
          fileId: session.fileId,
          chunkIndex: chunk.index
        });
      } catch (error) {
        failed = true;
        logger.error('chunk_failed', `分片 ${chunk.index} 上传失败`, {
          fileId: session.fileId,
          chunkIndex: chunk.index,
          error: (error as Error).message
        });
        throw error;
      }
    };

    const worker = async (): Promise<void> => {
      while (chunkIndex < pendingChunks.length && !failed) {
        const chunk = pendingChunks[chunkIndex++];
        await uploadChunk(chunk);
      }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, pendingChunks.length); i++) {
      workers.push(worker());
    }

    try {
      await Promise.all(workers);
      logger.info('upload_complete', '所有分片上传完成', { fileId: session.fileId });
      return await this.finalizeUpload(session);
    } catch (error) {
      logger.error('upload_failed', '上传失败', {
        fileId: session.fileId,
        error: (error as Error).message
      });
      return false;
    }
  }

  private async uploadSingleChunk(session: UploadSession, chunk: ChunkInfo): Promise<void> {
    const buffer = this.readChunkSync(session.filePath, chunk.start, chunk.size);
    
    const formData = new FormData();
    formData.append('fileId', session.fileId);
    formData.append('chunkIndex', String(chunk.index));
    formData.append('totalChunks', String(session.totalChunks));
    formData.append('fileName', session.fileName);
    
    const blob = new Blob([buffer.buffer as ArrayBuffer], { type: 'application/octet-stream' });
    formData.append('chunk', blob, `chunk-${chunk.index}`);

    const response = await fetch(session.uploadUrl, {
      method: 'POST',
      body: formData,
      headers: session.headers as Record<string, string>
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  private readChunkSync(filePath: string, start: number, size: number): Buffer {
    const buffer = Buffer.alloc(size);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, size, start);
      return buffer;
    } finally {
      fs.closeSync(fd);
    }
  }

  private async finalizeUpload(session: UploadSession): Promise<boolean> {
    const finalizeUrl = session.uploadUrl.replace('/chunk', '/finalize');
    
    const response = await fetch(finalizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...session.headers },
      body: JSON.stringify({
        fileId: session.fileId,
        fileName: session.fileName,
        totalChunks: session.totalChunks
      })
    });

    return response.ok;
  }

  private generateFileId(filePath: string, fileSize: number): string {
    const mtime = fs.statSync(filePath).mtime.getTime();
    return `${path.basename(filePath)}-${fileSize}-${mtime}`.replace(/[^a-zA-Z0-9-]/g, '-');
  }

  async resumeUpload(
    session: UploadSession,
    options: ChunkUploadOptions = {}
  ): Promise<boolean> {
    logger.info('resume_upload', '恢复上传', {
      fileId: session.fileId,
      uploadedChunks: session.chunks.filter(c => c.uploaded).length,
      totalChunks: session.totalChunks
    });
    return this.upload(session, options);
  }

  saveSession(session: UploadSession, savePath: string): void {
    fs.writeFileSync(savePath, JSON.stringify(session, null, 2));
  }

  loadSession(savePath: string): UploadSession {
    const data = fs.readFileSync(savePath, 'utf-8');
    return JSON.parse(data);
  }
}

export const createFirmwareUploader = (): FirmwareUploader => {
  return new FirmwareUploader();
};

export default FirmwareUploader;
