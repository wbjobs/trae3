import type {
  GameState,
  HexCoord,
  HexTile,
  Unit,
  BattleResult,
  MovementAction,
  GameEvent,
  TurnResult,
  TerrainType,
  UnitType,
} from "../../shared/types.js";
import { TERRAIN_MOVE_COST, UNIT_STATS } from "../../shared/types.js";

const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

function hexDistance(a: HexCoord, b: HexCoord): number {
  return (
    (Math.abs(a.q - b.q) +
      Math.abs(a.q + a.r - b.q - b.r) +
      Math.abs(a.r - b.r)) /
    2
  );
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function buildTileMap(tiles: HexTile[]): Map<string, HexTile> {
  const map = new Map<string, HexTile>();
  for (const tile of tiles) {
    map.set(hexKey(tile.q, tile.r), tile);
  }
  return map;
}

function buildUnitMap(units: Unit[]): Map<string, Unit> {
  const map = new Map<string, Unit>();
  for (const unit of units) {
    if (unit.status !== "destroyed") {
      map.set(hexKey(unit.position.q, unit.position.r), unit);
    }
  }
  return map;
}

function findPathCost(
  start: HexCoord,
  end: HexCoord,
  tileMap: Map<string, HexTile>,
  unitMap: Map<string, Unit>,
  movingUnit: Unit
): number | null {
  if (hexKey(start.q, start.r) === hexKey(end.q, end.r)) return 0;

  const dist = new Map<string, number>();
  const startKey = hexKey(start.q, start.r);
  dist.set(startKey, 0);

  const queue: [number, number, number][] = [[0, start.q, start.r]];

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, q, r] = queue.shift()!;
    const currentKey = hexKey(q, r);

    if (q === end.q && r === end.r) {
      return cost;
    }

    const currentDist = dist.get(currentKey);
    if (currentDist !== undefined && cost > currentDist) continue;

    for (const dir of HEX_DIRECTIONS) {
      const nq = q + dir.q;
      const nr = r + dir.r;
      const nextKey = hexKey(nq, nr);

      const tile = tileMap.get(nextKey);
      if (!tile) continue;

      const moveCost = TERRAIN_MOVE_COST[tile.terrain];
      if (moveCost >= 99) continue;

      const occupyingUnit = unitMap.get(nextKey);
      if (occupyingUnit && nextKey !== hexKey(end.q, end.r)) continue;

      const newCost = cost + moveCost;
      const existingDist = dist.get(nextKey);
      if (existingDist === undefined || newCost < existingDist) {
        dist.set(nextKey, newCost);
        queue.push([newCost, nq, nr]);
      }
    }
  }

  return null;
}

export function validateMove(
  gameState: GameState,
  unitId: string,
  target: HexCoord
): { valid: boolean; reason?: string } {
  const unit = gameState.units.find((u) => u.id === unitId);
  if (!unit) return { valid: false, reason: "单位不存在" };
  if (unit.status === "destroyed") return { valid: false, reason: "单位已摧毁" };
  if (unit.moved) return { valid: false, reason: "单位本回合已移动" };

  const tileMap = buildTileMap(gameState.tiles);
  const targetTile = tileMap.get(hexKey(target.q, target.r));
  if (!targetTile) return { valid: false, reason: "目标位置不在地图内" };

  if (TERRAIN_MOVE_COST[targetTile.terrain] >= 99) {
    return { valid: false, reason: "无法进入该地形" };
  }

  const unitMap = buildUnitMap(gameState.units);
  const occupyingUnit = unitMap.get(hexKey(target.q, target.r));
  if (occupyingUnit) return { valid: false, reason: "目标位置已被占用" };

  const pathCost = findPathCost(unit.position, target, tileMap, unitMap, unit);
  if (pathCost === null) return { valid: false, reason: "无法到达目标位置" };
  if (pathCost > unit.movement) return { valid: false, reason: "移动力不足" };

  return { valid: true };
}

