import type { GameState, GameStateDiff, Unit, Player } from "../../shared/types.js";

interface GameStateCache {
  [gameId: string]: {
    state: GameState;
    timestamp: number;
  };
}

const stateCache: GameStateCache = {};

export function cacheGameState(state: GameState): void {
  stateCache[state.id] = {
    state: JSON.parse(JSON.stringify(state)),
    timestamp: Date.now(),
  };
}

export function getCachedState(gameId: string): GameState | null {
  return stateCache[gameId]?.state || null;
}

export function computeStateDiff(
  newState: GameState,
  oldState: GameState
): GameStateDiff {
  const diff: GameStateDiff = {
    id: newState.id,
  };

  if (newState.currentTurn !== oldState.currentTurn) {
    diff.currentTurn = newState.currentTurn;
  }
  if (newState.phase !== oldState.phase) {
    diff.phase = newState.phase;
  }
  if (newState.status !== oldState.status) {
    diff.status = newState.status;
  }

  const changedUnits: Partial<Unit>[] = [];
  for (const newUnit of newState.units) {
    const oldUnit = oldState.units.find((u) => u.id === newUnit.id);
    if (!oldUnit) {
      changedUnits.push(newUnit);
      continue;
    }
    if (
      newUnit.hp !== oldUnit.hp ||
      newUnit.status !== oldUnit.status ||
      newUnit.moved !== oldUnit.moved ||
      newUnit.attacked !== oldUnit.attacked ||
      newUnit.position.q !== oldUnit.position.q ||
      newUnit.position.r !== oldUnit.position.r
    ) {
      changedUnits.push({
        id: newUnit.id,
        hp: newUnit.hp,
        status: newUnit.status,
        moved: newUnit.moved,
        attacked: newUnit.attacked,
        position: newUnit.position,
      });
    }
  }

  if (changedUnits.length > 0) {
    diff.units = changedUnits;
  }

  const changedPlayers: Partial<Player>[] = [];
  for (const newPlayer of newState.players) {
    const oldPlayer = oldState.players.find((p) => p.id === newPlayer.id);
    if (!oldPlayer || newPlayer.isReady !== oldPlayer.isReady) {
      changedPlayers.push({
        id: newPlayer.id,
        isReady: newPlayer.isReady,
      });
    }
  }

  if (changedPlayers.length > 0) {
    diff.players = changedPlayers;
  }

  return diff;
}

export function applyStateDiff(
  baseState: GameState,
  diff: GameStateDiff
): GameState {
  const newState: GameState = JSON.parse(JSON.stringify(baseState));

  if (diff.currentTurn !== undefined) {
    newState.currentTurn = diff.currentTurn;
  }
  if (diff.phase !== undefined) {
    newState.phase = diff.phase;
  }
  if (diff.status !== undefined) {
    newState.status = diff.status;
  }

  if (diff.units) {
    for (const unitDiff of diff.units) {
      const existingUnit = newState.units.find((u) => u.id === unitDiff.id);
      if (existingUnit) {
        Object.assign(existingUnit, unitDiff);
      } else if (unitDiff.id && unitDiff.type) {
        newState.units.push(unitDiff as Unit);
      }
    }
  }

  if (diff.players) {
    for (const playerDiff of diff.players) {
      const existingPlayer = newState.players.find((p) => p.id === playerDiff.id);
      if (existingPlayer) {
        Object.assign(existingPlayer, playerDiff);
      }
    }
  }

  return newState;
}

export function estimateDiffSize(diff: GameStateDiff, fullState: GameState): number {
  const diffSize = JSON.stringify(diff).length;
  const fullSize = JSON.stringify(fullState).length;
  return Math.round((1 - diffSize / fullSize) * 100);
}
