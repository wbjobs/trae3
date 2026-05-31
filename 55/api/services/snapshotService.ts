import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";
import type { GameState, GameSnapshot } from "../../shared/types.js";
import { getGameState, persistGameState } from "./gameService.js";

export function createSnapshot(gameId: string, name: string): GameSnapshot | null {
  const state = getGameState(gameId);
  if (!state) return null;

  const snapshotId = uuidv4();
  const stateData = JSON.stringify(state);

  const insert = db.prepare(`
    INSERT INTO game_snapshots (id, game_id, name, turn, phase, state_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insert.run(snapshotId, gameId, name, state.currentTurn, state.phase, stateData);

  return {
    id: snapshotId,
    gameId,
    name,
    turn: state.currentTurn,
    phase: state.phase,
    stateData,
    createdAt: new Date().toISOString(),
  };
}

export function getSnapshots(gameId: string): GameSnapshot[] {
  const stmt = db.prepare(`
    SELECT id, game_id as gameId, name, turn, phase, state_data as stateData, created_at as createdAt
    FROM game_snapshots
    WHERE game_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `);

  return stmt.all(gameId) as GameSnapshot[];
}

export function getSnapshot(snapshotId: string): GameSnapshot | null {
  const stmt = db.prepare(`
    SELECT id, game_id as gameId, name, turn, phase, state_data as stateData, created_at as createdAt
    FROM game_snapshots
    WHERE id = ?
  `);

  return stmt.get(snapshotId) as GameSnapshot | null;
}

export function restoreSnapshot(snapshotId: string): GameState | null {
  const snapshot = getSnapshot(snapshotId);
  if (!snapshot) return null;

  let state: GameState;
  try {
    state = JSON.parse(snapshot.stateData);
  } catch {
    return null;
  }

  persistGameState(state);

  return state;
}

export function deleteSnapshot(snapshotId: string): boolean {
  const stmt = db.prepare("DELETE FROM game_snapshots WHERE id = ?");
  const result = stmt.run(snapshotId);
  return result.changes > 0;
}

export function cleanupOldSnapshots(gameId: string, keepLast: number = 50): number {
  const stmt = db.prepare(`
    DELETE FROM game_snapshots
    WHERE game_id = ? AND id NOT IN (
      SELECT id FROM game_snapshots
      WHERE game_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    )
  `);

  const result = stmt.run(gameId, gameId, keepLast);
  return result.changes;
}
