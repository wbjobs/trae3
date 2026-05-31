import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";
import type {
  GameState,
  GameListItem,
  HexTile,
  Player,
  Unit,
  Phase,
  GameCommand,
  MovementAction,
  BattleResult,
  GameEvent,
  TurnResult,
} from "../../shared/types.js";
import { UNIT_STATS } from "../../shared/types.js";
import {
  validateMove,
  executeMove,
  validateAttack,
  executeCombat,
  settleTurn,
  checkVictory,
} from "./simulationEngine.js";

function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createGame(scenarioId: string, maxTurns: number): {
  gameId: string;
  joinCode: string;
} {
  const scenario = db
    .prepare("SELECT * FROM scenarios WHERE id = ?")
    .get(scenarioId) as any;
  if (!scenario) throw new Error("剧本不存在");

  const gameId = uuidv4();
  const joinCode = generateJoinCode();

  const scenarioUnits = db
    .prepare("SELECT * FROM scenario_units WHERE scenario_id = ?")
    .all(scenarioId) as any[];

  const insertGame = db.prepare(
    "INSERT INTO games (id, scenario_id, status, current_turn, max_turns, join_code, phase) VALUES (?, ?, 'waiting', 0, ?, ?, 'move')"
  );
  const insertUnit = db.prepare(
    "INSERT INTO units (id, game_id, type, faction, hp, max_hp, attack, defense, movement, q, r, status, moved, attacked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0)"
  );

  const transaction = db.transaction(() => {
    insertGame.run(gameId, scenarioId, maxTurns, joinCode);
    for (const su of scenarioUnits) {
      const stats = UNIT_STATS[su.type as keyof typeof UNIT_STATS];
      if (!stats) continue;
      const unitId = uuidv4();
      insertUnit.run(
        unitId,
        gameId,
        su.type,
        su.faction,
        stats.hp,
        stats.hp,
        stats.attack,
        stats.defense,
        stats.movement,
        su.q,
        su.r
      );
    }
  });

  transaction();

  return { gameId, joinCode };
}

export function getGameList(): GameListItem[] {
  const games = db
    .prepare(
      `SELECT g.id, s.name as scenario_name, g.status, g.current_turn, g.created_at,
       (SELECT COUNT(*) FROM players WHERE game_id = g.id) as player_count,
       (SELECT GROUP_CONCAT(DISTINCT u.faction) FROM units u WHERE u.game_id = g.id) as factions
       FROM games g JOIN scenarios s ON g.scenario_id = s.id
       ORDER BY g.created_at DESC`
    )
    .all() as any[];

  return games.map((g) => ({
    id: g.id,
    scenarioName: g.scenario_name,
    playerCount: g.player_count,
    status: g.status,
    currentTurn: g.current_turn,
    createdAt: g.created_at,
    factions: g.factions ? g.factions.split(",") : [],
  }));
}

export function getGameState(gameId: string): GameState | null {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as any;
  if (!game) return null;

  const scenario = db
    .prepare("SELECT * FROM scenarios WHERE id = ?")
    .get(game.scenario_id) as any;
  if (!scenario) return null;

  const tiles = db
    .prepare("SELECT * FROM hex_tiles WHERE scenario_id = ?")
    .all(game.scenario_id) as any[];

  const players = db
    .prepare("SELECT * FROM players WHERE game_id = ?")
    .all(gameId) as any[];

  const units = db
    .prepare("SELECT * FROM units WHERE game_id = ?")
    .all(gameId) as any[];

  return {
    id: game.id,
    scenarioId: game.scenario_id,
    scenarioName: scenario.name,
    status: game.status,
    currentTurn: game.current_turn,
    maxTurns: game.max_turns,
    phase: (game.phase as Phase) || "move",
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
      isReady: !!p.is_ready,
    })),
    units: units.map((u) => ({
      id: u.id,
      type: u.type,
      faction: u.faction,
      hp: u.hp,
      maxHp: u.max_hp,
      attack: u.attack,
      defense: u.defense,
      movement: u.movement,
      position: { q: u.q, r: u.r },
      status: u.status,
      moved: !!u.moved,
      attacked: !!u.attacked,
    })),
    tiles: tiles.map((t) => ({
      q: t.q,
      r: t.r,
      terrain: t.terrain,
    })),
    mapWidth: scenario.map_width,
    mapHeight: scenario.map_height,
    joinCode: game.join_code,
  };
}

