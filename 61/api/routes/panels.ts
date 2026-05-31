import { Router, type Request, type Response } from 'express';
import db from '../database.js';
import { requirePermission } from '../middleware/permission.js';
import type { ScadaPanel, PanelLayout, PanelComponent } from '../../shared/types.js';

const router = Router();

function rowToPanel(row: any): ScadaPanel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    layout: JSON.parse(row.layout || '{}') as PanelLayout,
    components: JSON.parse(row.components || '[]') as PanelComponent[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get('/', (req: Request, res: Response): void => {
  const rows = db.prepare('SELECT * FROM scada_panels ORDER BY created_at DESC').all() as any[];
  res.json({ success: true, data: rows.map(rowToPanel) });
});

router.get('/:id', (req: Request, res: Response): void => {
  const row = db.prepare('SELECT * FROM scada_panels WHERE id = ?').get(req.params.id) as any;
  if (!row) {
    res.status(404).json({ success: false, error: 'Panel not found' });
    return;
  }
  res.json({ success: true, data: rowToPanel(row) });
});

router.post('/', requirePermission('panel:write'), (req: Request, res: Response): void => {
  const { id, name, description, layout, components } = req.body;
  if (!id || !name) {
    res.status(400).json({ success: false, error: 'id, name are required' });
    return;
  }

  try {
    db.prepare(`
      INSERT INTO scada_panels (id, name, description, layout, components)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id, name, description || '',
      JSON.stringify(layout || {}), JSON.stringify(components || [])
    );

    const row = db.prepare('SELECT * FROM scada_panels WHERE id = ?').get(id) as any;
    res.status(201).json({ success: true, data: rowToPanel(row) });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ success: false, error: 'Panel id already exists' });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.put('/:id', requirePermission('panel:write'), (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM scada_panels WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: 'Panel not found' });
    return;
  }

  const { name, description, layout, components } = req.body;
  db.prepare(`
    UPDATE scada_panels SET
      name = ?, description = ?, layout = ?, components = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? existing.name,
    description ?? existing.description,
    layout !== undefined ? JSON.stringify(layout) : existing.layout,
    components !== undefined ? JSON.stringify(components) : existing.components,
    req.params.id
  );

  const row = db.prepare('SELECT * FROM scada_panels WHERE id = ?').get(req.params.id) as any;
  res.json({ success: true, data: rowToPanel(row) });
});

router.delete('/:id', requirePermission('panel:write'), (req: Request, res: Response): void => {
  const existing = db.prepare('SELECT * FROM scada_panels WHERE id = ?').get(req.params.id) as any;
  if (!existing) {
    res.status(404).json({ success: false, error: 'Panel not found' });
    return;
  }

  db.prepare('DELETE FROM scada_panels WHERE id = ?').run(req.params.id);
  res.json({ success: true, data: null });
});

export default router;
