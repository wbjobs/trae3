import { getBaseDb, saveBaseDb } from '../../db/base-db.js';
import { getFlowDb, saveFlowDb } from '../../db/flow-db.js';
import type { FlowRecord } from '../../../shared/types.js';

const STEP_MAP: Record<string, string> = {
  submit: '已登记',
  approve: '已通过',
  reject: '已退回',
  resubmit: '重新提交',
};

export async function submitSample(sampleId: string, operator: string, comment?: string): Promise<FlowRecord> {
  const flowDb = await getFlowDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const step = STEP_MAP['submit'];
  const action: FlowRecord['action'] = 'submit';

  flowDb.run(
    'INSERT INTO flow_records (id, sample_id, step, action, operator, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, sampleId, step, action, operator, comment || null, now]
  );
  saveFlowDb();

  return { id, sampleId, step, action, operator, comment, createdAt: now };
}

export async function approveSample(sampleId: string, operator: string, comment?: string): Promise<void> {
  const baseDb = await getBaseDb();
  const flowDb = await getFlowDb();
  const now = new Date().toISOString();
  const step = STEP_MAP['approve'];
  const action: FlowRecord['action'] = 'approve';
  const flowId = crypto.randomUUID();

  baseDb.run('UPDATE samples SET status = ?, updated_at = ? WHERE id = ?', ['approved', now, sampleId]);
  flowDb.run(
    'INSERT INTO flow_records (id, sample_id, step, action, operator, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [flowId, sampleId, step, action, operator, comment || null, now]
  );

  saveBaseDb();
  saveFlowDb();
}

export async function rejectSample(sampleId: string, operator: string, comment: string): Promise<void> {
  const baseDb = await getBaseDb();
  const flowDb = await getFlowDb();
  const now = new Date().toISOString();
  const step = STEP_MAP['reject'];
  const action: FlowRecord['action'] = 'reject';
  const flowId = crypto.randomUUID();

  baseDb.run('UPDATE samples SET status = ?, updated_at = ? WHERE id = ?', ['rejected', now, sampleId]);
  flowDb.run(
    'INSERT INTO flow_records (id, sample_id, step, action, operator, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [flowId, sampleId, step, action, operator, comment, now]
  );

  saveBaseDb();
  saveFlowDb();
}

export async function resubmitSample(sampleId: string, operator: string, comment?: string): Promise<void> {
  const baseDb = await getBaseDb();
  const flowDb = await getFlowDb();
  const now = new Date().toISOString();
  const step = STEP_MAP['resubmit'];
  const action: FlowRecord['action'] = 'resubmit';
  const flowId = crypto.randomUUID();

  baseDb.run('UPDATE samples SET status = ?, updated_at = ? WHERE id = ?', ['pending', now, sampleId]);
  flowDb.run(
    'INSERT INTO flow_records (id, sample_id, step, action, operator, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [flowId, sampleId, step, action, operator, comment || null, now]
  );

  saveBaseDb();
  saveFlowDb();
}

export async function getFlowRecords(sampleId: string): Promise<FlowRecord[]> {
  const flowDb = await getFlowDb();
  const result = flowDb.exec('SELECT * FROM flow_records WHERE sample_id = ? ORDER BY created_at ASC', [sampleId]);
  if (!result[0]?.values) return [];
  return result[0].values.map((row) => {
    const [id, sid, step, action, operator, comment, createdAt] = row as [string, string, string, string, string, string | null, string];
    return { id, sampleId: sid, step, action: action as FlowRecord['action'], operator, comment: comment || undefined, createdAt };
  });
}
