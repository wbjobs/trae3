import type { GameState, DeltaGameState, DeltaUnit, ServerMessage, ClientMessage, Position, UnitState } from './types.js';

const SHORT_FIELD_MAP: Record<string, string> = {
  type: 'ty',
  unitId: 'u',
  position: 'p',
  strength: 's',
  status: 'st',
  faction: 'f',
  turn: 't',
  phase: 'ph',
  units: 'us',
  x: 'x',
  y: 'y',
  state: 'sta',
  config: 'c',
  mapConfig: 'mc',
  initialState: 'is',
  events: 'ev',
  delta: 'd',
  hash: 'h',
  player: 'pl',
  entry: 'e',
  result: 'r',
  message: 'm',
  roomId: 'rid',
  playerId: 'pid',
  playerName: 'pn',
  name: 'n',
  role: 'ro',
  room_state: 'rs',
  map_config: 'mc',
  game_start: 'gs',
  turn_result: 'tr',
  sync: 'sy',
  delta_sync: 'ds',
  player_joined: 'pj',
  log: 'lg',
  game_over: 'go',
  error: 'er',
  join: 'j',
  deploy: 'dp',
  command: 'cmd',
  confirm_turn: 'ct',
  ready: 'rd',
  chat: 'ch',
  commands: 'cmds',
  action: 'a',
  target: 'tg',
  targetUnitId: 'tuid',
  timestamp: 'ts',
  content: 'cnt',
  unitType: 'ut',
  maxStrength: 'ms',
  defenseBonus: 'db',
  redScore: 'rs',
  blueScore: 'bs',
};

const REVERSE_FIELD_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SHORT_FIELD_MAP).map(([k, v]) => [v, k])
);

export function computeStateHash(state: GameState): number {
  let hash = 17;
  hash = hash * 31 + state.turn;
  hash = hash * 31 + state.phase.length;
  hash = hash * 31 + state.units.length;
  for (const unit of state.units) {
    hash = hash * 31 + unit.unitId.length;
    for (let i = 0; i < unit.unitId.length; i++) {
      hash = hash * 31 + unit.unitId.charCodeAt(i);
    }
    hash = hash * 31 + unit.position.x;
    hash = hash * 31 + unit.position.y;
    hash = hash * 31 + unit.strength;
    hash = hash * 31 + unit.status.length;
  }
  hash = hash * 31 + state.redScore;
  hash = hash * 31 + state.blueScore;
  return hash | 0;
}

export function computeDelta(prevState: GameState | null, newState: GameState): DeltaGameState {
  const delta: DeltaGameState = { units: [] };

  if (!prevState) {
    delta.turn = newState.turn;
    delta.units = newState.units.map(u => ({
      unitId: u.unitId,
      position: { ...u.position },
      strength: u.strength,
      status: u.status,
    }));
    return delta;
  }

  if (prevState.turn !== newState.turn) {
    delta.turn = newState.turn;
  }

  const prevUnits = new Map(prevState.units.map(u => [u.unitId, u]));

  for (const newUnit of newState.units) {
    const prevUnit = prevUnits.get(newUnit.unitId);
    if (!prevUnit) {
      delta.units.push({
        unitId: newUnit.unitId,
        position: { ...newUnit.position },
        strength: newUnit.strength,
        status: newUnit.status,
      });
      continue;
    }

    const deltaUnit: DeltaUnit = { unitId: newUnit.unitId };
    let changed = false;

    if (prevUnit.position.x !== newUnit.position.x || prevUnit.position.y !== newUnit.position.y) {
      deltaUnit.position = { ...newUnit.position };
      changed = true;
    }

    if (prevUnit.strength !== newUnit.strength) {
      deltaUnit.strength = newUnit.strength;
      changed = true;
    }

    if (prevUnit.status !== newUnit.status) {
      deltaUnit.status = newUnit.status;
      changed = true;
    }

    if (changed) {
      delta.units.push(deltaUnit);
    }
  }

  return delta;
}

export function applyDelta(baseState: GameState, delta: DeltaGameState): GameState {
  const newState: GameState = {
    ...baseState,
    units: baseState.units.map(u => ({ ...u, position: { ...u.position } })),
  };

  if (delta.turn !== undefined) {
    newState.turn = delta.turn;
  }

  const unitMap = new Map(newState.units.map(u => [u.unitId, u]));

  for (const deltaUnit of delta.units) {
    const unit = unitMap.get(deltaUnit.unitId);
    if (!unit) continue;

    if (deltaUnit.position) {
      unit.position = { ...deltaUnit.position };
    }
    if (deltaUnit.strength !== undefined) {
      unit.strength = deltaUnit.strength;
    }
    if (deltaUnit.status) {
      unit.status = deltaUnit.status;
    }
  }

  return newState;
}

function transformKeys(obj: any, map: Record<string, string>): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => transformKeys(item, map));
  if (typeof obj !== 'object') return obj;

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = map[key] || key;
    result[newKey] = transformKeys(value, map);
  }
  return result;
}

export function encodeMessage(msg: ServerMessage | ClientMessage): string {
  const transformed = transformKeys(msg, SHORT_FIELD_MAP);
  return JSON.stringify(transformed);
}

export function decodeMessage(data: string): ServerMessage | ClientMessage {
  const parsed = JSON.parse(data);
  return transformKeys(parsed, REVERSE_FIELD_MAP);
}
