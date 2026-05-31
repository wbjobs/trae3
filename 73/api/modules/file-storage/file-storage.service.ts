import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as attachmentRepo from '../../repositories/attachment.repository.js';
import type { Attachment } from '../../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');

export function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export function getUploadDir(): string {
  return UPLOAD_DIR;
}

export async function saveAttachment(sampleId: string, file: { originalname: string; size: number; path: string; mimetype: string }): Promise<Attachment> {
  ensureUploadDir();
  const ext = path.extname(file.originalname);
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const filePath = path.join(UPLOAD_DIR, fileName);

  if (fs.existsSync(file.path)) {
    fs.copyFileSync(file.path, filePath);
    fs.unlinkSync(file.path);
  }

  return attachmentRepo.create({
    sampleId,
    fileName: file.originalname,
    fileSize: file.size,
    filePath: fileName,
    fileType: file.mimetype,
  });
}

export async function getAttachmentsBySampleId(sampleId: string): Promise<Attachment[]> {
  return attachmentRepo.findBySampleId(sampleId);
}

export async function deleteAttachment(id: string): Promise<void> {
  const attachments = await attachmentRepo.findBySampleId('');
  const attachment = attachments.find(a => a.id === id);
  if (attachment) {
    const fullPath = path.join(UPLOAD_DIR, attachment.filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }
  await attachmentRepo.deleteById(id);
}
