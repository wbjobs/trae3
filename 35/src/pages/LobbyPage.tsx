import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoomList } from '../components/lobby/RoomList';
import { CreateRoomModal } from '../components/lobby/CreateRoomModal';
import { GameButton } from '../components/common/GameButton';
import { GameCard } from '../components/common/GameCard';
import { GlitchText } from '../components/common/GlitchText';
import { useGameStore } from '../store/useGameStore';
import { APIClient } from '../network/APIClient';

export default function LobbyPage() {
  const navigate = useNavigate();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const playerId = useGameStore((state) => state.playerId);
  const nickname = useGameStore((state) => state.nickname);
  const isConnected = useGameStore((state) => state.isConnected);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    if (!playerId) {
      navigate('/');
    }

    const fetchLeaderboard = async () => {
      try {
        const data = await APIClient.getLeaderboard(10);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      }
    };

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 10000);
    return () => clearInterval(interval);
  }, [playerId, navigate]);

  const handleJoinRoom = async (roomId: string) => {
    try {
      await APIClient.joinRoom(roomId, playerId, nickname);
      navigate(`/room/${roomId}`);
    } catch (err) {
      console.error('Failed to join room:', err);
      alert('加入房间失败，请重试');
    }
  };

  const handleRoomCreated = (roomId: string) => {
    navigate(`/room/${roomId}`);
  };

  const handleLogout = () => {
    reset();
    navigate('/');
  };

  if (!playerId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GlitchText
              text="星际战场"
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
            />
            <div className="hidden md:flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                {isConnected ? '已连接' : '连接断开'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: `hsl(${nickname.charCodeAt(0) * 10 % 360}, 70%, 50%)` }}
              >
                {nickname.charAt(0).toUpperCase()}
              </div>
              <span className="text-white font-medium hidden sm:inline">{nickname}</span>
            </div>

            <div className="flex gap-2">
              <GameButton
                variant="secondary"
                size="sm"
                onClick={() => navigate('/records')}
              >
                战绩
              </GameButton>
              <GameButton
                variant="danger"
                size="sm"
                onClick={handleLogout}
              >
                退出
              </GameButton>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <RoomList
              onJoinRoom={handleJoinRoom}
              onCreateRoom={() => setShowCreateModal(true)}
            />
          </div>

          <div className="space-y-6">
            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-yellow-400">🏆</span>
                排行榜
              </h3>

              {leaderboard.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">暂无数据</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-2 rounded bg-slate-800/50"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            index === 0
                              ? 'bg-yellow-500 text-yellow-900'
                              : index === 1
                              ? 'bg-gray-400 text-gray-900'
                              : index === 2
                              ? 'bg-orange-600 text-orange-100'
                              : 'bg-slate-700 text-gray-400'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <span className="text-white text-sm truncate max-w-[100px]">
                          {player.nickname}
                        </span>
                      </div>
                      <span className="text-cyan-400 text-sm font-semibold">
                        {player.totalWins}胜
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </GameCard>

            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-cyan-400">📊</span>
                我的数据
              </h3>

              {leaderboard.find(p => p.id === playerId) ? (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">总场次</span>
                    <span className="text-white">{leaderboard.find(p => p.id === playerId)?.gamesPlayed || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">胜利场次</span>
                    <span className="text-green-400">{leaderboard.find(p => p.id === playerId)?.totalWins || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">胜率</span>
                    <span className="text-cyan-400">
                      {leaderboard.find(p => p.id === playerId)?.gamesPlayed > 0
                        ? Math.round((leaderboard.find(p => p.id === playerId)?.totalWins / leaderboard.find(p => p.id === playerId)?.gamesPlayed) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">总击杀</span>
                    <span className="text-yellow-400">{leaderboard.find(p => p.id === playerId)?.totalKills || 0}</span>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4 text-sm">暂无数据</p>
              )}
            </GameCard>

            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-purple-400">🎮</span>
                快速开始
              </h3>
              <div className="space-y-3">
                <GameButton
                  variant="primary"
                  className="w-full"
                  onClick={() => setShowCreateModal(true)}
                >
                  创建房间
                </GameButton>
                <GameButton
                  variant="secondary"
                  className="w-full"
                  onClick={() => navigate('/records')}
                >
                  查看战绩
                </GameButton>
              </div>
            </GameCard>
          </div>
        </div>
      </main>

      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleRoomCreated}
      />
    </div>
  );
}
