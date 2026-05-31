import { getAttachmentDb, getMetadataDb, generateUUID } from '../db/index.js';
import { FileInfo, UploadSession, UploadStatus } from '../../shared/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STORAGE_DIR = path.join(__dirname, '../../storage/attachments');
const THUMBNAIL_DIR = path.join(__dirname, '../../storage/thumbnails');
const TEMP_DIR = path.join(__dirname, '../../storage/temp');

const CHUNK_SIZE = 5 * 1024 * 1024;

const getFileRelativePath = (fileId: string, ext: string): string => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const hash1 = fileId.substring(0, 2);
  const hash2 = fileId.substring(fileId.length - 2);
  return `${year}/${month}/${hash1}/${hash2}/${fileId}${ext}`;
};

const getThumbnailRelativePath = (fileId: string, type: string): string => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const hash1 = fileId.substring(0, 2);
  const hash2 = fileId.substring(fileId.length - 2);
  return `${year}/${month}/${hash1}/${hash2}/${fileId}_${type}.jpg`;
};

const ensureDirForFile = (fullPath: string): void => {
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

export class StorageModule {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [STORAGE_DIR, THUMBNAIL_DIR, TEMP_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  createUploadSession(
    fileName: string,
    totalSize: number,
    checksum?: string
  ): UploadSession {
    const db = getMetadataDb();

    const sessionId = generateUUID();
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO upload_sessions (
        id, file_name, total_size, total_chunks, uploaded_chunks, checksum, status, expires_at
      ) VALUES (?, ?, ?, ?, 0, ?, 'active', ?)
    `);

    stmt.run(sessionId, fileName, totalSize, totalChunks, checksum || null, expiresAt);

    return {
      id: sessionId,
      fileName,
      totalSize,
      totalChunks,
      uploadedChunks: 0,
      checksum,
      status: 'uploading',
      createdAt: new Date().toISOString(),
      expiresAt,
    };
  }

  uploadChunk(
    sessionId: string,
    chunkIndex: number,
    chunkData: Buffer
  ): { success: boolean; uploadedChunks: number; totalChunks: number } {
    const metadataDb = getMetadataDb();
    const attachmentDb = getAttachmentDb();

    const session = metadataDb.prepare(`
      SELECT * FROM upload_sessions WHERE id = ? AND status = 'active'
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!session) {
      return { success: false, uploadedChunks: 0, totalChunks: 0 };
    }

    const chunkSize = chunkData.length;

    const checksum = this.calculateChecksum(chunkData);

    attachmentDb.prepare(`
      INSERT OR REPLACE INTO attachment_chunks (
        session_id, chunk_index, chunk_data, chunk_size, checksum, created_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(sessionId, chunkIndex, chunkData, chunkSize, checksum);

    const uploadedCount = attachmentDb.prepare(`
      SELECT COUNT(*) as cnt FROM attachment_chunks WHERE session_id = ?
    `).get(sessionId) as { cnt: number };

    metadataDb.prepare(`
      UPDATE upload_sessions SET uploaded_chunks = ? WHERE id = ?
    `).run(uploadedCount.cnt, sessionId);

    return {
      success: true,
      uploadedChunks: uploadedCount.cnt,
      totalChunks: session.total_chunks as number,
    };
  }

  async completeUpload(
    sessionId: string,
    rubbingId?: string
  ): Promise<{ fileInfo: FileInfo; rubbingId: string } | null> {
    const metadataDb = getMetadataDb();
    const attachmentDb = getAttachmentDb();

    const session = metadataDb.prepare(`
      SELECT * FROM upload_sessions WHERE id = ? AND status = 'active'
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!session) {
      return null;
    }

    const chunks = attachmentDb.prepare(`
      SELECT chunk_data, chunk_index FROM attachment_chunks 
      WHERE session_id = ? ORDER BY chunk_index ASC
    `).all(sessionId) as Array<{ chunk_data: Buffer; chunk_index: number }>;

    if (chunks.length !== session.total_chunks) {
      return null;
    }

    const fileBuffer = Buffer.concat(chunks.map(c => c.chunk_data));

    const fileId = generateUUID();
    const ext = path.extname(session.file_name as string).toLowerCase();
    const relativePath = getFileRelativePath(fileId, ext);
    const storagePath = path.join(STORAGE_DIR, relativePath);

    ensureDirForFile(storagePath);
    fs.writeFileSync(storagePath, fileBuffer);

    const fileChecksum = this.calculateChecksum(fileBuffer);

    let width: number | undefined;
    let height: number | undefined;
    let dpi: number | undefined;
    let colorSpace: string | undefined;
    let mimeType = 'application/octet-stream';

    try {
      const metadata = await sharp(fileBuffer).metadata();
      width = metadata.width;
      height = metadata.height;
      dpi = metadata.density ? Math.round(metadata.density) : undefined;
      colorSpace = metadata.space;

      if (metadata.format === 'tiff') mimeType = 'image/tiff';
      else if (metadata.format === 'jpeg') mimeType = 'image/jpeg';
      else if (metadata.format === 'png') mimeType = 'image/png';
    } catch (e) {
    }

    const thumbRelativePath = getThumbnailRelativePath(fileId, 'thumb');
    const thumbnailPath = path.join(THUMBNAIL_DIR, thumbRelativePath);
    try {
      ensureDirForFile(thumbnailPath);
      await sharp(fileBuffer)
        .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);
    } catch (e) {
    }

    const previewRelativePath = getThumbnailRelativePath(fileId, 'preview');
    const previewPath = path.join(THUMBNAIL_DIR, previewRelativePath);
    try {
      ensureDirForFile(previewPath);
      await sharp(fileBuffer)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(previewPath);
    } catch (e) {
    }

    const fileName = relativePath.split('/').pop()!;
    const fileInfo: FileInfo = {
      id: fileId,
      rubbingId: rubbingId,
      originalName: session.file_name as string,
      fileName,
      filename: fileName,
      fileSize: session.total_size as number,
      size: session.total_size as number,
      mimeType,
      width,
      height,
      dpi,
      colorSpace,
      checksum: fileChecksum,
      md5Hash: fileChecksum,
      storagePath: `/attachments/${relativePath}`,
      storageBucket: 'rubbings',
      isPrimary: true,
      createdAt: new Date().toISOString(),
    };

    let effectiveRubbingId = rubbingId || null;

    const transaction = metadataDb.transaction(() => {
      if (!effectiveRubbingId) {
        const newRubbingId = generateUUID();
        const baseName = (session.file_name as string).replace(/\.[^/.]+$/, '');
        metadataDb.prepare(`
          INSERT INTO rubbings (
            id, accession_no, title, keywords, status, created_by
          ) VALUES (?, ?, ?, '[]', 'draft', ?)
        `).run(
          newRubbingId,
          `TMP-${Date.now()}`,
          baseName,
          (session as Record<string, unknown>).user_id || null
        );
        effectiveRubbingId = newRubbingId;
        fileInfo.rubbingId = newRubbingId;
      }

      metadataDb.prepare(`
        INSERT INTO files (
          id, rubbing_id, original_name, file_name, file_size, mime_type,
          width, height, dpi, color_space, checksum, storage_path, storage_bucket, is_primary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        fileId,
        effectiveRubbingId,
        fileInfo.originalName,
        fileInfo.fileName,
        fileInfo.fileSize,
        fileInfo.mimeType,
        fileInfo.width || null,
        fileInfo.height || null,
        fileInfo.dpi || null,
        fileInfo.colorSpace || null,
        fileInfo.checksum,
        fileInfo.storagePath,
        fileInfo.storageBucket,
        fileInfo.isPrimary ? 1 : 0
      );

      metadataDb.prepare(`
        UPDATE upload_sessions SET status = 'completed', file_id = ? WHERE id = ?
      `).run(fileId, sessionId);
    });

    try {
      transaction();

      attachmentDb.prepare(`
        INSERT INTO attachment_metadata (
          id, file_id, thumbnail_path, preview_path, format_info, exif_data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        generateUUID(),
        fileId,
        `/thumbnails/${thumbRelativePath}`,
        `/thumbnails/${previewRelativePath}`,
        JSON.stringify({ width, height, dpi, colorSpace, ext }),
        '{}'
      );

      attachmentDb.prepare(`
        DELETE FROM attachment_chunks WHERE session_id = ?
      `).run(sessionId);

      return { fileInfo, rubbingId: effectiveRubbingId! };
    } catch (e) {
      console.error('Complete upload failed:', e);
      return null;
    }
  }

  getFileInfo(fileId: string): FileInfo | null {
    const db = getMetadataDb();

    const file = db.prepare(`
      SELECT * FROM files WHERE id = ?
    `).get(fileId) as Record<string, unknown> | undefined;

    if (!file) return null;

    return {
      id: file.id as string,
      rubbingId: file.rubbing_id as string | undefined,
      originalName: file.original_name as string,
      fileName: file.file_name as string,
      filename: file.file_name as string,
      fileSize: file.file_size as number,
      size: file.file_size as number,
      mimeType: file.mime_type as string,
      width: file.width as number | undefined,
      height: file.height as number | undefined,
      dpi: file.dpi as number | undefined,
      colorSpace: file.color_space as string | undefined,
      checksum: file.checksum as string,
      md5Hash: file.checksum as string,
      storagePath: file.storage_path as string,
      storageBucket: file.storage_bucket as string,
      isPrimary: file.is_primary === 1,
      createdAt: file.created_at as string,
    };
  }

  getFileByRubbingId(rubbingId: string): FileInfo | null {
    const db = getMetadataDb();

    const file = db.prepare(`
      SELECT * FROM files WHERE rubbing_id = ? AND is_primary = 1
    `).get(rubbingId) as Record<string, unknown> | undefined;

    if (!file) return null;

    return {
      id: file.id as string,
      rubbingId: file.rubbing_id as string | undefined,
      originalName: file.original_name as string,
      fileName: file.file_name as string,
      filename: file.file_name as string,
      fileSize: file.file_size as number,
      size: file.file_size as number,
      mimeType: file.mime_type as string,
      width: file.width as number | undefined,
      height: file.height as number | undefined,
      dpi: file.dpi as number | undefined,
      colorSpace: file.color_space as string | undefined,
      checksum: file.checksum as string,
      md5Hash: file.checksum as string,
      storagePath: file.storage_path as string,
      storageBucket: file.storage_bucket as string,
      isPrimary: file.is_primary === 1,
      createdAt: file.created_at as string,
    };
  }

  getFilePath(fileId: string): string | null {
    const fileInfo = this.getFileInfo(fileId);
    if (!fileInfo) return null;

    if (fileInfo.storagePath.startsWith('/attachments/')) {
      const relativePath = fileInfo.storagePath.replace('/attachments/', '');
      const filePath = path.join(STORAGE_DIR, relativePath);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
    }

    const legacyPath = path.join(STORAGE_DIR, fileInfo.fileName);
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }

    return null;
  }

  getThumbnailPath(fileId: string, type: 'thumb' | 'preview' = 'thumb'): string | null {
    const attachmentDb = getAttachmentDb();
    
    const meta = attachmentDb.prepare(`
      SELECT thumbnail_path, preview_path FROM attachment_metadata WHERE file_id = ?
    `).get(fileId) as { thumbnail_path?: string; preview_path?: string } | undefined;

    if (meta) {
      const urlPath = type === 'thumb' ? meta.thumbnail_path : meta.preview_path;
      if (urlPath && urlPath.startsWith('/thumbnails/')) {
        const relativePath = urlPath.replace('/thumbnails/', '');
        const fullPath = path.join(THUMBNAIL_DIR, relativePath);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }

    const suffix = type === 'thumb' ? '_thumb.jpg' : '_preview.jpg';
    const legacyPath = path.join(THUMBNAIL_DIR, `${fileId}${suffix}`);
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }

    return null;
  }

  getUploadProgress(sessionId: string): {
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    status: UploadStatus;
  } {
    const metadataDb = getMetadataDb();
    const attachmentDb = getAttachmentDb();

    const session = metadataDb.prepare(`
      SELECT * FROM upload_sessions WHERE id = ?
    `).get(sessionId) as Record<string, unknown> | undefined;

    if (!session) {
      return { progress: 0, uploadedChunks: 0, totalChunks: 0, status: 'failed' };
    }

    const uploadedCount = attachmentDb.prepare(`
      SELECT COUNT(*) as cnt FROM attachment_chunks WHERE session_id = ?
    `).get(sessionId) as { cnt: number };

    const totalChunks = session.total_chunks as number;
    const uploadedChunks = uploadedCount.cnt;
    const progress = totalChunks > 0 ? Math.round((uploadedChunks / totalChunks) * 100) : 0;
    const status = session.status as UploadStatus;

    return { progress, uploadedChunks, totalChunks, status };
  }

  deleteFile(fileId: string): boolean {
    const metadataDb = getMetadataDb();

    const fileInfo = this.getFileInfo(fileId);
    if (!fileInfo) return false;

    const transaction = metadataDb.transaction(() => {
      metadataDb.prepare('DELETE FROM files WHERE id = ?').run(fileId);
    });

    try {
      transaction();

      const filePath = path.join(STORAGE_DIR, fileInfo.fileName);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      const thumbPath = path.join(THUMBNAIL_DIR, `${fileId}_thumb.jpg`);
      if (fs.existsSync(thumbPath)) {
        fs.unlinkSync(thumbPath);
      }

      const previewPath = path.join(THUMBNAIL_DIR, `${fileId}_preview.jpg`);
      if (fs.existsSync(previewPath)) {
        fs.unlinkSync(previewPath);
      }

      return true;
    } catch (e) {
      console.error('Delete file failed:', e);
      return false;
    }
  }

  private calculateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  getChunkSize(): number {
    return CHUNK_SIZE;
  }
}

export const storageModule = new StorageModule();
