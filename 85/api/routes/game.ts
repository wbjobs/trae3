import { Router, type Request, type Response } from 'express';
import { getDb, getMapFromRow, saveGameRecordWithEvents, saveTacticalPlan, getTacticalPlan, listTacticalPlans, deleteTacticalPlan, getReplayData } from '../database.js';
import { createRoom, getAllRooms, getRoom, getGameState, getRoomState } from '../roomManager.js';
import type { TacticalPlan, Faction } from '../../shared/types.js';

const router = Router();

router.get('/maps', (_req: Request, res: Response): void => {
  const db = getDb();
  try {
    const rows = db.prepare('SELECT * FROM map_config').all() as Record<string, unknown>[];
    const maps = rows.map(getMapFromRow).filter(Boolean);
    res.json({ success: true, data: maps });
  } catch (e) {
    console.error('Get maps error:', e);
    res.status(500).json({ success: false, error: 'Failed to load maps' });
  }
});

router.get('/maps/:id', (req: Request, res: Response): void => {
  const db = getDb();
  try {
    const row = db.prepare('SELECT * FROM map_config WHERE mapId = ?').get(req.params.id) as Record<string, unknown> | undefined;
    const map = getMapFromRow(row);
    if (!map) {
      res.status(404).json({ success: false, error: 'Map not found' });
      return;
    }
    res.json({ success: true, data: map });
  } catch (e) {
    console.error('Get map error:', e);
    res.status(500).json({ success: false, error: 'Failed to load map' });
  }
});

router.post('/rooms', (req: Request, res: Response): void => {
  const { name, mapId, mode } = req.body;
  if (!name || !mapId) {
    res.status(400).json({ success: false, error: 'Name and mapId are required' });
    return;
  }
  const room = createRoom(name, mapId, mode || 'turn-based');
  res.status(201).json({ success: true, data: room });
});

router.get('/rooms', (_req: Request, res: Response): void => {
  const rooms = getAllRooms();
  res.json({ success: true, data: rooms });
});

router.get('/rooms/:id', (req: Request, res: Response): void => {
  const room = getRoom(req.params.id);
  if (!room) {
    res.status(404).json({ success: false, error: 'Room not found' });
    return;
  }
  const db = getDb();
  try {
    const players = db.prepare('SELECT * FROM player WHERE roomId = ?').all(req.params.id);
    res.json({ success: true, data: { ...room, players } });
  } catch (e) {
    console.error('Get room error:', e);
    res.status(500).json({ success: false, error: 'Failed to load room' });
  }
});

router.get('/records', (_req: Request, res: Response): void => {
  const db = getDb();
  try {
    const records = db.prepare('SELECT * FROM game_record ORDER BY completedAt DESC').all();
    res.json({ success: true, data: records });
  } catch (e) {
    console.error('Get records error:', e);
    res.status(500).json({ success: false, error: 'Failed to load records' });
  }
});

router.get('/records/:id', (req: Request, res: Response): void => {
  const db = getDb();
  try {
    const record = db.prepare('SELECT * FROM game_record WHERE recordId = ?').get(req.params.id) as Record<string, unknown> | undefined;
    if (!record) {
      res.status(404).json({ success: false, error: 'Record not found' });
      return;
    }
    const events = db.prepare(
      'SELECT * FROM game_event WHERE recordId = ? ORDER BY turn, eventId'
    ).all(req.params.id);
    res.json({ success: true, data: { record, events } });
  } catch (e) {
    console.error('Get record error:', e);
    res.status(500).json({ success: false, error: 'Failed to load record' });
  }
});

router.post('/save-test', (_req: Request, res: Response): void => {
  const rs = getRoomState('test');
  const result = saveGameRecordWithEvents('test', 'red_win', {
    turn: 1, phase: 'finished', units: [], redScore: 10, blueScore: 0
  }, []);
  res.json({ success: result.success, gameId: result.gameId });
});

router.post('/plans', (req: Request, res: Response): void => {
  try {
    const planData = req.body as Omit<TacticalPlan, 'id' | 'createdAt'>;
    if (!planData.name || !planData.mapId || !planData.creator || !planData.faction || !planData.commands) {
      res.status(400).json({ success: false, error: 'Missing required fields' });
      return;
    }
    const plan = saveTacticalPlan(planData);
    res.status(201).json({ success: true, data: plan });
  } catch (e) {
    console.error('Save plan error:', e);
    res.status(500).json({ success: false, error: 'Failed to save plan' });
  }
});

router.get('/plans', (req: Request, res: Response): void => {
  try {
    const faction = req.query.faction as Faction | undefined;
    const mapId = req.query.mapId as string | undefined;
    const plans = listTacticalPlans(faction, mapId);
    res.json({ success: true, data: plans });
  } catch (e) {
    console.error('List plans error:', e);
    res.status(500).json({ success: false, error: 'Failed to list plans' });
  }
});

router.get('/plans/:id', (req: Request, res: Response): void => {
  try {
    const plan = getTacticalPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ success: false, error: 'Plan not found' });
      return;
    }
    res.json({ success: true, data: plan });
  } catch (e) {
    console.error('Get plan error:', e);
    res.status(500).json({ success: false, error: 'Failed to load plan' });
  }
});

router.delete('/plans/:id', (req: Request, res: Response): void => {
  try {
    const deleted = deleteTacticalPlan(req.params.id);
    if (!deleted) {
      res.status(404).json({ success: false, error: 'Plan not found' });
      return;
    }
    res.json({ success: true, message: 'Plan deleted' });
  } catch (e) {
    console.error('Delete plan error:', e);
    res.status(500).json({ success: false, error: 'Failed to delete plan' });
  }
});

router.get('/replays/:recordId', (req: Request, res: Response): void => {
  try {
    const replay = getReplayData(req.params.recordId);
    if (!replay) {
      res.status(404).json({ success: false, error: 'Replay not found' });
      return;
    }
    res.json({ success: true, data: replay });
  } catch (e) {
    console.error('Get replay error:', e);
    res.status(500).json({ success: false, error: 'Failed to load replay' });
  }
});

export default router;
