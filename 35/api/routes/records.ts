import { Router } from 'express';
import { RoomManager } from '../modules/room/RoomManager.js';

const router = Router();

router.get('/', (req, res) => {
  const { playerId, limit } = req.query;
  const persistenceManager = RoomManager.getInstance().getPersistenceManager();

  if (!persistenceManager) {
    return res.status(500).json({
      success: false,
      error: '系统未初始化'
    });
  }

  let records;
  if (playerId && typeof playerId === 'string') {
    records = persistenceManager.getPlayerRecords(playerId, Number(limit) || 20);
  } else {
    records = persistenceManager.getGameRecords(Number(limit) || 50);
  }

  res.json({
    success: true,
    data: records
  });
});

export default router;