export function joinGame(
  gameId: string,
  playerName: string
): { playerId: string; faction: string } {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as any;
  if (!game) throw new Error("对局不存在");
  if (game.status !== "waiting") throw new Error("对局已开始或已结束");

  const existingPlayers = db
    .prepare("SELECT faction FROM players WHERE game_id = ?")
    .all(gameId) as any[];

  const allFactions: string[] = [];
  const factionRows = db
    .prepare("SELECT DISTINCT faction FROM scenario_units WHERE scenario_id = ?")
    .all(game.scenario_id) as any[];
  for (const row of factionRows) {
    allFactions.push(row.faction);
  }

  const takenFactions = new Set(existingPlayers.map((p) => p.faction));
  const availableFaction = allFactions.find((f) => !takenFactions.has(f));

  if (!availableFaction) throw new Error("对局已满");

  const playerId = uuidv4();
  db.prepare(
    "INSERT INTO players (id, game_id, name, faction, is_ready) VALUES (?, ?, ?, ?, 0)"
  ).run(playerId, gameId, playerName, availableFaction);

  return { playerId, faction: availableFaction };
}

export function playerReady(gameId: string, playerId: string): {
  gameState: GameState;
  allReady: boolean;
} {
  const player = db
    .prepare("SELECT * FROM players WHERE id = ? AND game_id = ?")
    .get(playerId, gameId) as any;
  if (!player) throw new Error("玩家不存在");

  const newReady = player.is_ready ? 0 : 1;
  db.prepare("UPDATE players SET is_ready = ? WHERE id = ?").run(newReady, playerId);

  const players = db
    .prepare("SELECT * FROM players WHERE game_id = ?")
    .all(gameId) as any[];

  const allReady = players.length >= 2 && players.every((p) => p.is_ready);

  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId) as any;

  if (allReady && game.status === "waiting") {
    db.prepare(
      "UPDATE games SET status = 'playing', phase = 'move', current_turn = 1, updated_at = datetime('now') WHERE id = ?"
    ).run(gameId);
    db.prepare("UPDATE players SET is_ready = 0 WHERE game_id = ?").run(gameId);
  } else if (allReady && game.status === "playing") {
    const currentPhase = game.phase || "move";
    let nextPhase: Phase;

    if (currentPhase === "move") {
      nextPhase = "combat";
    } else if (currentPhase === "combat") {
      nextPhase = "settle";
    } else {
      nextPhase = "move";
    }

    if (currentPhase === "settle") {
      const gameState = getGameState(gameId)!;
      const { state: settledState } = settleTurn(gameState);
      persistGameState(settledState);
      db.prepare("UPDATE players SET is_ready = 0 WHERE game_id = ?").run(gameId);
    } else {
      db.prepare(
        "UPDATE games SET phase = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(nextPhase, gameId);
      db.prepare("UPDATE players SET is_ready = 0 WHERE game_id = ?").run(gameId);
    }
  }

  return {
    gameState: getGameState(gameId)!,
    allReady,
  };
}

