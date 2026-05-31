import db, { ensureMonthlyTable } from '../database.js';
import fs from 'fs';
import path from 'path';
import type { SensorData } from '../../shared/types.js';

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function rowToSensorData(row: any): SensorData {
  return {
    id: row.id,
    sensorId: row.sensor_id,
    value: row.value,
    quality: row.quality,
    timestamp: row.timestamp,
  };
}

export function insertSensorData(sensorId: string, value: number, quality: 'good' | 'uncertain' | 'bad' = 'good'): SensorData {
  const yearMonth = getCurrentYearMonth();
  ensureMonthlyTable(yearMonth);

  const tableName = `sensor_data_${yearMonth}`;
  const stmt = db.prepare(
    `INSERT INTO ${tableName} (sensor_id, value, quality) VALUES (?, ?, ?)`
  );
  const result = stmt.run(sensorId, value, quality);
  const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(result.lastInsertRowid) as any;
  return rowToSensorData(row);
}

function getMonthRange(startTime: string, endTime: string): string[] {
  const months: string[] = [];
  const start = new Date(startTime);
  const end = new Date(endTime);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${year}${month}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

function getExistingMonthTables(months: string[]): string[] {
  const existing: string[] = [];
  for (const ym of months) {
    const tableName = `sensor_data_${ym}`;
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    if (row) existing.push(tableName);
  }
  return existing;
}

export function querySensorData(
  sensorIds: string[],
  startTime?: string,
  endTime?: string,
  limit: number = 1000
): SensorData[] {
  const placeholders = sensorIds.map(() => '?').join(',');
  const params: any[] = [...sensorIds];

  if (startTime && endTime) {
    const months = getMonthRange(startTime, endTime);
    const tables = getExistingMonthTables(months);

    if (tables.length === 0) return [];

    const unions = tables.map((table) => {
      return `SELECT * FROM ${table} WHERE sensor_id IN (${placeholders}) AND timestamp >= ? AND timestamp <= ?`;
    }).join(' UNION ALL ');

    const unionParams: any[] = [];
    for (let i = 0; i < tables.length; i++) {
      unionParams.push(...sensorIds, startTime, endTime);
    }

    const sql = `${unions} ORDER BY timestamp DESC LIMIT ?`;
    unionParams.push(limit);

    const rows = db.prepare(sql).all(...unionParams) as any[];
    return rows.map(rowToSensorData);
  }

  let sql = `SELECT * FROM sensor_data WHERE sensor_id IN (${placeholders})`;
  if (startTime) {
    sql += ' AND timestamp >= ?';
    params.push(startTime);
  }
  if (endTime) {
    sql += ' AND timestamp <= ?';
    params.push(endTime);
  }

  sql += ' ORDER BY timestamp DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as any[];
  return rows.map(rowToSensorData);
}

export function getSensorStats(sensorId: string, period: string): {
  sensorId: string;
  period: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  latest: number;
} {
  let timeCondition = '';
  let startTime = '';
  let endTime = '';

  switch (period) {
    case '1h':
      timeCondition = "timestamp >= datetime('now', '-1 hour')";
      startTime = new Date(Date.now() - 3600000).toISOString();
      break;
    case '6h':
      timeCondition = "timestamp >= datetime('now', '-6 hours')";
      startTime = new Date(Date.now() - 21600000).toISOString();
      break;
    case '24h':
      timeCondition = "timestamp >= datetime('now', '-24 hours')";
      startTime = new Date(Date.now() - 86400000).toISOString();
      break;
    case '7d':
      timeCondition = "timestamp >= datetime('now', '-7 days')";
      startTime = new Date(Date.now() - 604800000).toISOString();
      break;
    case '30d':
      timeCondition = "timestamp >= datetime('now', '-30 days')";
      startTime = new Date(Date.now() - 2592000000).toISOString();
      break;
    default:
      timeCondition = "timestamp >= datetime('now', '-24 hours')";
      startTime = new Date(Date.now() - 86400000).toISOString();
  }

  endTime = new Date().toISOString();

  if (startTime && period !== '1h') {
    const months = getMonthRange(startTime, endTime);
    const tables = getExistingMonthTables(months);

    if (tables.length > 0) {
      const unions = tables.map((table) =>
        `SELECT COUNT(*) as count, AVG(value) as avg, MIN(value) as min, MAX(value) as max FROM ${table} WHERE sensor_id = ? AND ${timeCondition}`
      ).join(' UNION ALL ');

      const allParams: any[] = [];
      for (const _ of tables) {
        allParams.push(sensorId);
      }

      const rows = db.prepare(unions).all(...allParams) as any[];

      let totalCount = 0;
      let totalAvg = 0;
      let globalMin = Infinity;
      let globalMax = -Infinity;

      for (const row of rows) {
        totalCount += row.count ?? 0;
        if (row.count > 0) {
          totalAvg += row.avg * row.count;
        }
        if (row.min != null && row.min < globalMin) globalMin = row.min;
        if (row.max != null && row.max > globalMax) globalMax = row.max;
      }

      const avg = totalCount > 0 ? totalAvg / totalCount : 0;

      let latestRow: any = null;
      for (const table of tables) {
        const r = db.prepare(
          `SELECT value FROM ${table} WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1`
        ).get(sensorId) as any;
        if (r && (!latestRow)) latestRow = r;
      }

      return {
        sensorId,
        period,
        count: totalCount,
        avg: Math.round(avg * 100) / 100,
        min: globalMin === Infinity ? 0 : globalMin,
        max: globalMax === -Infinity ? 0 : globalMax,
        latest: latestRow?.value ?? 0,
      };
    }
  }

  const row = db.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(value) as avg,
      MIN(value) as min,
      MAX(value) as max
    FROM sensor_data
    WHERE sensor_id = ? AND ${timeCondition}
  `).get(sensorId) as any;

  const latestRow = db.prepare(
    'SELECT value FROM sensor_data WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1'
  ).get(sensorId) as any;

  return {
    sensorId,
    period,
    count: row?.count ?? 0,
    avg: row?.avg ?? 0,
    min: row?.min ?? 0,
    max: row?.max ?? 0,
    latest: latestRow?.value ?? 0,
  };
}

export function archiveMonth(yearMonth: string): string {
  const tableName = `sensor_data_${yearMonth}`;
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  if (!tableCheck) {
    throw new Error(`Table ${tableName} does not exist`);
  }

  const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY timestamp ASC`).all() as any[];
  const archiveData = rows.map(rowToSensorData);

  const archiveDir = path.join(process.cwd(), 'data', 'archive');
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const filePath = path.join(archiveDir, `sensor_data_${yearMonth}.json`);
  fs.writeFileSync(filePath, JSON.stringify(archiveData, null, 2), 'utf-8');

  return filePath;
}

export function cleanupOldData(retentionDays: number): number {
  const cutoffDate = new Date(Date.now() - retentionDays * 86400000);
  const now = new Date();
  const months: string[] = [];

  const current = new Date(cutoffDate.getFullYear(), cutoffDate.getMonth(), 1);
  while (current < now) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${year}${month}`);
    current.setMonth(current.getMonth() + 1);
  }

  let totalDropped = 0;
  for (const ym of months) {
    if (ym === getCurrentYearMonth()) continue;
    const tableName = `sensor_data_${ym}`;
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    if (tableCheck) {
      const count = (db.prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`).get() as any).cnt;
      db.exec(`DROP TABLE IF EXISTS ${tableName}`);
      totalDropped += count;
    }
  }

  const result = db.prepare(
    "DELETE FROM sensor_data WHERE timestamp < datetime('now', ? || ' days')"
  ).run(-retentionDays);
  totalDropped += result.changes;

  return totalDropped;
}
