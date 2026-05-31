import type { Server, Socket } from 'socket.io';
import type {
  JoinRoomMessage,
  LeaveRoomMessage,
  MoveUnitMessage,
  AttackUnitMessage,
  EndTurnMessage,
  ChatMessage,
  Player,
  Position,
  GameState,
  TacticalPlan,
  GameReplay,
  IncrementalStateUpdate
} from '../shared/types';
import { SocketEvent, ActionType } from '../shared/types';
import { GameStatus } from '../shared/constants';
import { generateId, deepClone } from '../shared/utils';
import { logger } from './logger';
import type { GameManager } from './gameManager';
import type { StateSyncService } from './stateSync';
import type { DatabaseManager } from './database';

type AckCallback<T = any> = (response: T) => void;

function safeAck(ack: unknown, response: any): void {
  if (typeof ack === 'function') {
    try {
      ack(response);
    } catch (error) {
      logger.error('Ack callback error', { error: error as Error });
    }
  }
}

function serializeGameState(state: GameState): any {
  return {
    ...state,
    createdAt: state.createdAt instanceof Date ? state.createdAt.toISOString() : state.createdAt,
    updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt
  };
}

function serializeTacticalPlan(plan: TacticalPlan): any {
  return {
    ...plan,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString()
  };
}

function serializeGameReplay(replay: GameReplay): any {
  return {
    ...replay,
    initialState: serializeGameState(replay.initialState),
    recordedAt: replay.recordedAt.toISOString()
  };
}

