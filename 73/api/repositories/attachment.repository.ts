import { getBaseDb, saveBaseDb } from '../db/base-db.js';
import { v4 as uuidv4 } from 'uuid';
import type { Attachment } from '../../shared/types.js';

export async function create(data: { sampleId: string; fileName: string; fileSize: number; filePath: string; fileType: string }): Promise<Attachment> {
  const db = await getBaseDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO attachments (id, sample_id, file_name, file_size, file_path, file_type, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.sampleId, data.fileName, data.fileSize, data.filePath, data.fileType, now]
  );
  saveBaseDb();

  return { id, sampleId: data.sampleId, fileName: data.fileName, fileSize: data.fileSize, filePath: data.filePath, fileType: data.fileType, uploadedAt: now };
}

export async function findBySampleId(sampleId: string): Promise<Attachment[]> {
  const db = await getBaseDb();
  const result = db.exec('SELECT * FROM attachments WHERE sample_id = ? ORDER BY uploaded_at DESC', [sampleId]);
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, sampleId, fileName, fileSize, filePath, fileType, uploadedAt] = row as [string, string, string, number, string, string, string];
    return { id, sampleId, fileName, fileSize, filePath, fileType, uploadedAt };
  });
}

export async function deleteById(id: string): Promise<void> {
  const db = await getBaseDb();
  db.run('DELETE FROM attachments WHERE id = ?', [id]);
  saveBaseDb();
}