export function executeMove(
  gameState: GameState,
  unitId: string,
  target: HexCoord
): { state: GameState; movement: MovementAction } {
  const unitIndex = gameState.units.findIndex((u) => u.id === unitId);
  const unit = gameState.units[unitIndex];
  const from = { q: unit.position.q, r: unit.position.r };

  const newUnits = [...gameState.units];
  newUnits[unitIndex] = { ...unit, position: { q: target.q, r: target.r }, moved: true };

  return {
    state: { ...gameState, units: newUnits },
    movement: { unitId, from, to: { q: target.q, r: target.r } },
  };
}

const TYPE_ADVANTAGE: Record<string, Record<string, number>> = {
  armor: { infantry: 1.3, recon: 0.8 },
  infantry: { recon: 1.3, armor: 0.8 },
  recon: { armor: 1.3, infantry: 0.8 },
  artillery: { infantry: 1.2, armor: 1.1, recon: 0.9 },
  engineer: {},
  supply: {},
};

const TERRAIN_DEFENSE_BONUS: Record<TerrainType, number> = {
  plain: 1.0,
  forest: 1.3,
  mountain: 1.5,
  water: 0.5,
  urban: 1.4,
  road: 0.8,
};

export function calculateBattle(
  attacker: Unit,
  defender: Unit,
  terrain: TerrainType
): BattleResult {
  const typeMultiplier = TYPE_ADVANTAGE[attacker.type]?.[defender.type] ?? 1.0;
  const terrainBonus = TERRAIN_DEFENSE_BONUS[terrain];

  const rawDamage = attacker.attack * typeMultiplier - defender.defense * terrainBonus;
  const damageDealt = Math.max(Math.round(rawDamage), 5);

  const defenderHp = defender.hp - damageDealt;
  const defenderDestroyed = defenderHp <= 0;

  const counterDamage = defenderDestroyed
    ? 0
    : Math.max(
        Math.round(defender.attack * 0.3 - attacker.defense * 0.5),
        0
      );

  const attackerHp = attacker.hp - counterDamage;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    damageDealt,
    damageReceived: counterDamage,
    attackerHp: Math.max(attackerHp, 0),
    defenderHp: Math.max(defenderHp, 0),
    defenderDestroyed,
  };
}

export function executeCombat(
  gameState: GameState,
  attackerId: string,
  defenderId: string
): { state: GameState; battle: BattleResult; events: GameEvent[] } {
  const attackerIndex = gameState.units.findIndex((u) => u.id === attackerId);
  const defenderIndex = gameState.units.findIndex((u) => u.id === defenderId);
  const attacker = gameState.units[attackerIndex];
  const defender = gameState.units[defenderIndex];

  const tileMap = buildTileMap(gameState.tiles);
  const defenderTile = tileMap.get(hexKey(defender.position.q, defender.position.r));
  const terrain = defenderTile?.terrain ?? "plain";

  const battle = calculateBattle(attacker, defender, terrain);

  const events: GameEvent[] = [];
  const now = Date.now();

  events.push({
    type: "battle",
    description: `${attacker.type}攻击${defender.type}，造成${battle.damageDealt}点伤害`,
    timestamp: now,
    data: { attackerId, defenderId, damageDealt: battle.damageDealt },
  });

  const newUnits = [...gameState.units];
  const newAttacker: Unit = {
    ...attacker,
    hp: battle.attackerHp,
    attacked: true,
    status: battle.attackerHp <= 0 ? "destroyed" : battle.attackerHp <= attacker.maxHp * 0.5 ? "damaged" : attacker.status,
  };
  newUnits[attackerIndex] = newAttacker;

  const newDefender: Unit = {
    ...defender,
    hp: battle.defenderHp,
    status: battle.defenderDestroyed ? "destroyed" : battle.defenderHp <= defender.maxHp * 0.5 ? "damaged" : defender.status,
  };
  newUnits[defenderIndex] = newDefender;

  if (battle.defenderDestroyed) {
    events.push({
      type: "unit_destroyed",
      description: `${defender.faction}方${defender.type}被摧毁`,
      timestamp: now,
      data: { unitId: defender.id, faction: defender.faction },
    });
  }

  if (battle.damageReceived > 0) {
    events.push({
      type: "battle",
      description: `${defender.type}反击，造成${battle.damageReceived}点伤害`,
      timestamp: now,
      data: { defenderId, attackerId, damageDealt: battle.damageReceived },
    });
  }

  if (battle.attackerHp <= 0) {
    events.push({
      type: "unit_destroyed",
      description: `${attacker.faction}方${attacker.type}被摧毁`,
      timestamp: now,
      data: { unitId: attacker.id, faction: attacker.faction },
    });
  }

  return { state: { ...gameState, units: newUnits }, battle, events };
}

