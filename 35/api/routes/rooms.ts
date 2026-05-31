import { Router } from 'express';
import { RoomManager } from '../modules/room/RoomManager.js';

const router = Router();

router.get('/', (_req, res) => {
  const rooms = RoomManager.getInstance().getWaitingRooms();
  res.json({
    success: true,
    data: rooms.map(room => ({
      id: room.id,
      name: room.name,
      ownerId: room.ownerId,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers,
      mode: room.mode,
      mapId: room.mapId,
      status: room.status,
      createdAt: room.createdAt,
      players: room.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        isReady: p.isReady
      }))
    }))
  });
});

router.post('/', (req, res) => {
  const { name, ownerId, ownerName, maxPlayers, mode, mapId } = req.body;
  const socketId = req.headers['x-socket-id'] as string;

  if (!name || !ownerId || !ownerName || !socketId) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数'
    });
  }

  const room = RoomManager.getInstance().createRoom(
    name,
    ownerId,
    ownerName,
    socketId,
    maxPlayers || 4,
    mode || 'ffa',
    mapId || 'map_01'
  );

  res.json({
    success: true,
    data: room
  });
});

router.post('/:id/join', (req, res) => {
  const { id } = req.params;
  const { playerId, playerName } = req.body;
  const socketId = req.headers['x-socket-id'] as string;

  if (!playerId || !playerName || !socketId) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数'
    });
  }

  const result = RoomManager.getInstance().joinRoom(id, playerId, playerName, socketId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

router.post('/:id/leave', (req, res) => {
  const { playerId } = req.body;

  if (!playerId) {
    return res.status(400).json({
      success: false,
      error: '缺少玩家ID'
    });
  }

  RoomManager.getInstance().leaveRoom(playerId);
  res.json({ success: true });
});

router.post('/:id/ready', (req, res) => {
  const { playerId, ready } = req.body;

  if (!playerId) {
    return res.status(400).json({
      success: false,
      error: '缺少玩家ID'
    });
  }

  RoomManager.getInstance().setPlayerReady(playerId, ready);
  res.json({ success: true });
});

router.post('/:id/start', (req, res) => {
  const { id } = req.params;
  const { ownerId } = req.body;

  if (!ownerId) {
    return res.status(400).json({
      success: false,
      error: '缺少房主ID'
    });
  }

  const result = RoomManager.getInstance().startGame(id, ownerId);

  if (!result.success) {
    return res.status(400).json(result);
  }

  res.json(result);
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const room = RoomManager.getInstance().getRoom(id);

  if (!room) {
    return res.status(404).json({
      success: false,
      error: '房间不存在'
    });
  }

  res.json({
    success: true,
    data: {
      id: room.id,
      name: room.name,
      ownerId: room.ownerId,
      players: room.players,
      maxPlayers: room.maxPlayers,
      mode: room.mode,
      status: room.status,
      mapId: room.mapId,
      createdAt: room.createdAt
    }
  });
});

export default router;
