import type {
  GameState,
  UnitCommand,
  GameEvent,
  UnitState,
  TerrainCell,
  Position,
  Faction,
} from '../shared/types.js';
import { UNIT_STATS } from '../shared/types.js';

function getUnitById(state: GameState, unitId: string): UnitState | undefined {
  return state.units.find(u => u.unitId === unitId);
}

function getTerrainAt(terrains: TerrainCell[], pos: Position): TerrainCell {
  return terrains.find(t => t.x === pos.x && t.y === pos.y) ?? {
    x: pos.x,
    y: pos.y,
    type: 'plain',
    defenseBonus: 0,
    movementCost: 1,
  };
}

function hexDistance(a: Position, b: Position): number {
  const aq = a.x - Math.floor(a.y / 2);
  const ar = a.y;
  const as = -aq - ar;

  const bq = b.x - Math.floor(b.y / 2);
  const br = b.y;
  const bs = -bq - br;

  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

function validateMove(
  unit: UnitState,
  target: Position,
  terrains: TerrainCell[],
  allUnits: UnitState[]
): boolean {
  const stats = UNIT_STATS[unit.unitType];
  if (!stats) return false;
  if (unit.status !== 'active') return false;

  const dist = hexDistance(unit.position, target);
  if (dist > stats.movement) return false;
  if (dist === 0) return false;

  const terrain = getTerrainAt(terrains, target);
  if (terrain.movementCost >= 99) return false;

  const occupied = allUnits.find(
    u => u.position.x === target.x && u.position.y === target.y && u.status === 'active'
  );
  if (occupied) return false;

  return true;
}

function validateAttack(
  attacker: UnitState,
  targetPos: Position,
  terrains: TerrainCell[],
  allUnits: UnitState[],
  attackerFaction: Faction
): { valid: boolean; defender?: UnitState } {
  const stats = UNIT_STATS[attacker.unitType];
  if (!stats) return { valid: false };
  if (attacker.status !== 'active') return { valid: false };
  if (stats.range <= 0) return { valid: false };

  const dist = hexDistance(attacker.position, targetPos);
  if (dist > stats.range) return { valid: false };

  const defender = allUnits.find(
    u => u.position.x === targetPos.x && u.position.y === targetPos.y
      && u.faction !== attackerFaction && u.status === 'active'
  );
  if (!defender) return { valid: false };

  return { valid: true, defender };
}

function calculateDamage(
  attacker: UnitState,
  defender: UnitState,
  terrains: TerrainCell[]
): number {
  const atkStats = UNIT_STATS[attacker.unitType];
  const defStats = UNIT_STATS[defender.unitType];
  if (!atkStats || !defStats) return 5;

  const terrain = getTerrainAt(terrains, defender.position);
  const terrainDefense = terrain.defenseBonus * defStats.defense * 0.2;
  const baseDamage = atkStats.attack * 0.6 - defStats.defense * 0.35 - terrainDefense;
  const attackerHpFactor = attacker.strength / attacker.maxStrength;
  const finalDamage = Math.max(5, Math.round(baseDamage * attackerHpFactor));
  return finalDamage;
}

export interface ResolveTurnContext {
  state: GameState;
  commands: Map<string, UnitCommand[]>;
  terrains: TerrainCell[];
  redPlayerId: string;
  bluePlayerId: string;
}

export function resolveTurn(
  ctx: ResolveTurnContext
): { events: GameEvent[]; newState: GameState } {
  const { state, commands, terrains, redPlayerId, bluePlayerId } = ctx;
  const events: GameEvent[] = [];
  const newUnits: UnitState[] = state.units.map(u => ({ ...u, position: { ...u.position } }));
  let redScore = state.redScore;
  let blueScore = state.blueScore;

  const allCommands: Array<{ playerId: string; cmd: UnitCommand; faction: Faction }> = [];
  const actedUnits = new Set<string>();

  for (const [playerId, cmdList] of commands) {
    const faction: Faction = playerId === redPlayerId ? 'red' : 'blue';
    for (const cmd of cmdList) {
      if (actedUnits.has(cmd.unitId)) continue;
      allCommands.push({ playerId, cmd, faction });
      actedUnits.add(cmd.unitId);
    }
  }

  const holdCmds = allCommands.filter(c => c.cmd.action === 'hold');
  const defendCmds = allCommands.filter(c => c.cmd.action === 'defend');
  const moveCmds = allCommands.filter(c => c.cmd.action === 'move');
  const attackCmds = allCommands.filter(c => c.cmd.action === 'attack');

  for (const { playerId, cmd } of holdCmds) {
    const unitIdx = newUnits.findIndex(u => u.unitId === cmd.unitId);
    if (unitIdx === -1) continue;
    const unit = newUnits[unitIdx];
    unit.defenseBonus = (unit.defenseBonus || 0) + 1;
    events.push({
      turn: state.turn,
      timestamp: new Date().toISOString(),
      playerId,
      action: 'defend',
      unitId: cmd.unitId,
      from: { ...unit.position },
      to: { ...unit.position },
    });
  }

  for (const { playerId, cmd } of defendCmds) {
    const unitIdx = newUnits.findIndex(u => u.unitId === cmd.unitId);
    if (unitIdx === -1) continue;
    const unit = newUnits[unitIdx];
    const terrain = getTerrainAt(terrains, unit.position);
    unit.defenseBonus = (unit.defenseBonus || 0) + terrain.defenseBonus + 2;
    events.push({
      turn: state.turn,
      timestamp: new Date().toISOString(),
      playerId,
      action: 'defend',
      unitId: cmd.unitId,
      from: { ...unit.position },
      to: { ...unit.position },
    });
  }

  for (const { playerId, cmd, faction } of moveCmds) {
    if (!cmd.target) continue;
    const unitIdx = newUnits.findIndex(u => u.unitId === cmd.unitId && u.faction === faction);
    if (unitIdx === -1) continue;
    const unit = newUnits[unitIdx];
    if (!validateMove(unit, cmd.target, terrains, newUnits)) continue;

    const from = { ...unit.position };
    unit.position = { ...cmd.target };
    const terrain = getTerrainAt(terrains, unit.position);
    unit.defenseBonus = terrain.defenseBonus;

    events.push({
      turn: state.turn,
      timestamp: new Date().toISOString(),
      playerId,
      action: 'move',
      unitId: cmd.unitId,
      from,
      to: { ...unit.position },
    });
  }

  for (const { playerId, cmd, faction } of attackCmds) {
    if (!cmd.target) continue;
    const unitIdx = newUnits.findIndex(u => u.unitId === cmd.unitId && u.faction === faction);
    if (unitIdx === -1) continue;
    const attacker = newUnits[unitIdx];
    const validation = validateAttack(attacker, cmd.target, terrains, newUnits, faction);
    if (!validation.valid || !validation.defender) continue;

    const defenderIdx = newUnits.findIndex(u => u.unitId === validation.defender!.unitId);
    const defender = newUnits[defenderIdx];
    const from = { ...attacker.position };
    const damage = calculateDamage(attacker, defender, terrains);
    defender.strength = Math.max(0, defender.strength - damage);

    const eliminated = defender.strength <= 0;
    if (eliminated) {
      defender.status = 'destroyed';
      if (faction === 'red') {
        redScore += 10;
      } else {
        blueScore += 10;
      }
    }

    events.push({
      turn: state.turn,
      timestamp: new Date().toISOString(),
      playerId,
      action: 'attack',
      unitId: cmd.unitId,
      from,
      to: { ...defender.position },
      result: { damage, eliminated },
    });
  }

  const activeRed = newUnits.filter(u => u.faction === 'red' && u.status === 'active').length;
  const activeBlue = newUnits.filter(u => u.faction === 'blue' && u.status === 'active').length;

  let phase = state.phase;
  if (activeRed === 0 || activeBlue === 0) {
    phase = 'finished';
  }

  const newState: GameState = {
    turn: state.turn + 1,
    phase,
    units: newUnits,
    redScore,
    blueScore,
  };

  return { events, newState };
}

export { hexDistance };
