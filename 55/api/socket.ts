import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameCommand,
  Phase,
  GameStateDiff,
} from "../shared/types.js";
import {
  joinGame,
  getGameState,
  playerReady,
  processCommand,
} from "./services/gameService.js";
import { recordTurn } from "./services/replayService.js";
import {
  cacheGameState,
  getCachedState,
  computeStateDiff,
} from "./utils/diff.js";

interface InterServerEvents {}
interface SocketData {
  gameId?: string;
  playerId?: string;
  playerName?: string;
  faction?: string;
}

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

const turnTracker = new Map<
  string,
  {
    turn: number;
    phase: Phase;
    movements: { unitId: string; from: { q: number; r: number }; to: { q: number; r: number } }[];
    battles: any[];
    events: any[];
  }
>();

function getTracker(gameId: string, turn: number, phase: Phase) {
  const existing = turnTracker.get(gameId);
  if (existing && existing.turn === turn) return existing;
  const newTracker = { turn, phase, movements: [], battles: [], events: [] };
  turnTracker.set(gameId, newTracker);
  return newTracker;
}

function flushTracker(gameId: string): void {
  const tracker = turnTracker.get(gameId);
  if (!tracker) return;
  if (tracker.movements.length > 0 || tracker.battles.length > 0 || tracker.events.length > 0) {
    recordTurn(gameId, {
      turn: tracker.turn,
      phase: tracker.phase,
      movements: tracker.movements,
      battles: tracker.battles,
      events: tracker.events,
    });
  }
  turnTracker.delete(gameId);
}

function broadcastGameState(io: TypedServer, gameId: string, forceFull: boolean = false): void {
  const newState = getGameState(gameId);
  if (!newState) return;

  const oldState = getCachedState(gameId);

  if (forceFull || !oldState) {
    io.to(gameId).emit("game:state", newState);
    io.to(gameId).emit("game:phaseChange", newState.phase);
    cacheGameState(newState);
    return;
  }

  const diff = computeStateDiff(newState, oldState);

  if (diff.units?.length || diff.players?.length || diff.currentTurn !== undefined || diff.phase !== undefined) {
    io.to(gameId).emit("game:stateDiff", diff);
  }

  if (diff.phase) {
    io.to(gameId).emit("game:phaseChange", diff.phase);
  }

  cacheGameState(newState);
}

export function setupSocket(io: TypedServer): void {
  io.on("connection", (socket: TypedSocket) => {
    socket.on("game:join", (gameId: string) => {
      try {
        const gameState = getGameState(gameId);
        if (!gameState) {
          socket.emit("game:error", { code: "NOT_FOUND", message: "对局不存在" });
          return;
        }

        if (socket.data.gameId && socket.data.gameId !== gameId) {
          socket.leave(socket.data.gameId);
        }

        const playerName = socket.data.playerName || `玩家${socket.id.slice(0, 4)}`;

        if (!socket.data.playerId || socket.data.gameId !== gameId) {
          const existingPlayer = gameState.players.find(
            (p) => p.name === playerName
          );

          if (existingPlayer) {
            socket.data.playerId = existingPlayer.id;
            socket.data.faction = existingPlayer.faction;
          } else {
            try {
              const result = joinGame(gameId, playerName);
              socket.data.playerId = result.playerId;
              socket.data.faction = result.faction;

              const updatedState = getGameState(gameId)!;
              socket.to(gameId).emit("game:playerJoined", result.playerId, playerName, result.faction);
              io.to(gameId).emit("game:state", updatedState);
            } catch (err: any) {
              socket.emit("game:error", { code: "JOIN_FAILED", message: err.message });
              return;
            }
          }
        }

        socket.data.gameId = gameId;
        socket.join(gameId);

        const currentState = getGameState(gameId)!;
        socket.emit("game:state", currentState);
        socket.emit("game:phaseChange", currentState.phase);
      } catch (err: any) {
        socket.emit("game:error", { code: "JOIN_ERROR", message: err.message });
      }
    });

    socket.on("game:leave", (gameId: string) => {
      socket.leave(gameId);
      if (socket.data.gameId === gameId) {
        socket.to(gameId).emit("game:playerLeft", socket.data.playerId || socket.id);
        socket.data.gameId = undefined;
        socket.data.playerId = undefined;
        socket.data.faction = undefined;
      }
    });

    socket.on("game:command", (command: GameCommand) => {
      try {
        const gameId = socket.data.gameId;
        const playerId = socket.data.playerId;
        if (!gameId || !playerId) {
          socket.emit("game:error", { code: "NOT_IN_GAME", message: "未加入对局" });
          return;
        }

        const beforeState = getGameState(gameId);
        if (!beforeState) {
          socket.emit("game:error", { code: "NOT_FOUND", message: "对局不存在" });
          return;
        }

        const tracker = getTracker(gameId, beforeState.currentTurn, beforeState.phase);

        const result = processCommand(gameId, playerId, command);

        if (result.movement) {
          tracker.movements.push(result.movement);
        }
        if (result.battle) {
          tracker.battles.push(result.battle);
        }
        if (result.events.length > 0) {
          tracker.events.push(...result.events);
        }

        const afterState = getGameState(gameId)!;
        io.to(gameId).emit("game:state", afterState);
        io.to(gameId).emit("game:phaseChange", afterState.phase);

        if (result.battle) {
          io.to(gameId).emit("game:turnResult", {
            turn: afterState.currentTurn,
            phase: afterState.phase,
            movements: tracker.movements,
            battles: tracker.battles,
            events: tracker.events,
          });
        }

        if (afterState.status === "finished") {
          flushTracker(gameId);
        }
      } catch (err: any) {
        socket.emit("game:error", { code: "COMMAND_FAILED", message: err.message });
      }
    });

    socket.on("game:ready", (gameId: string) => {
      try {
        const playerId = socket.data.playerId;
        if (!playerId) {
          socket.emit("game:error", { code: "NOT_IN_GAME", message: "未加入对局" });
          return;
        }

        const beforeState = getGameState(gameId);
        if (!beforeState) {
          socket.emit("game:error", { code: "NOT_FOUND", message: "对局不存在" });
          return;
        }

        const result = playerReady(gameId, playerId);

        broadcastGameState(io, gameId);

        if (result.gameState.status === "playing" && beforeState.status === "waiting") {
          io.to(gameId).emit("game:phaseChange", result.gameState.phase);
        }

        const game = result.gameState;
        if (game.phase === "move" && beforeState.phase === "settle" && game.status !== "finished") {
          flushTracker(gameId);
        }

        if (game.status === "finished") {
          flushTracker(gameId);
        }
      } catch (err: any) {
        socket.emit("game:error", { code: "READY_FAILED", message: err.message });
      }
    });

    socket.on("chat:message", (gameId: string, message: string) => {
      const senderId = socket.data.playerId || socket.id;
      const senderName = socket.data.playerName || `玩家${socket.id.slice(0, 4)}`;
      io.to(gameId).emit("chat:message", senderId, senderName, message);
    });

    socket.on("disconnect", () => {
      if (socket.data.gameId) {
        socket.to(socket.data.gameId).emit("game:playerLeft", socket.data.playerId || socket.id);
      }
    });
  });
}
