import { DatabaseManager } from '../server/database';
import { generateId } from '../shared/utils';
import type { GameState, Player, Unit, GameAction } from '../shared/types';
import { ActionType } from '../shared/types';
import fs from 'fs';
import path from 'path';

export async function runInit(): Promise<void> {
  const dbPath = path.join(__dirname, '..', 'data', 'game.db');
  const dataDir = path.dirname(dbPath);

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const dbManager = new DatabaseManager(dbPath);
  await dbManager.init();

  const player1: Player = {
    id: generateId(),
    name: '玩家A',
    socketId: 'socket_1',
    team: 'RED',
    isReady: true
  };

  const player2: Player = {
    id: generateId(),
    name: '玩家B',
    socketId: 'socket_2',
    team: 'BLUE',
    isReady: true
  };

  const player3: Player = {
    id: generateId(),
    name: '测试玩家',
    socketId: 'socket_3',
    team: 'RED',
    isReady: false
  };

  const units: Unit[] = [
    {
      id: generateId(),
      playerId: player1.id,
      type: 'SOLDIER',
      position: { x: 1, y: 5, z: 0 },
      health: 100,
      maxHealth: 100,
      attack: 20,
      defense: 15,
      moveRange: 3,
      attackRange: 1,
      hasMoved: false,
      hasAttacked: false
    },
    {
      id: generateId(),
      playerId: player1.id,
      type: 'ARCHER',
      position: { x: 1, y: 7, z: 0 },
      health: 70,
      maxHealth: 70,
      attack: 25,
      defense: 8,
      moveRange: 2,
      attackRange: 4,
      hasMoved: false,
      hasAttacked: false
    },
    {
      id: generateId(),
      playerId: player1.id,
      type: 'MAGE',
      position: { x: 1, y: 9, z: 0 },
      health: 60,
      maxHealth:  60,
      attack: 35,
      defense: 5,
      moveRange: 2,
      attackRange: 3,
      hasMoved: false,
      hasAttacked: false
    },
    {
      id: generateId(),
      playerId: player2.id,
      type: 'CAVALRY',
      position: { x: 18, y: 5, z: 0 },
      health: 120,
      maxHealth: 120,
      attack: 30,
      defense: 12,
      moveRange: 5,
      attackRange: 1,
      hasMoved: false,
      hasAttacked: false
    },
    {
      id: generateId(),
      playerId: player2.id,
      type: 'TANK',
      position: { x: 18, y: 7, z: 0 },
      health: 150,
      maxHealth: 150,
      attack: 15,
      defense: 25,
      moveRange: 2,
      attackRange: 1,
      hasMoved: false,
      hasAttacked: false
    },
    {
      id: generateId(),
      playerId: player2.id,
      type: 'HEALER',
      position: { x: 18, y: 9, z: 0 },
      health: 80,
      maxHealth: 80,
      attack: 10,
      defense: 10,
      moveRange: 2,
      attackRange: 2,
      hasMoved: false,
      hasAttacked: false
    }
  ];

  const now = new Date();
  const game1: GameState = {
    id: generateId(),
    name: '测试对局 #1',
    players: [player1, player2],
    units,
    currentTurn: player1.id,
    phase: 'PLAYING',
    status: 'IN_PROGRESS',
    createdAt: now,
    updatedAt: now
  };

  const game2: GameState = {
    id: generateId(),
    name: '等待中的对局',
    players: [player3],
    units: [],
    currentTurn: '',
    phase: 'WAITING',
    status: 'LOBBY',
    createdAt: new Date(Date.now() - 3600000),
    updatedAt: new Date(Date.now() - 1800000)
  };

  const game3: GameState = {
    id: generateId(),
    name: '已完成的对局',
    players: [player1, player2],
    units: [],
    currentTurn: '',
    phase: 'FINISHED',
    status: 'COMPLETED',
    createdAt: new Date(Date.now() - 86400000),
    updatedAt: new Date(Date.now() - 72000000)
  };

  await dbManager.createGame(game1);
  await dbManager.createGame(game2);
  await dbManager.createGame(game3);

  await dbManager.saveBattleLog(game1.id, {
    id: generateId(),
    type: ActionType.GAME_START,
    playerId: player1.id,
    timestamp: Date.now(),
    data: {
      message: '对局开始'
    }
  });

  await dbManager.saveBattleLog(game1.id, {
    id: generateId(),
    type: ActionType.MOVE,
    playerId: player1.id,
    timestamp: Date.now(),
    data: {
      unitId: units[0].id,
      from: { x: 1, y: 5, z: 0 },
      to: { x: 4, y: 5, z: 0 }
    }
  });

  await dbManager.saveBattleLog(game3.id, {
    id: generateId(),
    type: ActionType.GAME_END,
    playerId: player1.id,
    timestamp: Date.now() - 72000000,
    data: {
      winner: 'RED',
      message: '红方获胜'
    }
  });

  console.log('数据库初始化完成！');
  console.log('数据库路径:', dbPath);
  console.log('创建的对局:');
  console.log('  -', game1.name, `(${game1.status})`);
  console.log('  -', game2.name, `(${game2.status})`);
  console.log('  -', game3.name, `(${game3.status})`);
  console.log('示例玩家:', player1.name, ',', player2.name, ',', player3.name);
  console.log('示例单位:', units.length, '个');

  await dbManager.close();
}

if (require.main === module) {
  runInit().catch(console.error);
}
