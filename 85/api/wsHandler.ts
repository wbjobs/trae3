import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { ClientMessage, ServerMessage, Faction, LogEntry, GameState, TacticalPlan } from '../shared/types.js';
import { encodeMessage, decodeMessage, computeDelta, computeStateHash } from '../shared/serializer.js';
import {
  joinRoom,
  submitCommands,
  confirmTurn,
  playerReady,
  deployUnits,
  setBroadcastFn,
  getRoom,
  getGameState,
  getMapConfig,
  loadTacticalPlan,
} from './roomManager.js';
import {
  saveTacticalPlan,
  getTacticalPlan,
  listTacticalPlans,
  deleteTacticalPlan,
} from './database.js';

interface ClientConnection {
  ws: WebSocket;
  playerId: string;
  playerName: string;
  roomId: string | null;
  faction: Faction | 'none';
  lastSentState: GameState | null;
}

const clients = new Map<WebSocket, ClientConnection>();
const messageQueue = new Map<string, { message: ServerMessage; timestamp: number }[]>();
const MESSAGE_QUEUE_LIMIT = 100;
const DEBOUNCE_MS = 50;
const broadcastTimers = new Map<string, ReturnType<typeof setTimeout>>();

function enqueueMessage(roomId: string, message: ServerMessage): void {
  if (!messageQueue.has(roomId)) {
    messageQueue.set(roomId, []);
  }
  const queue = messageQueue.get(roomId)!;
  queue.push({ message, timestamp: Date.now() });
  if (queue.length > MESSAGE_QUEUE_LIMIT) {
    queue.shift();
  }

  if (broadcastTimers.has(roomId)) {
    clearTimeout(broadcastTimers.get(roomId)!);
  }

  broadcastTimers.set(roomId, setTimeout(() => {
    flushQueue(roomId);
  }, DEBOUNCE_MS));
}

function flushQueue(roomId: string): void {
  const queue = messageQueue.get(roomId);
  if (!queue || queue.length === 0) return;

  const stateMsg = queue.find(q =>
    q.message.type === 'sync' || q.message.type === 'turn_result' || q.message.type === 'game_over'
  );

  if (stateMsg) {
    broadcastImmediate(roomId, stateMsg.message);
  } else {
    for (const q of queue) {
      broadcastImmediate(roomId, q.message);
    }
  }

  messageQueue.set(roomId, []);
  broadcastTimers.delete(roomId);
}

function broadcastImmediate(roomId: string, message: ServerMessage): void {
  for (const [ws, client] of clients) {
    if (client.roomId === roomId && ws.readyState === WebSocket.OPEN) {
      let msgToSend: ServerMessage = message;
      
      if (message.type === 'sync' || message.type === 'turn_result' || message.type === 'game_over') {
        const state = message.type === 'sync' ? message.state : 
                      message.type === 'turn_result' ? message.state : message.state;
        
        const delta = computeDelta(client.lastSentState, state);
        const deltaMsg: ServerMessage = {
          type: 'delta_sync',
          delta,
          hash: computeStateHash(state),
        };
        
        const fullSize = encodeMessage(message).length;
        const deltaSize = encodeMessage(deltaMsg).length;
        
        if (deltaSize < fullSize * 0.7) {
          msgToSend = deltaMsg;
        }
        
        client.lastSentState = { ...state, units: state.units.map(u => ({ ...u, position: { ...u.position } })) };
      }
      
      ws.send(encodeMessage(msgToSend));
    }
  }
}

function broadcastToRoom(roomId: string, message: ServerMessage): void {
  enqueueMessage(roomId, message);
}

