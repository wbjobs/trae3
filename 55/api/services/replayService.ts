import { db } from "../database.js";
import { v4 as uuidv4 } from "uuid";
import type { TurnResult, BattleResult, MovementAction, GameEvent } from "../../shared/types.js";

export function recordTurn(gameId: string, turnResult: TurnResult): void {
  const existingTurn = db
    .prepare("SELECT id FROM turns WHERE game_id = ? AND turn_number = ?")
    .get(gameId, turnResult.turn) as any;

  let turnId: string;

  if (existingTurn) {
    turnId = existingTurn.id;
    db.prepare("DELETE FROM turn_events WHERE turn_id = ?").run(turnId);
    db.prepare(
      "UPDATE turns SET phase = ?, ended_at = datetime('now') WHERE id = ?"
    ).run(turnResult.phase, turnId);
  } else {
    turnId = uuidv4();
    db.prepare(
      "INSERT INTO turns (id, game_id, turn_number, phase, started_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).run(turnId, gameId, turnResult.turn, turnResult.phase);
  }

  const insertEvent = db.prepare(
    "INSERT INTO turn_events (id, turn_id, type, description, timestamp, data) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    for (const movement of turnResult.movements) {
      insertEvent.run(
        uuidv4(),
        turnId,
        "movement",
        `单位${movement.unitId}从(${movement.from.q},${movement.from.r})移动到(${movement.to.q},${movement.to.r})`,
        Date.now(),
        JSON.stringify(movement)
      );
    }

    for (const battle of turnResult.battles) {
      insertEvent.run(
        uuidv4(),
        turnId,
        "battle",
        `${battle.attackerId}攻击${battle.defenderId}，造成${battle.damageDealt}伤害`,
        Date.now(),
        JSON.stringify(battle)
      );
    }

    for (const event of turnResult.events) {
      insertEvent.run(
        uuidv4(),
        turnId,
        event.type,
        event.description,
        event.timestamp,
        event.data ? JSON.stringify(event.data) : null
      );
    }
  });

  transaction();

  if (!existingTurn) {
    db.prepare("UPDATE turns SET ended_at = datetime('now') WHERE id = ?").run(turnId);
  }
}

export function getReplay(gameId: string): TurnResult[] {
  const turns = db
    .prepare("SELECT * FROM turns WHERE game_id = ? ORDER BY turn_number")
    .all(gameId) as any[];

  return turns.map((t) => {
    const events = db
      .prepare("SELECT * FROM turn_events WHERE turn_id = ? ORDER BY timestamp")
      .all(t.id) as any[];

    const movements: MovementAction[] = [];
    const battles: BattleResult[] = [];
    const gameEvents: GameEvent[] = [];

    for (const e of events) {
      try {
        const parsed = e.data ? JSON.parse(e.data) : null;
        if (e.type === "movement" && parsed) {
          movements.push(parsed as MovementAction);
        } else if (e.type === "battle" && parsed) {
          battles.push(parsed as BattleResult);
        } else {
          gameEvents.push({
            type: e.type as GameEvent["type"],
            description: e.description,
            timestamp: e.timestamp,
            data: parsed,
          });
        }
      } catch {
        gameEvents.push({
          type: e.type as GameEvent["type"],
          description: e.description,
          timestamp: e.timestamp,
        });
      }
    }

    return {
      turn: t.turn_number,
      phase: t.phase as TurnResult["phase"],
      movements,
      battles,
      events: gameEvents,
    };
  });
}
