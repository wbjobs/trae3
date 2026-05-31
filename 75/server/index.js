const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const GameEngine = require('./game/GameEngine');
const Database = require('./db/Database');
const CrossServerSync = require('./sync/CrossServerSync');
const config = require('./config/config');
const logger = require('./utils/Logger');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.get('server.corsOrigin') || "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../client/dist')));

app.use((req, res, next) => {
  logger.debug(`[HTTP] ${req.method} ${req.path}`, { ip: req.ip });
  next();
});

const db = new Database();
const gameEngine = new GameEngine(db);
const crossServerSync = new CrossServerSync(io, db);

const activeRooms = new Map();
const playerSockets = new Map();
const socketToRoom = new Map();

io.on('connection', (socket) => {
  logger.info('[Socket] 玩家连接', { socketId: socket.id, ip: socket.handshake.address });

  socket.on('player_login', (data) => {
    try {
      logger.info('[Socket] 玩家登录请求', { socketId: socket.id, playerId: data.playerId });
      
      if (!data.playerId) {
        throw new Error('玩家ID不能为空');
      }

      let player = db.getPlayer(data.playerId);
      if (!player) {
        logger.info('[Socket] 创建新玩家', { playerId: data.playerId });
        player = db.createPlayer(data.playerId, data.nickname || '匿名玩家');
      }

      playerSockets.set(socket.id, player.id);
      socket.emit('login_success', { player });
      
      logger.info('[Socket] 玩家登录成功', { socketId: socket.id, playerId: player.id, nickname: player.nickname });
    } catch (error) {
      logger.error('[Socket] 玩家登录失败', { error: error.message, socketId: socket.id });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('matchmaking', async (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) {
      logger.warn('[Socket] 未登录玩家请求匹配', { socketId: socket.id });
      socket.emit('error', { message: '请先登录' });
      return;
    }

    try {
      logger.info('[Socket] 玩家请求匹配', { playerId });

      const room = gameEngine.findOrCreateRoom();
      socket.join(room.id);
      socketToRoom.set(socket.id, room.id);

      const added = gameEngine.addPlayerToRoom(room, playerId, socket.id);
      
      if (!added) {
        logger.error('[Socket] 加入房间失败', { playerId, roomId: room.id });
        socket.emit('error', { message: '加入房间失败' });
        return;
      }

      activeRooms.set(room.id, room);

      if (room.players.length === 2) {
        logger.info('[Socket] 房间已满，开始游戏', { roomId: room.id, players: room.players.map(p => p.id) });
        
        const gameState = gameEngine.initGame(room);
        
        room.players.forEach((player, index) => {
          const playerSocket = io.sockets.sockets.get(player.socketId);
          if (playerSocket) {
            const playerSpecificState = gameEngine.getSerializableState(room, index);
            playerSocket.emit('game_start', { 
              gameState: playerSpecificState, 
              roomId: room.id 
            });
            logger.debug('[Socket] 发送游戏状态给玩家', { playerId: player.id, roomId: room.id });
          }
        });

        crossServerSync.syncBattleState(room.id, room);
      } else {
        logger.info('[Socket] 等待对手加入', { playerId, roomId: room.id });
        socket.emit('waiting_opponent');
      }
    } catch (error) {
      logger.error('[Socket] 匹配失败', { playerId, error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('play_card', async (data) => {
    const playerId = playerSockets.get(socket.id);
    const room = activeRooms.get(data.roomId);
    
    if (!room) {
      logger.warn('[Socket] 打牌请求：房间不存在', { roomId: data.roomId });
      socket.emit('invalid_move', { message: '房间不存在' });
      return;
    }

    if (!gameEngine.isPlayerTurn(room, playerId)) {
      logger.warn('[Socket] 打牌请求：不是玩家回合', { playerId, roomId: data.roomId });
      socket.emit('invalid_move', { message: '当前不是你的回合' });
      return;
    }

    try {
      logger.info('[Socket] 玩家打牌', { 
        playerId, 
        roomId: data.roomId, 
        cardInstanceId: data.cardId,
        targetId: data.targetId 
      });

      const result = gameEngine.playCard(room, playerId, data.cardId, data.targetId);

      const myIndex = room.players.findIndex(p => p.id === playerId);
      const opponentIndex = 1 - myIndex;

      const myState = gameEngine.getSerializableState(room, myIndex);
      const opponentState = gameEngine.getSerializableState(room, opponentIndex);

      const mySocket = io.sockets.sockets.get(room.players[myIndex].socketId);
      const opponentSocket = io.sockets.sockets.get(room.players[opponentIndex].socketId);

      if (mySocket) {
        mySocket.emit('card_played', {
          result: { ...result, gameState: myState }
        });
        logger.debug('[Socket] 发送打牌结果给当前玩家', { playerId });
      }

      if (opponentSocket) {
        opponentSocket.emit('card_played', {
          result: { ...result, gameState: opponentState }
        });
        logger.debug('[Socket] 发送打牌结果给对手', { opponentId: room.players[opponentIndex].id });
      }

      if (gameEngine.checkGameOver(room)) {
        const winner = gameEngine.getWinner(room);
        const battleId = db.saveBattleResult(room, winner);
        db.saveBattleReplay(room, battleId, winner);
        io.to(data.roomId).emit('game_over', { winner });
        logger.info('[Socket] 游戏结束', { roomId: data.roomId, winner });
        activeRooms.delete(data.roomId);
        socketToRoom.forEach((roomId, socketId) => {
          if (roomId === data.roomId) socketToRoom.delete(socketId);
        });
      } else {
        crossServerSync.syncBattleState(data.roomId, room);
      }

    } catch (error) {
      logger.error('[Socket] 打牌失败', { 
        playerId, 
        roomId: data.roomId, 
        error: error.message 
      });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('attack_minion', async (data) => {
    const playerId = playerSockets.get(socket.id);
    const room = activeRooms.get(data.roomId);
    
    if (!room) {
      logger.warn('[Socket] 攻击请求：房间不存在', { roomId: data.roomId });
      socket.emit('invalid_move', { message: '房间不存在' });
      return;
    }

    if (!gameEngine.isPlayerTurn(room, playerId)) {
      logger.warn('[Socket] 攻击请求：不是玩家回合', { playerId, roomId: data.roomId });
      socket.emit('invalid_move', { message: '当前不是你的回合' });
      return;
    }

    try {
      logger.info('[Socket] 随从攻击', { 
        playerId, 
        roomId: data.roomId, 
        attackerId: data.attackerId,
        targetId: data.targetId 
      });

      const result = gameEngine.attackWithMinion(room, playerId, data.attackerId, data.targetId);

      const myIndex = room.players.findIndex(p => p.id === playerId);
      const opponentIndex = 1 - myIndex;

      const myState = gameEngine.getSerializableState(room, myIndex);
      const opponentState = gameEngine.getSerializableState(room, opponentIndex);

      const mySocket = io.sockets.sockets.get(room.players[myIndex].socketId);
      const opponentSocket = io.sockets.sockets.get(room.players[opponentIndex].socketId);

      if (mySocket) {
        mySocket.emit('minion_attacked', {
          result,
          gameState: myState
        });
      }

      if (opponentSocket) {
        opponentSocket.emit('minion_attacked', {
          result,
          gameState: opponentState
        });
      }

      logger.debug('[Socket] 攻击结果已广播', { roomId: data.roomId });

      if (gameEngine.checkGameOver(room)) {
        const winner = gameEngine.getWinner(room);
        const battleId = db.saveBattleResult(room, winner);
        db.saveBattleReplay(room, battleId, winner);
        io.to(data.roomId).emit('game_over', { winner });
        logger.info('[Socket] 游戏结束', { roomId: data.roomId, winner });
        activeRooms.delete(data.roomId);
        socketToRoom.forEach((roomId, socketId) => {
          if (roomId === data.roomId) socketToRoom.delete(socketId);
        });
      } else {
        crossServerSync.syncBattleState(data.roomId, room);
      }

    } catch (error) {
      logger.error('[Socket] 攻击失败', { 
        playerId, 
        roomId: data.roomId, 
        error: error.message 
      });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('end_turn', (data) => {
    const playerId = playerSockets.get(socket.id);
    const room = activeRooms.get(data.roomId);
    
    if (!room) {
      logger.warn('[Socket] 结束回合请求：房间不存在', { roomId: data.roomId });
      return;
    }

    if (!gameEngine.isPlayerTurn(room, playerId)) {
      logger.warn('[Socket] 结束回合请求：不是玩家回合', { playerId, roomId: data.roomId });
      socket.emit('invalid_move', { message: '当前不是你的回合' });
      return;
    }

    try {
      logger.info('[Socket] 玩家结束回合', { playerId, roomId: data.roomId });

      const result = gameEngine.endTurn(room);

      const currentPlayerIndex = result.currentPlayer;
      const otherPlayerIndex = 1 - currentPlayerIndex;

      const currentState = gameEngine.getSerializableState(room, currentPlayerIndex);
      const otherState = gameEngine.getSerializableState(room, otherPlayerIndex);

      const currentSocket = io.sockets.sockets.get(room.players[currentPlayerIndex].socketId);
      const otherSocket = io.sockets.sockets.get(room.players[otherPlayerIndex].socketId);

      if (currentSocket) {
        currentSocket.emit('turn_changed', {
          currentPlayer: result.currentPlayer,
          turnNumber: result.turnNumber,
          gameState: currentState
        });
      }

      if (otherSocket) {
        otherSocket.emit('turn_changed', {
          currentPlayer: result.currentPlayer,
          turnNumber: result.turnNumber,
          gameState: otherState
        });
      }

      logger.debug('[Socket] 回合变更已广播', { 
        roomId: data.roomId, 
        newTurn: result.turnNumber,
        currentPlayer: room.players[currentPlayerIndex].id
      });

      crossServerSync.syncBattleState(data.roomId, room);

    } catch (error) {
      logger.error('[Socket] 结束回合失败', { 
        playerId, 
        roomId: data.roomId, 
        error: error.message 
      });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('sync_state', async (data) => {
    const playerId = playerSockets.get(socket.id);
    const room = activeRooms.get(data.roomId);
    
    if (!room) {
      logger.warn('[Socket] 状态同步请求：房间不存在', { roomId: data.roomId });
      return;
    }

    try {
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) {
        throw new Error('玩家不在房间中');
      }

      const stateValidation = gameEngine.validateAndSyncState(room);
      
      if (stateValidation.repaired) {
        logger.warn('[Socket] 状态已修复', { roomId: data.roomId, error: stateValidation.error });
      }

      const currentState = gameEngine.getSerializableState(room, playerIndex);
      socket.emit('state_updated', { gameState: currentState });
      
      logger.debug('[Socket] 状态同步完成', { playerId, roomId: data.roomId });

    } catch (error) {
      logger.error('[Socket] 状态同步失败', { error: error.message });
    }
  });

  socket.on('get_player_cards', (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const cards = db.getPlayerCards ? db.getPlayerCards(playerId) : [];
      socket.emit('player_cards', { cards });
    } catch (error) {
      logger.error('[Socket] 获取玩家卡牌失败', { error: error.message });
      socket.emit('error', { message: '获取卡牌失败' });
    }
  });

  socket.on('deck_create', (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const deck = db.createDeck(playerId, data.name, data.cardIds);
      socket.emit('deck_created', { deck });
      logger.info('[Socket] 创建卡组', { playerId, deckId: deck.id });
    } catch (error) {
      logger.error('[Socket] 创建卡组失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('deck_list', () => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const decks = db.getPlayerDecks(playerId);
      socket.emit('deck_list', { decks });
    } catch (error) {
      logger.error('[Socket] 获取卡组列表失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('deck_update', (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const deck = db.updateDeck(data.deckId, playerId, data.name, data.cardIds);
      socket.emit('deck_updated', { deck });
      logger.info('[Socket] 更新卡组', { playerId, deckId: data.deckId });
    } catch (error) {
      logger.error('[Socket] 更新卡组失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('deck_delete', (data) => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      db.deleteDeck(data.deckId, playerId);
      socket.emit('deck_deleted', { deckId: data.deckId });
      logger.info('[Socket] 删除卡组', { playerId, deckId: data.deckId });
    } catch (error) {
      logger.error('[Socket] 删除卡组失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('deck_backup', () => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const result = db.backupPlayerDecks(playerId);
      socket.emit('deck_backup_done', { result });
      logger.info('[Socket] 卡组云端备份', { playerId });
    } catch (error) {
      logger.error('[Socket] 卡组备份失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('deck_restore', () => {
    const playerId = playerSockets.get(socket.id);
    if (!playerId) return;

    try {
      const result = db.restorePlayerDecks(playerId);
      if (result) {
        const decks = db.getPlayerDecks(playerId);
        socket.emit('deck_restored', { result, decks });
        logger.info('[Socket] 卡组从备份恢复', { playerId });
      } else {
        socket.emit('deck_restored', { result: null });
      }
    } catch (error) {
      logger.error('[Socket] 卡组恢复失败', { error: error.message });
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnect', () => {
    const playerId = playerSockets.get(socket.id);
    const roomId = socketToRoom.get(socket.id);
    
    logger.info('[Socket] 玩家断开连接', { socketId: socket.id, playerId, roomId });

    if (roomId && activeRooms.has(roomId)) {
      const room = activeRooms.get(roomId);
      const playerIndex = room.players.findIndex(p => p.id === playerId);
      
      if (playerIndex !== -1) {
        const winnerIndex = 1 - playerIndex;
        const winner = room.players[winnerIndex];
        
        if (winner) {
          logger.info('[Socket] 对手断开，判定胜利', { 
            roomId, 
            winnerId: winner.id,
            disconnectedPlayerId: playerId
          });
          
          io.to(roomId).emit('opponent_disconnected', { winner: winner.id });
          
          try {
            const battleId = db.saveBattleResult(room, winner.id);
            db.saveBattleReplay(room, battleId, winner.id);
          } catch (err) {
            logger.error('[Socket] 保存对战结果失败', { error: err.message });
          }
          
          activeRooms.delete(roomId);
        }
      }
    }

    playerSockets.delete(socket.id);
    socketToRoom.delete(socket.id);
  });

  socket.on('error', (error) => {
    logger.error('[Socket] Socket错误', { socketId: socket.id, error: error.message });
  });
});

app.get('/api/leaderboard', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const leaderboard = db.getLeaderboard(Math.min(limit, 100));
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    logger.error('[API] 获取排行榜失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/battle-history/:playerId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = db.getBattleHistory(req.params.playerId, Math.min(limit, 50));
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('[API] 获取对战历史失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/replay/:replayId', (req, res) => {
  try {
    const replay = db.getBattleReplay(req.params.replayId);
    if (!replay) {
      return res.status(404).json({ success: false, error: '录像不存在' });
    }
    res.json({ success: true, data: replay });
  } catch (error) {
    logger.error('[API] 获取对战录像失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/replays/:playerId', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const replays = db.getPlayerReplays(req.params.playerId, Math.min(limit, 50));
    res.json({ success: true, data: replays });
  } catch (error) {
    logger.error('[API] 获取玩家录像列表失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/decks/:playerId', (req, res) => {
  try {
    const decks = db.getPlayerDecks(req.params.playerId);
    res.json({ success: true, data: decks });
  } catch (error) {
    logger.error('[API] 获取卡组列表失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/decks', (req, res) => {
  try {
    const { playerId, name, cardIds } = req.body;
    if (!playerId || !name || !cardIds) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    const deck = db.createDeck(playerId, name, cardIds);
    res.json({ success: true, data: deck });
  } catch (error) {
    logger.error('[API] 创建卡组失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/decks/:deckId', (req, res) => {
  try {
    const { playerId, name, cardIds } = req.body;
    if (!playerId || !name || !cardIds) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }
    const deck = db.updateDeck(req.params.deckId, playerId, name, cardIds);
    res.json({ success: true, data: deck });
  } catch (error) {
    logger.error('[API] 更新卡组失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/decks/:deckId', (req, res) => {
  try {
    const { playerId } = req.body;
    if (!playerId) {
      return res.status(400).json({ success: false, error: '玩家ID不能为空' });
    }
    db.deleteDeck(req.params.deckId, playerId);
    res.json({ success: true });
  } catch (error) {
    logger.error('[API] 删除卡组失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/decks/backup/:playerId', (req, res) => {
  try {
    const result = db.backupPlayerDecks(req.params.playerId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('[API] 卡组备份失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/decks/restore/:playerId', (req, res) => {
  try {
    const result = db.restorePlayerDecks(req.params.playerId);
    if (result) {
      const decks = db.getPlayerDecks(req.params.playerId);
      res.json({ success: true, data: { ...result, decks } });
    } else {
      res.status(404).json({ success: false, error: '无可用备份' });
    }
  } catch (error) {
    logger.error('[API] 卡组恢复失败', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'online',
      activeRooms: activeRooms.size,
      connectedPlayers: playerSockets.size,
      uptime: process.uptime(),
      timestamp: Date.now()
    }
  });
});

app.get('*', (req, res) => {
  const distPath = path.join(__dirname, '../client/dist/index.html');
  if (require('fs').existsSync(distPath)) {
    res.sendFile(distPath);
  } else {
    res.json({ 
      message: '卡牌对战游戏服务端运行中',
      docs: '/api/health',
      leaderboard: '/api/leaderboard'
    });
  }
});

process.on('uncaughtException', (error) => {
  logger.error('[Process] 未捕获的异常', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] 未处理的Promise拒绝', { reason: reason?.message || reason });
});

process.on('SIGTERM', () => {
  logger.info('[Process] 收到SIGTERM信号，正在关闭...');
  db.close();
  server.close(() => {
    logger.info('[Process] 服务器已关闭');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('[Process] 收到SIGINT信号，正在关闭...');
  db.close();
  server.close(() => {
    logger.info('[Process] 服务器已关闭');
    process.exit(0);
  });
});

const PORT = config.get('server.port') || 3000;
const HOST = config.get('server.host') || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`[Server] 服务器运行在 ${HOST}:${PORT}`);
  logger.info(`[Server] 环境: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`[Server] 服务器ID: ${crossServerSync.serverId}`);
});

module.exports = { app, server, io, activeRooms, playerSockets };