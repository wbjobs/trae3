import { Router } from 'express';
import { RoomManager } from '../modules/room/RoomManager.js';

const router = Router();

router.post('/login', (req, res) => {
  const { nickname, playerId } = req.body;

  if (!nickname || typeof nickname !== 'string' || nickname.trim().length < 2) {
    return res.status(400).json({
      success: false,
      error: '昵称至少需要2个字符'
    });
  }

  const persistenceManager = RoomManager.getInstance().getPersistenceManager();
  if (!persistenceManager) {
    return res.status(500).json({
      success: false,
      error: '系统未初始化'
    });
  }

  const playerData = persistenceManager.findOrCreatePlayer(nickname.trim());

  res.json({
    success: true,
    data: {
      id: playerData.id,
      nickname: playerData.nickname,
      totalGames: playerData.totalGames,
      wins: playerData.wins,
      kills: playerData.kills,
      playTime: playerData.playTime
    }
  });
});

router.get('/leaderboard', (_req, res) => {
  const persistenceManager = RoomManager.getInstance().getPersistenceManager();
  if (!persistenceManager) {
    return res.status(500).json({
      success: false,
      error: '系统未初始化'
    });
  }

  const leaderboard = persistenceManager.getLeaderboard(10);
  res.json({
    success: true,
    data: leaderboard
  });
});

export default router;
