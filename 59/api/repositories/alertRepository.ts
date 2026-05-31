import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database/schema.js';

export interface AlertRow {
  id: string;
  device_id: string;
  level: 'critical' | 'major' | 'minor';
  message: string;
  param_key: string;
  param_value: number;
  threshold: number;
  status: 'active' | 'confirmed' | 'resolved';
  created_at: string;
  confirmed_at: string | null;
  confirmed_by: string | null;
  remark: string | null;
}

export interface AlertFilters {
  level?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedAlerts {
  data: AlertRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ActiveAlertCount {
  critical: number;
  major: number;
  minor: number;
}

export interface CreateAlertInput {
  device_id: string;
  level: 'critical' | 'major' | 'minor';
  message: string;
  param_key: string;
  param_value: number;
  threshold: number;
}

export function getAll(filters?: AlertFilters): PaginatedAlerts {
  const db = getDb();
  const page = filters?.page ?? 1;
  const limit = filters?.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.level) {
    conditions.push('level = ?');
    params.push(filters.level);
  }
  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const total = (db.prepare(`SELECT COUNT(*) AS cnt FROM alerts ${where}`).get(...params) as { cnt: number }).cnt;
  const data = db.prepare(`SELECT * FROM alerts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as AlertRow[];

  return { data, total, page, limit };
}

export function getById(id: string): AlertRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow | undefined;
}

export function getByDeviceId(deviceId: string): AlertRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts WHERE device_id = ? ORDER BY created_at DESC').all(deviceId) as AlertRow[];
}

export function getActiveCount(): ActiveAlertCount {
  const db = getDb();
  const rows = db.prepare(
    "SELECT level, COUNT(*) AS cnt FROM alerts WHERE status = 'active' GROUP BY level"
  ).all() as { level: string; cnt: number }[];

  const result: ActiveAlertCount = { critical: 0, major: 0, minor: 0 };
  for (const row of rows) {
    if (row.level === 'critical' || row.level === 'major' || row.level === 'minor') {
      result[row.level] = row.cnt;
    }
  }
  return result;
}

export function create(alert: CreateAlertInput): AlertRow {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO alerts (id, device_id, level, message, param_key, param_value, threshold, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(id, alert.device_id, alert.level, alert.message, alert.param_key, alert.param_value, alert.threshold);

  return getById(id)!;
}

export function confirm(id: string, confirmedBy: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE alerts SET status = 'confirmed', confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?"
  ).run(confirmedBy, id);
}

export function resolve(id: string, remark: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE alerts SET status = 'resolved', remark = ? WHERE id = ?"
  ).run(remark, id);
}

export function getRecentAlerts(limit: number): AlertRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM alerts ORDER BY created_at DESC LIMIT ?').all(limit) as AlertRow[];
}

export function deleteOldAlerts(maxDays: number): number {
  const db = getDb();
  const result = db.prepare(
    `DELETE FROM alerts WHERE status = 'resolved' AND created_at < datetime('now', ?)`
  ).run(`-${maxDays} days`);
  return result.changes ?? 0;
}

export function getAlertsCount(): { total: number; resolved: number; active: number } {
  const db = getDb();
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM alerts').get() as { cnt: number }).cnt;
  const resolved = (db.prepare("SELECT COUNT(*) as cnt FROM alerts WHERE status = 'resolved'").get() as { cnt: number }).cnt;
  const active = (db.prepare("SELECT COUNT(*) as cnt FROM alerts WHERE status IN ('active', 'confirmed')").get() as { cnt: number }).cnt;
  return { total, resolved, active };
}
