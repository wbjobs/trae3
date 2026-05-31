import { DatabaseManager } from '../server/database';
import { generateId, randomInt } from '../shared/utils';
import type { GameState, Player, Unit } from '../shared/types';
import path from 'path';

const UNIT_TYPES = ['SOLDIER', 'ARCHER', 'CAVALRY', 'MAGE', 'HEALER', 'TANK'];

const UNIT_STATS: Record<string, { health: number; attack: number; defense: number; moveRange: number; attackRange: number }> = {
  SOLDIER: { health: 100, attack: 20, defense: 15, moveRange: 3, attackRange: 1 },
  ARCHER: { health: 70, attack: 25, defense: 8, moveRange: 2, attackRange: 4 },
  CAVALRY: { health: 120, attack: 30, defense: 12, moveRange: 5, attackRange: 1 },
  MAGE: { health: 60, attack: 35, defense: 5, moveRange: 2, attackRange: 3 },
  HEALER: { health: 80, attack: 10, defense: 10, moveRange: 2, attackRange: 2 },
  TANK: { health: 150, attack: 15, defense: 25, moveRange: 2, attackRange: 1 }
};

function createPlayer(name: string, team: string, isReady: boolean = true): Player {
  return {
    id: generateId(),
    name,
    socketId: `socket_${generateId().slice(0, 8)}`,
    team,
    isReady
  };
}

function createUnit(playerId: string, type: string, x: number, y: number): Unit {
  const stats = UNIT_STATS[type];
  return {
    id: generateId(),
    playerId,
    type,
    position: { x, y, z: 0 },
    health: stats.health,
    maxHealth: stats.health,
    attack: stats.attack,
    defense: stats.defense,
    moveRange: stats.moveRange,
    attackRange: stats.attackRange,
    hasMoved: false,
    hasAttacked: false
  };
}

function generateSampleGame(
  name: string,
  status: string,
  phase: string,
  player1Name: string,
  player2Name: string,
  includeUnits: boolean = true
): { game: GameState; units: Unit[] } {
  const player1 = createPlayer(player1Name, 'RED');
  const player2 = createPlayer(player2Name, 'BLUE');

  const units: Unit[] = [];
  if (includeUnits) {
    const redSpawns = [
      { x: 1, y: 4 }, { x: 1, y: 6 }, { x: 1, y: 8 },
      { x: 2, y: 5 }, { x: 2, y: 7 }
    ];
    const blueSpawns = [
      { x: 18, y: 4 }, { x: 18, y: 6 }, { x: 18, y: 8 },
      { x: 17, y: 5 }, { x: 17, y: 7 }
    ];

    for (let i = 0; i < 3; i++) {
      const type = UNIT_TYPES[randomInt(0, UNIT_TYPES.length - 1)];
      units.push(createUnit(player1.id, type, redSpawns[i].x, redSpawns[i].y));
    }

    for (let i = 0; i < 3; i++) {
      const type = UNIT_TYPES[randomInt(0, UNIT_TYPES.length - 1)];
      units.push(createUnit(player2.id, type, blueSpawns[i].x, blueSpawns[i].y));
    }
  }

  const now = new Date();
  const game: GameState = {
    id: generateId(),
    name,
    players: [player1, player2],
    units,
    currentTurn: status === 'IN_PROGRESS' ? player1.id : '',
    phase,
    status,
    createdAt: new Date(Date.now() - randomInt(3600000, 86400000 * 7)),
    updatedAt: now
  };

  return { game, units };
}

function generateBattleLogs(gameId: string, units: Unit[]): any[] {
  const logs: any[] = [];
  const now = new Date();

  logs.push({
    type: 'GAME_START',
    message: '对局开始',
    timestamp: new Date(now.getTime() - 600000).toISOString()
  });

  for (let i = 0; i < 5; i++) {
    const unit = units[randomInt(0, units.length - 1)];
    const newX = Math.max(0, Math.min(19, unit.position.x + randomInt(-2, 2)));
    const newY = Math.max(0, Math.min(14, unit.position.y + randomInt(-2, 2)));

    logs.push({
      type: 'UNIT_MOVE',
      unitId: unit.id,
      unitType: unit.type,
      from: { ...unit.position },
      to: { x: newX, y: newY, z: 0 },
      playerId: unit.playerId,
      timestamp: new Date(now.getTime() - 600000 + (i + 1) * 60000).toISOString()
    });
  }

  const attacker = units[0];
  const target = units[3];
  const damage = Math.max(5, attacker.attack - target.defense / 2);

  logs.push({
    type: 'UNIT_ATTACK',
    attackerId: attacker.id,
    attackerType: attacker.type,
    targetId: target.id,
    targetType: target.type,
    damage,
    remainingHealth: Math.max(0, target.health - damage),
    playerId: attacker.playerId,
    timestamp: new Date(now.getTime() - 120000).toISOString()
  });

  logs.push({
    type: 'TURN_END',
    playerId: attacker.playerId,
    nextPlayerId: target.playerId,
    turnNumber: 1,
    timestamp: new Date(now.getTime() - 60000).toISOString()
  });

  return logs;
}

export async function runInitData(): Promise<void> {
  const dbPath = path.join(__dirname, '..', 'data', 'game.db');
  const dbManager = new DatabaseManager(dbPath);
  await dbManager.init();

  console.log('开始生成示例数据...');

  const games = [
    generateSampleGame('激烈对战 #001', 'IN_PROGRESS', 'PLAYING', '战神关羽', '常胜赵云'),
    generateSampleGame('策略对决 #002', 'IN_PROGRESS', 'PLAYING', '卧龙凤雏', '冢虎幼麟'),
    generateSampleGame('新手练习赛', 'LOBBY', 'WAITING', '小萌新', '', false),
    generateSampleGame('排位赛 #128', 'COMPLETED', 'FINISHED', '王者归来', '不败神话'),
    generateSampleGame('友谊赛', 'COMPLETED', 'FINISHED', '玩家甲', '玩家乙')
  ];

  let totalGames = 0;
  let totalLogs = 0;

  for (const { game, units } of games) {
    await dbManager.createGame(game);
    totalGames++;

    if (game.status !== 'LOBBY') {
      const logs = generateBattleLogs(game.id, units);
      for (const log of logs) {
        await dbManager.saveBattleLog(game.id, log);
        totalLogs++;
      }
    }

    if (game.status === 'COMPLETED') {
      await dbManager.saveBattleLog(game.id, {
        type: 'GAME_OVER',
        winner: Math.random() > 0.5 ? 'RED' : 'BLUE',
        message: '对局结束',
        timestamp: game.updatedAt.toISOString()
      });
      totalLogs++;
    }
  }

  const waitingPlayer = createPlayer('路人玩家', 'BLUE', false);
  const waitingGames = await dbManager.listGames('LOBBY');
  if (waitingGames.length > 0) {
    await dbManager.addPlayerToGame(waitingGames[0].id, waitingPlayer);
  }

  console.log('示例数据生成完成！');
  console.log('创建对局:', totalGames, '个');
  console.log('创建战斗日志:', totalLogs, '条');
  console.log('');
  console.log('对局列表:');
  const allGames = await dbManager.listGames();
  for (const game of allGames) {
    const playerNames = game.players.map(p => p.name).join(' vs ');
    console.log(`  [${game.status}] ${game.name} - ${playerNames || '等待玩家'}`);
  }

  await dbManager.close();
}

if (require.main === module) {
  runInitData().catch(console.error);
}
