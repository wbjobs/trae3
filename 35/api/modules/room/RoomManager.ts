import type { Server, Socket } from 'socket.io';
import type { Player, Room, ChatMessage } from '../../../shared/types.js';
import { IDGenerator } from '../../utils/IDGenerator.js';
import { GameInstance } from '../sync/GameInstance.js';
import { PersistenceManager } from '../persistence/PersistenceManager.js';
import { ConfigLoader } from '../../utils/ConfigLoader.js';

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  private gameInstances: Map<string, GameInstance> = new Map();
  private playerRooms: Map<string, string> = new Map();
  private io: Server | null = null;
  private persistenceManager: PersistenceManager | null = null;

  private constructor() {}

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  initialize(io: Server): void {
    this.io = io;
    this.persistenceManager = new PersistenceManager();
    ConfigLoader.load();
    console.log('[RoomManager] 房间管理器已初始化');
  }

  createRoom(
    name: string,
    ownerId: string,
    ownerName: string,
    socketId: string,
    maxPlayers: number = 4,
    mode: 'ffa' | 'team' = 'ffa',
    mapId: string = 'map_01'
  ): Room {
    const roomId = IDGenerator.generateRoomId();
    
    const owner: Player = {
      id: ownerId,
      nickname: ownerName,
      roomId,
      socketId,
      controlledEntities: [],
      isReady: false,
      isOwner: true,
      team: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0
    };

    const room: Room = {
      id: roomId,
      name,
      ownerId,
      players: [owner],
      maxPlayers,
      mode,
      status: 'waiting',
      mapId,
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);
    this.playerRooms.set(ownerId, roomId);

    console.log(`[RoomManager] 房间已创建: ${name} (${roomId})`);
    return room;
  }

  joinRoom(
    roomId: string,
    playerId: string,
    playerName: string,
    socketId: string
  ): { success: boolean; room?: Room; error?: string } {
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.status !== 'waiting') {
      return { success: false, error: '房间游戏已开始' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    if (room.players.some(p => p.id === playerId)) {
      return { success: true, room };
    }

    const player: Player = {
      id: playerId,
      nickname: playerName,
      roomId,
      socketId,
      controlledEntities: [],
      isReady: false,
      isOwner: false,
      team: room.players.length % 2,
      kills: 0,
      deaths: 0,
      damageDealt: 0
    };

    room.players.push(player);
    this.playerRooms.set(playerId, roomId);

    this.io?.to(roomId).emit('player:joined', player);
    console.log(`[RoomManager] 玩家 ${playerName} 加入房间 ${room.name}`);

    return { success: true, room };
  }

  leaveRoom(playerId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;

    const player = room.players[playerIndex];
    room.players.splice(playerIndex, 1);
    this.playerRooms.delete(playerId);

    this.io?.to(roomId).emit('player:left', playerId);

    if (room.players.length === 0) {
      this.destroyRoom(roomId);
    } else if (player.isOwner) {
      room.ownerId = room.players[0].id;
      room.players[0].isOwner = true;
      this.io?.to(roomId).emit('room:ownerChanged', room.ownerId);
    }

    console.log(`[RoomManager] 玩家 ${player.nickname} 离开房间 ${room.name}`);
  }

  setPlayerReady(playerId: string, ready: boolean): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'waiting') return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.isReady = ready;
      this.io?.to(roomId).emit('player:readyChanged', {
        playerId,
        ready
      });
    }
  }

  startGame(roomId: string, ownerId: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    
    if (!room) {
      return { success: false, error: '房间不存在' };
    }

    if (room.ownerId !== ownerId) {
      return { success: false, error: '只有房主可以开始游戏' };
    }

    if (room.players.length < 1) {
      return { success: false, error: '至少需要1名玩家' };
    }

    if (!this.io || !this.persistenceManager) {
      return { success: false, error: '系统未初始化' };
    }

    const gameInstance = new GameInstance(room, this.io, this.persistenceManager);
    this.gameInstances.set(roomId, gameInstance);

    gameInstance.start();

    console.log(`[RoomManager] 游戏已开始，房间: ${room.name}`);
    return { success: true };
  }

  endGame(roomId: string): void {
    const gameInstance = this.gameInstances.get(roomId);
    if (gameInstance) {
      gameInstance.stop();
      this.gameInstances.delete(roomId);
    }

    const room = this.rooms.get(roomId);
    if (room) {
      room.status = 'waiting';
      room.players.forEach(p => {
        p.isReady = false;
        p.kills = 0;
        p.deaths = 0;
        p.damageDealt = 0;
      });
    }
  }

  destroyRoom(roomId: string): void {
    const gameInstance = this.gameInstances.get(roomId);
    if (gameInstance) {
      gameInstance.stop();
      this.gameInstances.delete(roomId);
    }

    const room = this.rooms.get(roomId);
    if (room) {
      room.players.forEach(p => {
        this.playerRooms.delete(p.id);
      });
      this.rooms.delete(roomId);
      console.log(`[RoomManager] 房间已销毁: ${room?.name}`);
    }
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getGameInstance(roomId: string): GameInstance | undefined {
    return this.gameInstances.get(roomId);
  }

  getPlayerRoom(playerId: string): Room | undefined {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getWaitingRooms(): Room[] {
    return this.getAllRooms().filter(r => r.status === 'waiting');
  }

  addChatMessage(playerId: string, content: string): ChatMessage | null {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    const player = room?.players.find(p => p.id === playerId);
    if (!room || !player) return null;

    const message: ChatMessage = {
      id: IDGenerator.generate(),
      playerId,
      nickname: player.nickname,
      content,
      timestamp: Date.now(),
      roomId
    };

    this.io?.to(roomId).emit('chat:message', message);
    return message;
  }

  updatePlayerSocketId(playerId: string, socketId: string): void {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (player) {
      player.socketId = socketId;
    }

    const gameInstance = this.gameInstances.get(roomId);
    if (gameInstance) {
      const socket = this.io?.sockets.sockets.get(socketId);
      if (socket) {
        gameInstance.addPlayerSocket(playerId, socket);
      }
    }
  }

  getPersistenceManager(): PersistenceManager | null {
    return this.persistenceManager;
  }
}
