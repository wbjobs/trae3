import { createServer } from 'http'
import { Server } from 'socket.io'
import app from './app.js'
import { RoomManager } from './modules/room/RoomManager.js'
import type { Socket } from 'socket.io'

const PORT = process.env.PORT || 3001

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
})

RoomManager.getInstance().initialize(io)

const playerSocketMap = new Map<string, Socket>()

io.on('connection', (socket: Socket) => {
  console.log(`[Socket.IO] 客户端连接: ${socket.id}`)
  let currentPlayerId: string | null = null

  socket.on('player:authenticate', (data: { playerId: string; nickname: string }) => {
    currentPlayerId = data.playerId
    playerSocketMap.set(data.playerId, socket)
    RoomManager.getInstance().updatePlayerSocketId(data.playerId, socket.id)
    console.log(`[Socket.IO] 玩家 ${data.nickname} 已认证，socket: ${socket.id}`)
  })

  socket.on('entity:move', (data: { entityId: string; targetX: number; targetY: number }) => {
    if (!currentPlayerId) return

    const room = RoomManager.getInstance().getPlayerRoom(currentPlayerId)
    if (!room || room.status !== 'playing') return

    const gameInstance = RoomManager.getInstance().getGameInstance(room.id)
    if (gameInstance) {
      gameInstance.handlePlayerMove(currentPlayerId, data.entityId, data.targetX, data.targetY)
    }
  })

  socket.on('entity:castSkill', (data: { entityId: string; skillId: string; targetX: number; targetY: number }) => {
    if (!currentPlayerId) return

    const room = RoomManager.getInstance().getPlayerRoom(currentPlayerId)
    if (!room || room.status !== 'playing') return

    const gameInstance = RoomManager.getInstance().getGameInstance(room.id)
    if (gameInstance) {
      gameInstance.handlePlayerSkill(
        currentPlayerId,
        data.entityId,
        data.skillId,
        data.targetX,
        data.targetY
      )
    }
  })

  socket.on('player:move', (data: { entityId: string; targetX: number; targetY: number }) => {
    if (!currentPlayerId) return

    const room = RoomManager.getInstance().getPlayerRoom(currentPlayerId)
    if (!room || room.status !== 'playing') return

    const gameInstance = RoomManager.getInstance().getGameInstance(room.id)
    if (gameInstance) {
      gameInstance.handlePlayerMove(currentPlayerId, data.entityId, data.targetX, data.targetY)
    }
  })

  socket.on('player:skill', (data: { entityId: string; skillId: string; targetX: number; targetY: number }) => {
    if (!currentPlayerId) return

    const room = RoomManager.getInstance().getPlayerRoom(currentPlayerId)
    if (!room || room.status !== 'playing') return

    const gameInstance = RoomManager.getInstance().getGameInstance(room.id)
    if (gameInstance) {
      gameInstance.handlePlayerSkill(
        currentPlayerId,
        data.entityId,
        data.skillId,
        data.targetX,
        data.targetY
      )
    }
  })

  socket.on('chat:send', (data: { id: string; playerId: string; nickname: string; content: string; timestamp: number; roomId: string }) => {
    if (!currentPlayerId || !data.content?.trim()) return
    RoomManager.getInstance().addChatMessage(currentPlayerId, data.content.trim())
  })

  socket.on('chat:message', (data: { content: string }) => {
    if (!currentPlayerId || !data.content?.trim()) return
    RoomManager.getInstance().addChatMessage(currentPlayerId, data.content.trim())
  })

  socket.on('game:join', (data: { roomId: string }) => {
    if (!currentPlayerId) return
    socket.join(data.roomId)
    console.log(`[Socket.IO] 玩家 ${currentPlayerId} 加入游戏房间 ${data.roomId}`)
  })

  socket.on('game:leave', (data: { roomId: string }) => {
    if (!currentPlayerId) return
    socket.leave(data.roomId)
    console.log(`[Socket.IO] 玩家 ${currentPlayerId} 离开游戏房间 ${data.roomId}`)
  })

  socket.on('player:aoiUpdate', (data: { playerId: string; centerX: number; centerY: number }) => {
    if (!data.playerId) return
    const room = RoomManager.getInstance().getPlayerRoom(data.playerId)
    if (room) {
      const gameInstance = RoomManager.getInstance().getGameInstance(room.id)
      if (gameInstance) {
        gameInstance.setPlayerInterest(data.playerId, data.centerX, data.centerY)
      }
    }
  })

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] 客户端断开连接: ${socket.id}`)
    if (currentPlayerId) {
      playerSocketMap.delete(currentPlayerId)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`🚀 星际战场服务端已启动`)
  console.log(`📡 HTTP服务端口: ${PORT}`)
  console.log(`🔌 WebSocket服务已就绪`)
  console.log(`🎮 游戏服务已启动，等待玩家连接...`)
})

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app
