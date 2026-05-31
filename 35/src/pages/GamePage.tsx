import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { GameCanvas } from '../components/game/GameCanvas';
import { SkillBar } from '../components/game/SkillBar';
import { StatusPanel } from '../components/game/StatusPanel';
import { ChatPanel } from '../components/game/ChatPanel';
import { GameButton } from '../components/common/GameButton';
import { GameCard } from '../components/common/GameCard';
import { useGameStore } from '../store/useGameStore';
import { GameSocket, applyDeltaToGameState } from '../network/GameSocket';
import type { ChatMessage } from '../../shared/types';

export default function GamePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const isInGame = useGameStore((state) => state.isInGame);
  const gameOver = useGameStore((state) => state.gameOver);
  const winner = useGameStore((state) => state.winner);
  const currentRoom = useGameStore((state) => state.currentRoom);
  const setGameState = useGameStore((state) => state.setGameState);
  const setInGame = useGameStore((state) => state.setInGame);
  const setGameOver = useGameStore((state) => state.setGameOver);
  const addChatMessage = useGameStore((state) => state.addChatMessage);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    if (!roomId) {
      navigate('/lobby');
      return;
    }

    const socket = GameSocket.getInstance();

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

    const handleGameStart = (data: any) => {
      if (data?.type === 'full' && data.state) {
        setGameState(data.state);
      } else if (data?.initialState) {
        setGameState(data.initialState);
      }
      setInGame(true);
      setGameOver(false, undefined);
    };

    const handleGameOver = (data: { winner: string }) => {
      setGameOver(true, data?.winner);
    };

    const handleChatMessage = (message: ChatMessage) => {
      if (message) {
        addChatMessage(message);
      }
    };

    socket.on('state:update', handleStateUpdate);
    socket.on('game:start', handleGameStart);
    socket.on('game:over', handleGameOver);
    socket.on('chat:message', handleChatMessage);

    socket.emit('game:join', { roomId });

    return () => {
      socket.off('state:update', handleStateUpdate);
      socket.off('game:start', handleGameStart);
      socket.off('game:over', handleGameOver);
      socket.off('chat:message', handleChatMessage);
    };
  }, [roomId, navigate, setGameState, setGameOver, addChatMessage, setInGame]);

  const handleExitGame = () => {
    const socket = GameSocket.getInstance();
    socket.emit('game:leave', { roomId });
    setInGame(false);
    reset();
    navigate('/lobby');
  };

  const handleReturnToLobby = () => {
    if (roomId) {
      navigate(`/room/${roomId}`);
    } else {
      navigate('/lobby');
    }
  };

  if (!roomId) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-slate-900 overflow-hidden">
      <div className="absolute top-4 right-4 z-50">
        <GameButton
          variant="danger"
          size="sm"
          onClick={() => setShowExitConfirm(true)}
        >
          退出游戏
        </GameButton>
      </div>

      <GameCanvas className="w-full h-full" />

      <StatusPanel />
      <SkillBar />
      <ChatPanel />

      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
          <GameCard className="w-full max-w-md p-6 mx-4">
            <h2 className="text-xl font-bold text-white mb-4 text-center">确认退出</h2>
            <p className="text-gray-400 text-center mb-6">确定要退出当前游戏吗？</p>
            <div className="flex gap-3">
              <GameButton
                variant="secondary"
                className="flex-1"
                onClick={() => setShowExitConfirm(false)}
              >
                继续游戏
              </GameButton>
              <GameButton
                variant="danger"
                className="flex-1"
                onClick={handleExitGame}
              >
                确认退出
              </GameButton>
            </div>
          </GameCard>
        </div>
      )}

      {gameOver && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <GameCard className="w-full max-w-md p-8 mx-4 text-center">
            <h2 className="text-4xl font-bold text-yellow-400 mb-4">游戏结束</h2>
            {winner && (
              <p className="text-2xl text-white mb-6">
                🎉 <span className="text-cyan-400">{winner}</span> 获胜!
              </p>
            )}
            <div className="space-y-3">
              <GameButton
                variant="primary"
                className="w-full"
                onClick={handleReturnToLobby}
              >
                返回房间
              </GameButton>
              <GameButton
                variant="secondary"
                className="w-full"
                onClick={() => navigate('/lobby')}
              >
                返回大厅
              </GameButton>
            </div>
          </GameCard>
        </div>
      )}
    </div>
  );
}
