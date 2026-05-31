import { useEffect, useRef } from 'react';
import { GameSocket, applyDeltaToGameState } from '../network/GameSocket';
import { APIClient } from '../network/APIClient';
import { useGameStore } from '../store/useGameStore';

export function useSocket() {
  const isInitialized = useRef(false);
  const {
    setConnected,
    setGameState,
    addChatMessage,
    setInGame,
    setGameOver,
    setCurrentRoom,
    playerId,
    nickname
  } = useGameStore();

  useEffect(() => {
    if (isInitialized.current || !playerId || !nickname) return;
    isInitialized.current = true;

    const socket = GameSocket.getInstance();

    if (!socket.isConnectedToServer()) {
      socket.connect(playerId, nickname);
    }

    setTimeout(() => {
      APIClient.setSocketId(socket.getSocketId());
    }, 200);

    const handleStateUpdate = (data: any) => {
      const currentGameState = useGameStore.getState().gameState;
      if (data?.type === 'full' && data.state) {
        setGameState(data.state);
      } else if (data?.type === 'delta' && currentGameState) {
        const merged = applyDeltaToGameState(currentGameState, data);
        setGameState(merged);
      } else if (data?.state) {
        setGameState(data.state);
      }
    };

    const handleDamageEvents = (events: any) => {
      console.log('[useSocket] 伤害事件:', events);
    };

    const handleSkillCastEvents = (events: any) => {
      console.log('[useSocket] 技能释放:', events);
    };

    const handleChatMessage = (message: any) => {
      if (message) {
        addChatMessage(message);
      }
    };

    const handleGameStart = (data: any) => {
      if (data?.type === 'full' && data.state) {
        setGameState(data.state);
      } else if (data?.initialState) {
        setGameState(data.initialState);
      }
      setInGame(true);
      setGameOver(false, undefined);
    };

    const handleGameEnd = (data: any) => {
      setInGame(false);
      setGameOver(true, data?.winner);
    };

    const handleGameOver = (data: any) => {
      setGameOver(true, data?.winner);
      setInGame(false);
    };

    const handlePlayerJoined = (player: any) => {
      console.log('[useSocket] 玩家加入:', player?.nickname);
      const room = useGameStore.getState().currentRoom;
      if (room && player) {
        setCurrentRoom({
          ...room,
          players: [...room.players, player]
        });
      }
    };

    const handlePlayerLeft = (playerIdLeft: any) => {
      console.log('[useSocket] 玩家离开:', playerIdLeft);
      const room = useGameStore.getState().currentRoom;
      if (room) {
        setCurrentRoom({
          ...room,
          players: room.players.filter((p: any) => p.id !== playerIdLeft)
        });
      }
    };

    const handleReadyChanged = (data: any) => {
      const room = useGameStore.getState().currentRoom;
      if (room && data) {
        setCurrentRoom({
          ...room,
          players: room.players.map((p: any) =>
            p.id === data.playerId ? { ...p, isReady: data.ready } : p
          )
        });
      }
    };

    const handleConnect = (data: any) => {
      setConnected(true);
      if (data?.socketId) {
        APIClient.setSocketId(data.socketId);
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    socket.on('state:update', handleStateUpdate);
    socket.on('game:damageEvents', handleDamageEvents);
    socket.on('game:skillCastEvents', handleSkillCastEvents);
    socket.on('chat:message', handleChatMessage);
    socket.on('game:start', handleGameStart);
    socket.on('game:end', handleGameEnd);
    socket.on('game:over', handleGameOver);
    socket.on('player:joined', handlePlayerJoined);
    socket.on('player:left', handlePlayerLeft);
    socket.on('player:readyChanged', handleReadyChanged);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('state:update', handleStateUpdate);
      socket.off('game:damageEvents', handleDamageEvents);
      socket.off('game:skillCastEvents', handleSkillCastEvents);
      socket.off('chat:message', handleChatMessage);
      socket.off('game:start', handleGameStart);
      socket.off('game:end', handleGameEnd);
      socket.off('game:over', handleGameOver);
      socket.off('player:joined', handlePlayerJoined);
      socket.off('player:left', handlePlayerLeft);
      socket.off('player:readyChanged', handleReadyChanged);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      isInitialized.current = false;
    };
  }, [playerId, nickname, setConnected, setGameState, addChatMessage, setInGame, setGameOver, setCurrentRoom]);

  return {
    sendMove: (entityId: string, targetX: number, targetY: number) => {
      const socket = GameSocket.getInstance();
      socket.sendMove(entityId, targetX, targetY);
    },
    sendSkill: (entityId: string, skillId: string, targetX: number, targetY: number) => {
      const socket = GameSocket.getInstance();
      socket.sendSkill(entityId, skillId, targetX, targetY);
    },
    sendChat: (content: string) => {
      const socket = GameSocket.getInstance();
      socket.sendChatMessage(content);
    },
    disconnect: () => {
      const socket = GameSocket.getInstance();
      socket.disconnect();
      isInitialized.current = false;
    },
    isConnected: () => GameSocket.getInstance().isConnectedToServer()
  };
}
