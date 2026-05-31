import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'
import Login from './components/Login'
import GameLobby from './components/GameLobby'
import BattleField from './components/BattleField'
import GameOver from './components/GameOver'
import { expandGameState } from './utils/stateAdapter'

function App() {
  const [socket, setSocket] = useState(null)
  const [player, setPlayer] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [roomId, setRoomId] = useState(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const [gameOver, setGameOver] = useState(null)
  const [error, setError] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  const gameStateRef = useRef(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  const syncState = useCallback(() => {
    if (socket && roomId && socket.connected) {
      socket.emit('sync_state', { roomId })
    }
  }, [socket, roomId])

  useEffect(() => {
    const socketOptions = {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: maxReconnectAttempts,
      timeout: 20000
    }

    const newSocket = io('http://localhost:3000', socketOptions)
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('[Socket] 已连接到服务器')
      setIsConnected(true)
      setReconnecting(false)
      reconnectAttempts.current = 0

      if (player && roomId) {
        syncState()
      }
    })

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] 断开连接:', reason)
      setIsConnected(false)
    })

    newSocket.on('connect_error', (error) => {
      console.error('[Socket] 连接错误:', error.message)
      reconnectAttempts.current++
      
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setReconnecting(true)
        setError('连接服务器失败，请检查网络或刷新页面')
      }
    })

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[Socket] 重新连接成功，尝试次数:', attemptNumber)
      setReconnecting(false)
      setError(null)
      
      const savedPlayerId = localStorage.getItem('playerId')
      if (savedPlayerId && player) {
        newSocket.emit('player_login', { playerId: savedPlayerId, nickname: player.nickname })
      }
      
      if (roomId) {
        setTimeout(() => syncState(), 500)
      }
    })

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('[Socket] 尝试重连:', attemptNumber)
      setReconnecting(true)
    })

    newSocket.on('login_success', (data) => {
      setPlayer(data.player)
      setError(null)
      localStorage.setItem('playerId', data.player.id)
      console.log('[Socket] 登录成功:', data.player.nickname)
    })

    newSocket.on('waiting_opponent', () => {
      setIsWaiting(true)
      console.log('[Socket] 等待对手...')
    })

    newSocket.on('game_start', (data) => {
      const expandedState = expandGameState(data.gameState)
      setGameState(expandedState)
      setRoomId(data.roomId)
      setIsWaiting(false)
      gameStateRef.current = expandedState
      console.log('[Socket] 游戏开始')
    })

    newSocket.on('card_played', (data) => {
      if (data.result && data.result.gameState) {
        const expandedState = expandGameState(data.result.gameState)
        setGameState(expandedState)
        gameStateRef.current = expandedState
        console.log('[Socket] 收到打牌结果，状态已更新')
      } else {
        console.warn('[Socket] 打牌结果缺少gameState')
        syncState()
      }
    })

    newSocket.on('minion_attacked', (data) => {
      if (data.gameState) {
        const expandedState = expandGameState(data.gameState)
        setGameState(expandedState)
        gameStateRef.current = expandedState
        console.log('[Socket] 收到攻击结果，状态已更新')
      } else {
        console.warn('[Socket] 攻击结果缺少gameState')
        syncState()
      }
    })

    newSocket.on('turn_changed', (data) => {
      if (data.gameState) {
        const expandedState = expandGameState(data.gameState)
        setGameState(expandedState)
        gameStateRef.current = expandedState
        console.log('[Socket] 回合变更，状态已更新')
      } else {
        console.warn('[Socket] 回合变更缺少gameState')
        syncState()
      }
    })

    newSocket.on('state_updated', (data) => {
      if (data.gameState) {
        const expandedState = expandGameState(data.gameState)
        setGameState(expandedState)
        gameStateRef.current = expandedState
        console.log('[Socket] 状态同步完成')
      }
    })

    newSocket.on('game_over', (data) => {
      setGameOver(data.winner)
      console.log('[Socket] 游戏结束，胜者:', data.winner)
    })

    newSocket.on('opponent_disconnected', (data) => {
      setGameOver(data.winner)
      setError('对手已断开连接')
      console.log('[Socket] 对手断开连接')
    })

    newSocket.on('invalid_move', (data) => {
      console.warn('[Socket] 无效操作:', data.message)
      setError(data.message)
      setTimeout(() => setError(null), 3000)
      syncState()
    })

    newSocket.on('error', (data) => {
      console.error('[Socket] 服务器错误:', data.message)
      setError(data.message)
      setTimeout(() => setError(null), 3000)
    })

    return () => {
      newSocket.disconnect()
    }
  }, [])

  const handleLogin = useCallback((playerId, nickname) => {
    if (socket) {
      const id = playerId || localStorage.getItem('playerId') || uuidv4()
      socket.emit('player_login', { playerId: id, nickname })
    }
  }, [socket])

  const handleMatchmaking = useCallback(() => {
    if (socket) {
      setGameOver(null)
      setGameState(null)
      setRoomId(null)
      socket.emit('matchmaking', {})
    }
  }, [socket])

  const handlePlayCard = useCallback((cardId, targetId) => {
    if (socket && roomId) {
      socket.emit('play_card', { roomId, cardId, targetId })
    }
  }, [socket, roomId])

  const handleAttackMinion = useCallback((attackerId, targetId) => {
    if (socket && roomId) {
      socket.emit('attack_minion', { roomId, attackerId, targetId })
    }
  }, [socket, roomId])

  const handleEndTurn = useCallback(() => {
    if (socket && roomId) {
      socket.emit('end_turn', { roomId })
    }
  }, [socket, roomId])

  const handlePlayAgain = useCallback(() => {
    setGameState(null)
    setRoomId(null)
    setGameOver(null)
    setIsWaiting(false)
    setError(null)
    gameStateRef.current = null
  }, [])

  const isMyTurn = gameState?.players ? 
    gameState.players[gameState.currentPlayer]?.id === player?.id : false

  return (
    <div className="app">
      {error && (
        <div className="error-toast">
          {error}
        </div>
      )}

      {reconnecting && (
        <div className="reconnecting-overlay">
          <div className="spinner"></div>
          <p>正在重新连接...</p>
        </div>
      )}

      {!isConnected && !reconnecting && (
        <div className="connection-error">
          <h2>连接断开</h2>
          <p>请检查网络连接或刷新页面</p>
          <button onClick={() => window.location.reload()}>重新连接</button>
        </div>
      )}

      {isConnected && !player && (
        <Login onLogin={handleLogin} />
      )}

      {isConnected && player && !gameState && !gameOver && (
        <GameLobby 
          player={player}
          socket={socket}
          onMatchmaking={handleMatchmaking}
          isWaiting={isWaiting}
        />
      )}

      {isConnected && gameState && !gameOver && (
        <BattleField
          gameState={gameState}
          player={player}
          onPlayCard={handlePlayCard}
          onAttackMinion={handleAttackMinion}
          onEndTurn={handleEndTurn}
          isMyTurn={isMyTurn}
          onSyncState={syncState}
        />
      )}

      {gameOver && (
        <GameOver 
          winner={gameOver}
          player={player}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  )
}

export default App