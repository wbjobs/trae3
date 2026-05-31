import { useRef, useEffect, useCallback } from 'react'
import type { ClientMessage, ServerMessage, UnitCommand, GameState } from '@shared/types'
import { decodeMessage, encodeMessage, applyDelta, computeStateHash } from '@shared/serializer'
import { useGameStore } from '@/store/gameStore'

const WS_URL = 'ws://localhost:3001'
const RECONNECT_DELAY = 3000
const MAX_RECONNECT = 5
const STATE_DEBOUNCE_MS = 100

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>()
  const stateUpdateTimer = useRef<ReturnType<typeof setTimeout>>()
  const pendingState = useRef<ReturnType<typeof useGameStore.getState>['gameState']>(null)
  const messageQueue = useRef<ClientMessage[]>([])
  const lastReceivedState = useRef<GameState | null>(null)

  const {
    setConnected,
    setGameState,
    setMapConfig,
    addLog,
    updateRoom,
    joinRoom,
  } = useGameStore()

  const flushPendingState = useCallback(() => {
    if (pendingState.current) {
      setGameState(pendingState.current)
      pendingState.current = null
    }
  }, [setGameState])

  const debouncedSetGameState = useCallback((state: Parameters<typeof setGameState>[0]) => {
    pendingState.current = state
    if (stateUpdateTimer.current) {
      clearTimeout(stateUpdateTimer.current)
    }
    stateUpdateTimer.current = setTimeout(flushPendingState, STATE_DEBOUNCE_MS)
  }, [flushPendingState])

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'room_state':
        updateRoom(msg.state)
        break
      case 'map_config':
        setMapConfig(msg.config)
        break
      case 'sync':
        debouncedSetGameState(msg.state)
        lastReceivedState.current = { ...msg.state, units: msg.state.units.map(u => ({ ...u, position: { ...u.position } })) }
        break
      case 'delta_sync':
        if (lastReceivedState.current) {
          const newState = applyDelta(lastReceivedState.current, msg.delta)
          const expectedHash = computeStateHash(newState)
          if (expectedHash === msg.hash) {
            debouncedSetGameState(newState)
            lastReceivedState.current = { ...newState, units: newState.units.map(u => ({ ...u, position: { ...u.position } })) }
          } else {
            console.warn('Delta hash mismatch, falling back to full sync')
          }
        }
        break
      case 'game_start':
        setMapConfig(msg.mapConfig)
        setGameState(msg.initialState)
        lastReceivedState.current = { ...msg.initialState, units: msg.initialState.units.map(u => ({ ...u, position: { ...u.position } })) }
        break
      case 'turn_result':
        debouncedSetGameState(msg.state)
        lastReceivedState.current = { ...msg.state, units: msg.state.units.map(u => ({ ...u, position: { ...u.position } })) }
        break
      case 'game_over':
        setGameState(msg.state)
        lastReceivedState.current = { ...msg.state, units: msg.state.units.map(u => ({ ...u, position: { ...u.position } })) }
        addLog({
          timestamp: new Date().toISOString(),
          playerId: 'system',
          playerName: '系统',
          faction: 'red',
          content: `游戏结束 - ${msg.result === 'red_win' ? '红方胜利' : msg.result === 'blue_win' ? '蓝方胜利' : '平局'}`,
        })
        break
      case 'player_joined':
        if (useGameStore.getState().currentRoom) {
          updateRoom({
            ...useGameStore.getState().currentRoom!,
            players: [...useGameStore.getState().currentRoom!.players, msg.player],
          })
        }
        break
      case 'log':
        addLog(msg.entry)
        break
      case 'error':
        addLog({
          timestamp: new Date().toISOString(),
          playerId: 'system',
          playerName: '系统',
          faction: 'red',
          content: `错误: ${msg.message}`,
        })
        break
    }
  }, [setGameState, setMapConfig, addLog, updateRoom, joinRoom, debouncedSetGameState])

  const flushMessageQueue = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return
    while (messageQueue.current.length > 0) {
      const msg = messageQueue.current.shift()
      if (msg) {
        wsRef.current.send(encodeMessage(msg))
      }
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setConnected(true)
      reconnectCount.current = 0
      flushMessageQueue()
    }

    ws.onclose = () => {
      setConnected(false)
      if (reconnectCount.current < MAX_RECONNECT) {
        reconnectTimer.current = setTimeout(() => {
          reconnectCount.current++
          connect()
        }, RECONNECT_DELAY)
      }
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = decodeMessage(event.data) as ServerMessage
        handleMessage(msg)
      } catch {
        // ignore parse errors
      }
    }

    wsRef.current = ws
  }, [setConnected, handleMessage, flushMessageQueue])

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeMessage(msg))
    } else {
      messageQueue.current.push(msg)
      if (wsRef.current?.readyState !== WebSocket.CONNECTING) {
        connect()
      }
    }
  }, [connect])

  const sendCommands = useCallback((commands: UnitCommand[]) => {
    send({ type: 'command', commands })
  }, [send])

  const sendConfirmTurn = useCallback((turn: number) => {
    send({ type: 'confirm_turn', turn })
  }, [send])

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
    }
    if (stateUpdateTimer.current) {
      clearTimeout(stateUpdateTimer.current)
    }
    reconnectCount.current = MAX_RECONNECT
    wsRef.current?.close()
    wsRef.current = null
    messageQueue.current = []
  }, [])

  useEffect(() => {
    connect()
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    send,
    sendCommands,
    sendConfirmTurn,
    connected: useGameStore((s) => s.connected),
  }
}
