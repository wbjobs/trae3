import db from '../database.js';
import { broadcastAll } from './subscription.js';
import type { MetadataSnapshot, Sensor } from '../../shared/types.js';

function rowToSensor(row: any): Sensor {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    protocol: row.protocol,
    frequency: row.frequency,
    unit: row.unit,
    rangeMin: row.range_min,
    rangeMax: row.range_max,
    status: row.status,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const MAX_VERSIONS = 50;
const DEBOUNCE_MS = 200;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingVersion: number | null = null;

function computeSnapshot(): string {
  const sensorRows = db.prepare('SELECT * FROM sensors').all() as any[];
  return JSON.stringify(sensorRows.map(rowToSensor));
}

function getLatestSnapshot(): string | null {
  const row = db.prepare(
    'SELECT snapshot FROM metadata_versions ORDER BY version DESC LIMIT 1'
  ).get() as any;
  return row?.snapshot ?? null;
}

export function getMetadataSnapshot(): MetadataSnapshot {
  const versionRow = db.prepare(
    'SELECT version FROM metadata_versions ORDER BY version DESC LIMIT 1'
  ).get() as any;

  const sensorRows = db.prepare('SELECT * FROM sensors').all() as any[];
  const sensors = sensorRows.map(rowToSensor);

  return {
    version: versionRow?.version ?? 0,
    sensors,
    timestamp: new Date().toISOString(),
  };
}

export function getMetadataVersion(): number {
  const row = db.prepare(
    'SELECT version FROM metadata_versions ORDER BY version DESC LIMIT 1'
  ).get() as any;
  return row?.version ?? 0;
}

export function triggerSync(): number {
  const newSnapshot = computeSnapshot();
  const latestSnapshot = getLatestSnapshot();

  if (latestSnapshot !== null && newSnapshot === latestSnapshot) {
    const row = db.prepare(
      'SELECT version FROM metadata_versions ORDER BY version DESC LIMIT 1'
    ).get() as any;
    return row?.version ?? 0;
  }

  const result = db.prepare(
    'INSERT INTO metadata_versions (snapshot) VALUES (?)'
  ).run(newSnapshot);

  cleanupOldVersions();

  return result.lastInsertRowid as number;
}

function cleanupOldVersions(): void {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM metadata_versions').get() as any;
  if (count.cnt > MAX_VERSIONS) {
    const cutoff = db.prepare(
      'SELECT version FROM metadata_versions ORDER BY version DESC LIMIT 1 OFFSET ?'
    ).get(MAX_VERSIONS - 1) as any;
    if (cutoff) {
      db.prepare('DELETE FROM metadata_versions WHERE version < ?').run(cutoff.version);
    }
  }
}

export function bumpMetadataVersion(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const version = triggerSync();
    if (version !== pendingVersion) {
      pendingVersion = version;
      broadcastAll({ type: 'metadata_updated', version });
    }
  }, DEBOUNCE_MS);
}

export function flushMetadataVersion(): number {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  const version = triggerSync();
  pendingVersion = version;
  broadcastAll({ type: 'metadata_updated', version });
  return version;
}

export function getMetadataVersions(limit: number = 20, offset: number = 0): {
  version: number;
  createdAt: string;
  sensorCount: number;
}[] {
  const rows = db.prepare(
    'SELECT version, snapshot, created_at FROM metadata_versions ORDER BY version DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as any[];

  return rows.map((row) => ({
    version: row.version,
    createdAt: row.created_at,
    sensorCount: JSON.parse(row.snapshot).length,
  }));
}

export function getMetadataVersionDetail(version: number): MetadataSnapshot | null {
  const row = db.prepare(
    'SELECT version, snapshot, created_at FROM metadata_versions WHERE version = ?'
  ).get(version) as any;
  if (!row) return null;

  const sensors = JSON.parse(row.snapshot) as Sensor[];
  return {
    version: row.version,
    sensors,
    timestamp: row.created_at,
  };
}

export function diffMetadataVersions(v1: number, v2: number): {
  added: Sensor[];
  removed: Sensor[];
  modified: { id: string; field: string; oldValue: any; newValue: any }[];
} {
  const row1 = db.prepare(
    'SELECT snapshot FROM metadata_versions WHERE version = ?'
  ).get(v1) as any;
  const row2 = db.prepare(
    'SELECT snapshot FROM metadata_versions WHERE version = ?'
  ).get(v2) as any;

  const sensors1: Sensor[] = row1 ? JSON.parse(row1.snapshot) : [];
  const sensors2: Sensor[] = row2 ? JSON.parse(row2.snapshot) : [];

  const map1 = new Map(sensors1.map((s) => [s.id, s]));
  const map2 = new Map(sensors2.map((s) => [s.id, s]));

  const added: Sensor[] = [];
  const removed: Sensor[] = [];
  const modified: { id: string; field: string; oldValue: any; newValue: any }[] = [];

  for (const [id, sensor] of map2) {
    if (!map1.has(id)) {
      added.push(sensor);
    }
  }

  for (const [id, sensor] of map1) {
    if (!map2.has(id)) {
      removed.push(sensor);
    }
  }

  for (const [id, sensor2] of map2) {
    const sensor1 = map1.get(id);
    if (!sensor1) continue;

    const fields: (keyof Sensor)[] = ['name', 'type', 'protocol', 'frequency', 'unit', 'rangeMin', 'rangeMax', 'status', 'tags'];
    for (const field of fields) {
      const oldVal = sensor1[field];
      const newVal = sensor2[field];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        modified.push({ id, field, oldValue: oldVal, newValue: newVal });
      }
    }
  }

  return { added, removed, modified };
}

export function rollbackToVersion(version: number): MetadataSnapshot | null {
  const detail = getMetadataVersionDetail(version);
  if (!detail) return null;

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sensors').run();
    const insertStmt = db.prepare(`
      INSERT INTO sensors (id, name, type, protocol, frequency, unit, range_min, range_max, status, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const sensor of detail.sensors) {
      insertStmt.run(
        sensor.id, sensor.name, sensor.type, sensor.protocol, sensor.frequency,
        sensor.unit, sensor.rangeMin, sensor.rangeMax, sensor.status,
        JSON.stringify(sensor.tags)
      );
    }
  });
  tx();

  bumpMetadataVersion();

  return getMetadataSnapshot();
}