function sendSyncToClient(ws: WebSocket, roomId: string): void {
  const client = clients.get(ws);
  if (!client) return;

  const room = getRoom(roomId);
  const gameState = getGameState(roomId);
  const mapConfig = getMapConfig(roomId);

  if (room) {
    ws.send(encodeMessage({ type: 'room_state', state: room }));
  }
  if (gameState) {
    let msgToSend: ServerMessage;
    const delta = computeDelta(client.lastSentState, gameState);
    const deltaMsg: ServerMessage = {
      type: 'delta_sync',
      delta,
      hash: computeStateHash(gameState),
    };
    
    const fullMsg: ServerMessage = { type: 'sync', state: gameState };
    const fullSize = encodeMessage(fullMsg).length;
    const deltaSize = encodeMessage(deltaMsg).length;
    
    if (deltaSize < fullSize * 0.7) {
      msgToSend = deltaMsg;
    } else {
      msgToSend = fullMsg;
    }
    
    client.lastSentState = { ...gameState, units: gameState.units.map(u => ({ ...u, position: { ...u.position } })) };
    ws.send(encodeMessage(msgToSend));
  }
  if (mapConfig) {
    ws.send(encodeMessage({ type: 'map_config', config: mapConfig }));
  }
}

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  setBroadcastFn(broadcastToRoom);

  wss.on('connection', (ws: WebSocket) => {
    const client: ClientConnection = {
      ws,
      playerId: '',
      playerName: '',
      roomId: null,
      faction: 'none',
      lastSentState: null,
    };
    clients.set(ws, client);

    ws.on('message', (raw: Buffer) => {
      let message: ClientMessage;
      try {
        message = decodeMessage(raw.toString()) as ClientMessage;
      } catch {
        ws.send(encodeMessage({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      handleMessage(ws, client, message);
    });

    ws.on('close', () => {
      if (client.roomId) {
        broadcastToRoom(client.roomId, {
          type: 'log',
          entry: {
            timestamp: new Date().toISOString(),
            playerId: 'system',
            playerName: '系统',
            faction: client.faction !== 'none' ? client.faction : 'red',
            content: `${client.playerName} 已离开`,
          },
        });
      }
      clients.delete(ws);
    });
  });
}

function handleMessage(ws: WebSocket, client: ClientConnection, message: ClientMessage): void {
  switch (message.type) {
    case 'join': {
      client.playerId = message.playerId;
      client.playerName = message.playerName;
      client.roomId = message.roomId;
      client.faction = message.faction;

      const result = joinRoom(message.roomId, message.playerId, message.playerName, message.faction);
      if (!result.success) {
        ws.send(encodeMessage({ type: 'error', message: result.error }));
        return;
      }

      sendSyncToClient(ws, message.roomId);

      broadcastToRoom(message.roomId, {
        type: 'player_joined',
        player: {
          playerId: message.playerId,
          name: message.playerName,
          role: 'commander',
          faction: message.faction,
        },
      });

      broadcastToRoom(message.roomId, {
        type: 'log',
        entry: {
          timestamp: new Date().toISOString(),
          playerId: message.playerId,
          playerName: message.playerName,
          faction: message.faction,
          content: `${message.playerName} (${message.faction === 'red' ? '红方' : '蓝方'}) 加入对局`,
        },
      });
      break;
    }

    case 'deploy': {
      if (!client.roomId || client.faction === 'none') {
        ws.send(encodeMessage({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const result = deployUnits(client.roomId, client.faction as Faction, message.units);
      if (!result.success) {
        ws.send(encodeMessage({ type: 'error', message: result.error }));
      } else {
        broadcastToRoom(client.roomId, {
          type: 'log',
          entry: {
            timestamp: new Date().toISOString(),
            playerId: client.playerId,
            playerName: client.playerName,
            faction: client.faction as Faction,
            content: `${client.playerName} 完成兵力部署`,
          },
        });
      }
      break;
    }

    case 'command': {
      if (!client.roomId) {
        ws.send(encodeMessage({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const result = submitCommands(client.roomId, client.playerId, message.commands);
      if (!result.success) {
        ws.send(encodeMessage({ type: 'error', message: result.error }));
      }
      break;
    }

    case 'confirm_turn': {
      if (!client.roomId) {
        ws.send(encodeMessage({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const result = confirmTurn(client.roomId, client.playerId, message.turn);
      if (!result.success) {
        ws.send(encodeMessage({ type: 'error', message: result.error }));
      } else {
        broadcastToRoom(client.roomId, {
          type: 'log',
          entry: {
            timestamp: new Date().toISOString(),
            playerId: client.playerId,
            playerName: client.playerName,
            faction: client.faction as Faction,
            content: `${client.playerName} 确认第 ${message.turn} 回合指令`,
          },
        });
      }
      break;
    }

    case 'ready': {
      if (!client.roomId) {
        ws.send(encodeMessage({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const result = playerReady(client.roomId, client.playerId);
      if (!result.success) {
        ws.send(encodeMessage({ type: 'error', message: result.error }));
      } else {
        broadcastToRoom(client.roomId, {
          type: 'log',
          entry: {
            timestamp: new Date().toISOString(),
            playerId: client.playerId,
            playerName: client.playerName,
            faction: client.faction as Faction,
            content: `${client.playerName} 已准备`,
          },
        });
      }
      break;
    }

    case 'chat': {
      if (!client.roomId) {
        ws.send(encodeMessage({ type: 'error', message: 'Not in a room' }));
        return;
      }
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        playerId: client.playerId,
        playerName: client.playerName,
        faction: client.faction as Faction,
        content: message.message,
      };
      broadcastToRoom(client.roomId, { type: 'log', entry });
      break;
    }

    case 'save_plan': {
      try {
        const plan = saveTacticalPlan(message.plan);
        ws.send(encodeMessage({ type: 'plan_saved', plan }));
        broadcastToRoom(client.roomId || '', {
          type: 'log',
          entry: {
            timestamp: new Date().toISOString(),
            playerId: client.playerId,
            playerName: client.playerName,
            faction: client.faction as Faction,
            content: `${client.playerName} 保存了战术方案: ${plan.name}`,
          },
        });
      } catch (e) {
        console.error('Save plan error:', e);
        ws.send(encodeMessage({ type: 'error', message: 'Failed to save plan' }));
      }
      break;
    }

    case 'load_plan': {
      try {
        const plan = getTacticalPlan(message.planId);
        if (!plan) {
          ws.send(encodeMessage({ type: 'error', message: 'Plan not found' }));
          return;
        }
        if (client.roomId && client.faction !== 'none') {
          const commands = loadTacticalPlan(client.roomId, message.planId, client.playerId);
          ws.send(encodeMessage({ type: 'plan_loaded', plan }));
          if (commands.length > 0) {
            submitCommands(client.roomId, client.playerId, commands);
          }
        } else {
          ws.send(encodeMessage({ type: 'plan_loaded', plan }));
        }
      } catch (e) {
        console.error('Load plan error:', e);
        ws.send(encodeMessage({ type: 'error', message: 'Failed to load plan' }));
      }
      break;
    }

    case 'delete_plan': {
      try {
        const deleted = deleteTacticalPlan(message.planId);
        if (!deleted) {
          ws.send(encodeMessage({ type: 'error', message: 'Plan not found' }));
          return;
        }
        ws.send(encodeMessage({ type: 'plan_deleted', planId: message.planId }));
      } catch (e) {
        console.error('Delete plan error:', e);
        ws.send(encodeMessage({ type: 'error', message: 'Failed to delete plan' }));
      }
      break;
    }

    case 'list_plans': {
      try {
        const plans = listTacticalPlans(message.faction, message.mapId);
        ws.send(encodeMessage({ type: 'plans_list', plans }));
      } catch (e) {
        console.error('List plans error:', e);
        ws.send(encodeMessage({ type: 'error', message: 'Failed to list plans' }));
      }
      break;
    }
  }
}