export function createSocketHandler(
  io: Server,
  gameManager: GameManager,
  stateSync: StateSyncService,
  database: DatabaseManager
): (socket: Socket) => void {
  return (socket: Socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on(SocketEvent.CREATE_GAME, async (
      data: { name: string; playerName: string; team: string },
      ack?: AckCallback
    ) => {
      try {
        const { name, playerName, team } = data;

        if (!name || !playerName || !team) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const player: Player = {
          id: generateId(),
          name: playerName,
          socketId: socket.id,
          team,
          isReady: false
        };

        const game = await gameManager.createGame(name, player);
        socket.join(game.id);

        stateSync.broadcastState(game.id, io);
        safeAck(ack, { success: true, game: serializeGameState(game) });

        logger.info('Game created via socket', { gameId: game.id, socketId: socket.id });
      } catch (error) {
        logger.error('Error creating game', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'CREATE_GAME_FAILED',
          message: 'Failed to create game'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.LIST_GAMES, async (
      _data: unknown,
      ack?: AckCallback
    ) => {
      try {
        const games = await gameManager.listGames();
        const serializedGames = games.map(serializeGameState);
        safeAck(ack, { success: true, games: serializedGames });
        logger.debug('Game list sent', { socketId: socket.id, count: games.length });
      } catch (error) {
        logger.error('Error listing games', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'LIST_GAMES_FAILED',
          message: 'Failed to list games'
        };
        safeAck(ack, { success: false, games: [], error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.JOIN_ROOM, async (
      data: JoinRoomMessage,
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerName, team } = data;

        if (!roomId || !playerName) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const player: Player = {
          id: generateId(),
          name: playerName,
          socketId: socket.id,
          team: team || 'BLUE',
          isReady: false
        };

        const result = await gameManager.joinGame(roomId, player);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          socket.emit(SocketEvent.ERROR, {
            code: 'JOIN_FAILED',
            message: result.error
          });
          return;
        }

        socket.join(roomId);
        stateSync.broadcastState(roomId, io);

        safeAck(ack, {
          success: true,
          game: result.game ? serializeGameState(result.game) : null,
          playerId: player.id,
          player
        });

        logger.info('Player joined room', { roomId, playerId: player.id, socketId: socket.id });
      } catch (error) {
        logger.error('Error joining room', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'JOIN_FAILED',
          message: 'Failed to join room'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.LEAVE_ROOM, async (
      data: LeaveRoomMessage,
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId } = data;

        if (!roomId || !playerId) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const result = await gameManager.leaveGame(roomId, playerId);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          return;
        }

        socket.leave(roomId);
        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });

        logger.info('Player left room', { roomId, playerId, socketId: socket.id });
      } catch (error) {
        logger.error('Error leaving room', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'LEAVE_FAILED',
          message: 'Failed to leave room'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.PLAYER_READY, async (
      data: { roomId: string; playerId: string; isReady: boolean },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId, isReady } = data;

        if (!roomId || !playerId) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        await gameManager.playerReady(roomId, playerId, isReady);
        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });

        logger.debug('Player ready status updated', { roomId, playerId, isReady, socketId: socket.id });
      } catch (error) {
        logger.error('Error updating player ready status', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'READY_FAILED',
          message: 'Failed to update ready status'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.GAME_START, async (
      data: { roomId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId } = data;

        if (!roomId) {
          safeAck(ack, { success: false, error: 'Missing roomId' });
          return;
        }

        const result = await gameManager.startGame(roomId);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          socket.emit(SocketEvent.ERROR, {
            code: 'START_FAILED',
            message: result.error
          });
          return;
        }

        stateSync.broadcastState(roomId, io);
        const serializedGame = result.game ? serializeGameState(result.game) : null;

        io.to(roomId).emit(SocketEvent.GAME_START, { success: true, game: serializedGame });
        safeAck(ack, { success: true, game: serializedGame });

        logger.info('Game started via socket', { roomId, socketId: socket.id });
      } catch (error) {
        logger.error('Error starting game', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'START_FAILED',
          message: 'Failed to start game'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.MOVE_UNIT, async (
      data: MoveUnitMessage & { roomId: string; playerId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId, unitId, position } = data;

        if (!roomId || !playerId || !unitId || !position) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const result = await gameManager.handleMove(roomId, playerId, unitId, position as Position);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          socket.emit(SocketEvent.ERROR, {
            code: 'MOVE_FAILED',
            message: result.error
          });
          return;
        }

        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });

        logger.debug('Unit move processed', { roomId, unitId, socketId: socket.id });
      } catch (error) {
        logger.error('Error processing move', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'MOVE_FAILED',
          message: 'Failed to process move'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.ATTACK_UNIT, async (
      data: AttackUnitMessage & { roomId: string; playerId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId, attackerId, targetId } = data;

        if (!roomId || !playerId || !attackerId || !targetId) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const result = await gameManager.handleAttack(roomId, playerId, attackerId, targetId);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          socket.emit(SocketEvent.ERROR, {
            code: 'ATTACK_FAILED',
            message: result.error
          });
          return;
        }

        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });

        logger.debug('Attack processed', { roomId, attackerId, targetId, socketId: socket.id });
      } catch (error) {
        logger.error('Error processing attack', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'ATTACK_FAILED',
          message: 'Failed to process attack'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.END_TURN, async (
      data: EndTurnMessage & { roomId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId } = data;

        if (!roomId || !playerId) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const result = await gameManager.handleEndTurn(roomId, playerId);

        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          socket.emit(SocketEvent.ERROR, {
            code: 'END_TURN_FAILED',
            message: result.error
          });
          return;
        }

        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });

        logger.debug('Turn ended', { roomId, playerId, socketId: socket.id });
      } catch (error) {
        logger.error('Error ending turn', { error: error as Error, socketId: socket.id });
        const errorMsg = {
          code: 'END_TURN_FAILED',
          message: 'Failed to end turn'
        };
        safeAck(ack, { success: false, error: errorMsg.message });
        socket.emit(SocketEvent.ERROR, errorMsg);
      }
    });

    socket.on(SocketEvent.CHAT_MESSAGE, async (
      data: ChatMessage & { roomId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId, content } = data;

        if (!roomId || !playerId || !content) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const message: ChatMessage = {
          playerId,
          content,
          timestamp: new Date()
        };

        io.to(roomId).emit(SocketEvent.CHAT_MESSAGE, {
          ...message,
          timestamp: message.timestamp.toISOString()
        });

        safeAck(ack, { success: true });
        logger.debug('Chat message broadcast', { roomId, playerId, socketId: socket.id });
      } catch (error) {
        logger.error('Error processing chat message', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to send message' });
      }
    });

    socket.on(SocketEvent.REQUEST_FULL_STATE, async (
      data: { roomId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId } = data;
        if (!roomId) {
          safeAck(ack, { success: false, error: 'Missing roomId' });
          return;
        }

        const state = stateSync.getState(roomId);
        if (!state) {
          safeAck(ack, { success: false, error: 'Game not found' });
          return;
        }

        stateSync.sendStateToPlayer(roomId, socket, true);
        safeAck(ack, { success: true });
        logger.debug('Full state sent on request', { roomId, socketId: socket.id });
      } catch (error) {
        logger.error('Error sending full state', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to send state' });
      }
    });

    socket.on(SocketEvent.SAVE_TACTICAL_PLAN, async (
      data: { plan: Partial<TacticalPlan> },
      ack?: AckCallback
    ) => {
      try {
        const { plan } = data;
        if (!plan || !plan.name || !plan.playerId || !plan.deployments) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const savedPlan = await database.saveTacticalPlan(plan as any);
        safeAck(ack, { success: true, plan: serializeTacticalPlan(savedPlan) });
        logger.info('Tactical plan saved', { planId: savedPlan.id, socketId: socket.id });
      } catch (error) {
        logger.error('Error saving tactical plan', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to save plan' });
      }
    });

    socket.on(SocketEvent.LOAD_TACTICAL_PLAN, async (
      data: { planId: string },
      ack?: AckCallback
    ) => {
      try {
        const { planId } = data;
        if (!planId) {
          safeAck(ack, { success: false, error: 'Missing planId' });
          return;
        }

        const plan = await database.getTacticalPlan(planId);
        if (!plan) {
          safeAck(ack, { success: false, error: 'Plan not found' });
          return;
        }

        safeAck(ack, { success: true, plan: serializeTacticalPlan(plan) });
        logger.debug('Tactical plan loaded', { planId, socketId: socket.id });
      } catch (error) {
        logger.error('Error loading tactical plan', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to load plan' });
      }
    });

    socket.on(SocketEvent.LIST_TACTICAL_PLANS, async (
      data: { playerId?: string },
      ack?: AckCallback
    ) => {
      try {
        const plans = await database.listTacticalPlans(data.playerId);
        const serializedPlans = plans.map(serializeTacticalPlan);
        safeAck(ack, { success: true, plans: serializedPlans });
        logger.debug('Tactical plans listed', { count: plans.length, socketId: socket.id });
      } catch (error) {
        logger.error('Error listing tactical plans', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, plans: [], error: 'Failed to list plans' });
      }
    });

    socket.on(SocketEvent.DELETE_TACTICAL_PLAN, async (
      data: { planId: string },
      ack?: AckCallback
    ) => {
      try {
        const { planId } = data;
        if (!planId) {
          safeAck(ack, { success: false, error: 'Missing planId' });
          return;
        }

        const deleted = await database.deleteTacticalPlan(planId);
        safeAck(ack, { success: deleted });
        logger.info('Tactical plan deleted', { planId, success: deleted, socketId: socket.id });
      } catch (error) {
        logger.error('Error deleting tactical plan', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to delete plan' });
      }
    });

    socket.on(SocketEvent.APPLY_TACTICAL_PLAN, async (
      data: { roomId: string; playerId: string; planId: string },
      ack?: AckCallback
    ) => {
      try {
        const { roomId, playerId, planId } = data;
        if (!roomId || !playerId || !planId) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const plan = await database.getTacticalPlan(planId);
        if (!plan) {
          safeAck(ack, { success: false, error: 'Plan not found' });
          return;
        }

        const result = await gameManager.applyTacticalPlan(roomId, playerId, plan);
        if (!result.success) {
          safeAck(ack, { success: false, error: result.error });
          return;
        }

        stateSync.broadcastState(roomId, io);
        safeAck(ack, { success: true });
        logger.info('Tactical plan applied', { roomId, planId, socketId: socket.id });
      } catch (error) {
        logger.error('Error applying tactical plan', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to apply plan' });
      }
    });

    socket.on(SocketEvent.SAVE_REPLAY, async (
      data: { gameId: string; name: string },
      ack?: AckCallback
    ) => {
      try {
        const { gameId, name } = data;
        if (!gameId || !name) {
          safeAck(ack, { success: false, error: 'Missing required fields' });
          return;
        }

        const replay = await gameManager.saveReplay(gameId, name);
        if (!replay) {
          safeAck(ack, { success: false, error: 'Failed to create replay' });
          return;
        }

        const savedReplay = await database.saveReplay(replay);
        safeAck(ack, { success: true, replay: serializeGameReplay(savedReplay) });
        logger.info('Replay saved', { replayId: savedReplay.id, gameId, socketId: socket.id });
      } catch (error) {
        logger.error('Error saving replay', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to save replay' });
      }
    });

    socket.on(SocketEvent.LOAD_REPLAY, async (
      data: { replayId: string },
      ack?: AckCallback
    ) => {
      try {
        const { replayId } = data;
        if (!replayId) {
          safeAck(ack, { success: false, error: 'Missing replayId' });
          return;
        }

        const replay = await database.getReplay(replayId);
        if (!replay) {
          safeAck(ack, { success: false, error: 'Replay not found' });
          return;
        }

        safeAck(ack, { success: true, replay: serializeGameReplay(replay) });
        logger.debug('Replay loaded', { replayId, socketId: socket.id });
      } catch (error) {
        logger.error('Error loading replay', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to load replay' });
      }
    });

    socket.on(SocketEvent.LIST_REPLAYS, async (
      _data: unknown,
      ack?: AckCallback
    ) => {
      try {
        const replays = await database.listReplays();
        const serializedReplays = replays.map(serializeGameReplay);
        safeAck(ack, { success: true, replays: serializedReplays });
        logger.debug('Replays listed', { count: replays.length, socketId: socket.id });
      } catch (error) {
        logger.error('Error listing replays', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, replays: [], error: 'Failed to list replays' });
      }
    });

    socket.on(SocketEvent.DELETE_REPLAY, async (
      data: { replayId: string },
      ack?: AckCallback
    ) => {
      try {
        const { replayId } = data;
        if (!replayId) {
          safeAck(ack, { success: false, error: 'Missing replayId' });
          return;
        }

        const deleted = await database.deleteReplay(replayId);
        safeAck(ack, { success: deleted });
        logger.info('Replay deleted', { replayId, success: deleted, socketId: socket.id });
      } catch (error) {
        logger.error('Error deleting replay', { error: error as Error, socketId: socket.id });
        safeAck(ack, { success: false, error: 'Failed to delete replay' });
      }
    });

    socket.on('disconnect', async () => {
      logger.info('Client disconnected', { socketId: socket.id });

      try {
        const games = await gameManager.listGames();
        for (const game of games) {
          if (game.status === GameStatus.LOBBY) {
            const player = game.players.find(p => p.socketId === socket.id);
            if (player) {
              const result = await gameManager.leaveGame(game.id, player.id);
              if (result.success) {
                stateSync.broadcastState(game.id, io);
                logger.info('Player removed from lobby on disconnect', {
                  gameId: game.id,
                  playerId: player.id,
                  socketId: socket.id
                });
              }
            }
          }
        }

        stateSync.removeClient('*', socket.id);
      } catch (error) {
        logger.error('Error handling disconnect', { error: error as Error, socketId: socket.id });
      }
    });
  };
}
