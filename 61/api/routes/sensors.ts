import { Router, type Request, type Response } from 'express';
import db from '../database.js';
import { bumpMetadataVersion, flushMetadataVersion } from '../services/metadata.js';
import { reload as reloadMockSensors } from '../services/mock-sensor.js';
import { broadcastAll, broadcastToSubscribers } from '../services/subscription.js';
import { requirePermission } from '../middleware/permission.js';
import type { Sensor } from '../../shared/types.js';

const router = Router();

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

router.get('/', (req: Request, res: Response): void => {
  const { search, type, status } = req.query;
  let sql = 'SELECT * FROM sensors WHERE 1=1';
  const params: any[] = [];

  if (search) {
    sql += ' AND (name LIKE ? OR id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';
  const rows = db.prepare(sql).all(...params) as any[];
  res.json({ success: true, data: rows.map(rowToSensor) });
});

router.get('/:id', (req: Request, res: Response): void => {
  const row = db.prepare('SELECT * FROM sensors WHERE id = ?').get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ success: false, error: 'Sensor not found' });
    return;
  }
  res.json({ success: true, data: rowToSensor(row) });
});

router.post('/', requirePermission('sensor:write'), (req: Request, res: Response): void => {
  const { id, name, type, protocol, frequency, unit, rangeMin, rangeMax, status, tags } = req.body;
  if (!id || !name || !type) {
    res.status(400).json({ success: false, error: 'id, name, type are required' });
    return;
  }

  try {
    const insertTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO sensors (id, name, type, protocol, frequency, unit, range_min, range_max, status, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, name, type, protocol || 'MQTT', frequency || 1000,
        unit || '', rangeMin ?? 0, rangeMax ?? 100,
        status || 'offline', JSON.stringify(tags || [])
      );
    });
    insertTx();

    if (status === 'online') {
      reloadMockSensors();
    }
    bumpMetadataVersion();

    const row = db.prepare('SELECT * FROM sensors WHERE id = ?').get(id) as any;
    res.status(201).json({ success: true, data: rowToSensor(row) });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ success: false, error: 'Sensor id already exists' });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.put('/:id', requirePermission('sensor:write'), (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM sensors WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: 'Sensor not found' });
    return;
  }

  const { name, type, protocol, frequency, unit, rangeMin, rangeMax, status, tags } = req.body;
  const oldStatus = existing.status;
  const newStatus = status ?? oldStatus;

  const updateTx = db.transaction(() => {
    db.prepare(`
      UPDATE sensors SET
        name = ?, type = ?, protocol = ?, frequency = ?, unit = ?,
        range_min = ?, range_max = ?, status = ?, tags = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name, type ?? existing.type, protocol ?? existing.protocol,
      frequency ?? existing.frequency, unit ?? existing.unit,
      rangeMin ?? existing.range_min, rangeMax ?? existing.range_max,
      newStatus,
      tags !== undefined ? JSON.stringify(tags) : existing.tags,
      req.params.id
    );
  });
  updateTx();

  if (newStatus !== oldStatus) {
    reloadMockSensors();
    broadcastAll({
      type: 'status',
      sensorId: req.params.id,
      status: newStatus,
    });
  }
  bumpMetadataVersion();

  const row = db.prepare('SELECT * FROM sensors WHERE id = ?').get(req.params.id) as any;
  res.json({ success: true, data: rowToSensor(row) });
});

router.delete('/:id', requirePermission('sensor:write'), (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM sensors WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: 'Sensor not found' });
    return;
  }

  const deleteTx = db.transaction(() => {
    db.prepare('DELETE FROM sensors WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM sensor_data WHERE sensor_id = ?').run(req.params.id);
  });
  deleteTx();

  if (existing.status === 'online') {
    reloadMockSensors();
  }

  broadcastToSubscribers(req.params.id, {
    type: 'status',
    sensorId: req.params.id,
    status: 'offline',
  });

  bumpMetadataVersion();

  res.json({ success: true, data: null });
});

export default router;
