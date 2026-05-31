import { getFlowDb, saveFlowDb } from '../db/flow-db.js';
import { v4 as uuidv4 } from 'uuid';
import type { FlowRecord } from '../../shared/types.js';

export async function create(data: { sampleId: string; step: string; action: FlowRecord['action']; operator: string; comment?: string }): Promise<FlowRecord> {
  const db = await getFlowDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.run(
    'INSERT INTO flow_records (id, sample_id, step, action, operator, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.sampleId, data.step, data.action, data.operator, data.comment || null, now]
  );
  saveFlowDb();

  return { id, sampleId: data.sampleId, step: data.step, action: data.action, operator: data.operator, comment: data.comment, createdAt: now };
}

export async function findBySampleId(sampleId: string): Promise<FlowRecord[]> {
  const db = await getFlowDb();
  const result = db.exec('SELECT * FROM flow_records WHERE sample_id = ? ORDER BY created_at ASC', [sampleId]);
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, sampleId, step, action, operator, comment, createdAt] = row as [string, string, string, string, string, string | null, string];
    return { id, sampleId, step, action: action as FlowRecord['action'], operator, comment: comment || undefined, createdAt };
  });
}

export async function findRecent(limit: number = 10): Promise<FlowRecord[]> {
  const db = await getFlowDb();
  const result = db.exec('SELECT * FROM flow_records ORDER BY created_at DESC LIMIT ?', [limit]);
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, sampleId, step, action, operator, comment, createdAt] = row as [string, string, string, string, string, string | null, string];
    return { id, sampleId, step, action: action as FlowRecord['action'], operator, comment: comment || undefined, createdAt };
  });
}