export function validateAttack(
  gameState: GameState,
  attackerId: string,
  defenderId: string
): { valid: boolean; reason?: string } {
  const attacker = gameState.units.find((u) => u.id === attackerId);
  const defender = gameState.units.find((u) => u.id === defenderId);

  if (!attacker) return { valid: false, reason: "攻击方不存在" };
  if (!defender) return { valid: false, reason: "防守方不存在" };
  if (attacker.status === "destroyed") return { valid: false, reason: "攻击方已摧毁" };
  if (defender.status === "destroyed") return { valid: false, reason: "防守方已摧毁" };
  if (attacker.attacked) return { valid: false, reason: "单位本回合已攻击" };
  if (attacker.faction === defender.faction) return { valid: false, reason: "不能攻击友方单位" };

  const range = attacker.type === "artillery" ? 3 : 1;
  const dist = hexDistance(attacker.position, defender.position);
  if (dist > range) return { valid: false, reason: "目标超出攻击范围" };
  if (dist === 0) return { valid: false, reason: "不能攻击自身位置" };

  return { valid: true };
}

export function settleTurn(gameState: GameState): {
  state: GameState;
  result: TurnResult;
} {
  const now = Date.now();
  const newUnits = gameState.units.map((u) => ({
    ...u,
    moved: false,
    attacked: false,
  }));

  const newTurn = gameState.currentTurn + 1;
  const events: GameEvent[] = [
    {
      type: "turn_end",
      description: `第${gameState.currentTurn}回合结束`,
      timestamp: now,
    },
  ];

  const result: TurnResult = {
    turn: gameState.currentTurn,
    phase: gameState.phase,
    movements: [],
    battles: [],
    events,
  };

  const victory = checkVictory({ ...gameState, units: newUnits, currentTurn: newTurn });

  if (victory.winner) {
    events.push({
      type: "turn_end",
      description: `${victory.winner}方获胜：${victory.reason}`,
      timestamp: now,
      data: { winner: victory.winner },
    });
    return {
      state: {
        ...gameState,
        units: newUnits,
        currentTurn: newTurn,
        status: "finished",
        phase: "settle",
      },
      result,
    };
  }

  if (newTurn > gameState.maxTurns) {
    events.push({
      type: "turn_end",
      description: "达到最大回合数，平局",
      timestamp: now,
      data: { draw: true },
    });
    return {
      state: {
        ...gameState,
        units: newUnits,
        currentTurn: newTurn,
        status: "finished",
        phase: "settle",
      },
      result,
    };
  }

  return {
    state: {
      ...gameState,
      units: newUnits,
      currentTurn: newTurn,
      status: "playing",
      phase: "move",
    },
    result,
  };
}

export function checkVictory(gameState: GameState): {
  winner: string | null;
  reason?: string;
} {
  const factions = new Set(gameState.units.map((u) => u.faction));
  const activeByFaction = new Map<string, number>();

  for (const unit of gameState.units) {
    if (unit.status !== "destroyed") {
      activeByFaction.set(unit.faction, (activeByFaction.get(unit.faction) ?? 0) + 1);
    }
  }

  for (const faction of factions) {
    if ((activeByFaction.get(faction) ?? 0) === 0) {
      const winner = [...factions].find((f) => f !== faction);
      if (winner) {
        return { winner, reason: `${faction}方全军覆没` };
      }
    }
  }

  if (gameState.currentTurn > gameState.maxTurns) {
    return { winner: null, reason: "达到最大回合数，平局" };
  }

  return { winner: null };
}