export function processCommand(
  gameId: string,
  playerId: string,
  command: GameCommand
): {
  gameState: GameState;
  movement?: MovementAction;
  battle?: BattleResult;
  events: GameEvent[];
} {
  const gameState = getGameState(gameId);
  if (!gameState) throw new Error("对局不存在");
  if (gameState.status !== "playing") throw new Error("对局未在进行中");

  const player = db
    .prepare("SELECT * FROM players WHERE id = ? AND game_id = ?")
    .get(playerId, gameId) as any;
  if (!player) throw new Error("玩家不在此对局中");
  if (player.is_ready) throw new Error("已准备，无法继续操作");

  const unit = gameState.units.find((u) => u.id === command.unitId);
  if (!unit) throw new Error("单位不存在");
  if (unit.faction !== player.faction) throw new Error("不能操控对方单位");

  const events: GameEvent[] = [];

  if (command.type === "move") {
    if (gameState.phase !== "move") throw new Error("当前不是移动阶段");
    if (!command.target) throw new Error("缺少移动目标");

    const validation = validateMove(gameState, command.unitId, command.target);
    if (!validation.valid) throw new Error(validation.reason);

    const { state, movement } = executeMove(gameState, command.unitId, command.target);
    persistGameState(state);
    return { gameState: getGameState(gameId)!, movement, events };
  }

  if (command.type === "attack") {
    if (gameState.phase !== "combat") throw new Error("当前不是战斗阶段");
    if (!command.targetUnitId) throw new Error("缺少攻击目标");

    const validation = validateAttack(gameState, command.unitId, command.targetUnitId);
    if (!validation.valid) throw new Error(validation.reason);

    const { state, battle, events: battleEvents } = executeCombat(
      gameState,
      command.unitId,
      command.targetUnitId
    );
    persistGameState(state);

    const updatedState = getGameState(gameId)!;
    const victory = checkVictory(updatedState);
    if (victory.winner) {
      db.prepare(
        "UPDATE games SET status = 'finished', updated_at = datetime('now') WHERE id = ?"
      ).run(gameId);
      battleEvents.push({
        type: "turn_end",
        description: `${victory.winner}方获胜：${victory.reason}`,
        timestamp: Date.now(),
        data: { winner: victory.winner },
      });
    }

    return { gameState: getGameState(gameId)!, battle, events: battleEvents };
  }

  if (command.type === "wait") {
    const newUnits = gameState.units.map((u) => {
      if (u.id === command.unitId) {
        return { ...u, moved: true, attacked: true };
      }
      return u;
    });
    persistGameState({ ...gameState, units: newUnits });
    return { gameState: getGameState(gameId)!, events };
  }

  throw new Error("未知指令类型");
}

export function persistGameState(state: GameState): void {
  const updateGame = db.prepare(
    "UPDATE games SET status = ?, current_turn = ?, phase = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const updateUnit = db.prepare(
    "UPDATE units SET hp = ?, q = ?, r = ?, status = ?, moved = ?, attacked = ? WHERE id = ? AND game_id = ?"
  );

  const transaction = db.transaction(() => {
    updateGame.run(state.status, state.currentTurn, state.phase, state.id);
    for (const unit of state.units) {
      updateUnit.run(
        unit.hp,
        unit.position.q,
        unit.position.r,
        unit.status,
        unit.moved ? 1 : 0,
        unit.attacked ? 1 : 0,
        unit.id,
        state.id
      );
    }
  });

  transaction();
}

export function getScenarioList() {
  const rows = db.prepare("SELECT id, name, description, map_width, map_height FROM scenarios").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    mapWidth: r.map_width,
    mapHeight: r.map_height,
  }));
}

export function getScenarioDetail(scenarioId: string) {
  const scenario = db
    .prepare("SELECT id, name, description, map_width, map_height FROM scenarios WHERE id = ?")
    .get(scenarioId) as any;
  if (!scenario) return null;

  const tiles = db
    .prepare("SELECT q, r, terrain FROM hex_tiles WHERE scenario_id = ?")
    .all(scenarioId);
  const units = db
    .prepare("SELECT type, faction, q, r FROM scenario_units WHERE scenario_id = ?")
    .all(scenarioId);

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    mapWidth: scenario.map_width,
    mapHeight: scenario.map_height,
    tiles,
    units,
    factions: [...new Set(units.map((u: any) => u.faction))],
  };
}
