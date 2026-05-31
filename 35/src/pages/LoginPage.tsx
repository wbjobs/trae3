import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameCard } from '../components/common/GameCard';
import { GameButton } from '../components/common/GameButton';
import { GlitchText } from '../components/common/GlitchText';
import { APIClient } from '../network/APIClient';
import { GameSocket } from '../network/GameSocket';
import { useGameStore } from '../store/useGameStore';
import { IDGenerator } from '../utils/IDGenerator';

export default function LoginPage() {
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const setPlayer = useGameStore((state) => state.setPlayer);
  const setConnected = useGameStore((state) => state.setConnected);
  const playerId = useGameStore((state) => state.playerId);

  useEffect(() => {
    if (playerId) {
      navigate('/lobby');
    }

    const fetchLeaderboard = async () => {
      try {
        const data = await APIClient.getLeaderboard(5);
        setLeaderboard(data);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      }
    };

    fetchLeaderboard();
  }, [playerId, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nickname.trim()) {
      setError('请输入昵称');
      return;
    }

    if (nickname.length < 2 || nickname.length > 20) {
      setError('昵称长度必须在2-20个字符之间');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const generatedId = IDGenerator.generate();
      const response = await APIClient.login(nickname.trim(), generatedId);

      const socket = GameSocket.getInstance();
      socket.setPlayerInfo(response.player.playerId, response.player.nickname);
      socket.connect();

      socket.on('connect', () => {
        setConnected(true);
        APIClient.setSocketId(socket.getSocketId());
      });

      socket.on('disconnect', () => {
        setConnected(false);
      });

      setPlayer(response.player.playerId, response.player.nickname);
      navigate('/lobby');
    } catch (err) {
      setError('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 overflow-hidden relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl w-full z-10">
        <div className="flex flex-col justify-center items-center lg:items-start text-center lg:text-left">
          <GlitchText
            text="星际战场"
            className="text-6xl lg:text-7xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-4"
          />
          <p className="text-xl text-gray-400 mb-8 max-w-md">
            多文件、跨端联动的服务器驱动型场景实体动态推演联机游戏
          </p>

          <div className="flex flex-wrap gap-4 justify-center lg:justify-start mb-8">
            <div className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
              <span className="text-cyan-400 font-semibold">⚡ 60Hz</span>
              <span className="text-gray-400 ml-2">推演频率</span>
            </div>
            <div className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
              <span className="text-cyan-400 font-semibold">🎮 8人</span>
              <span className="text-gray-400 ml-2">联机对战</span>
            </div>
            <div className="px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg">
              <span className="text-cyan-400 font-semibold">📡 50ms</span>
              <span className="text-gray-400 ml-2">状态同步</span>
            </div>
          </div>

          <div className="space-y-4 text-sm text-gray-500 max-w-md">
            <div className="flex items-start gap-3">
              <span className="text-cyan-400">▸</span>
              <p>服务端主导所有游戏规则计算，确保公平竞技</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-cyan-400">▸</span>
              <p>4种独特实体类型，8种强力技能，策略制胜</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-cyan-400">▸</span>
              <p>实时同步场景内动态实体的位置、状态、行为</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <GameCard className="p-8">
            <h2 className="text-2xl font-bold text-white mb-6 text-center">登录游戏</h2>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-center">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-gray-300 text-sm mb-2">玩家昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-600 rounded-lg text-white text-lg focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="输入你的昵称"
                  maxLength={20}
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-2 text-right">
                  {nickname.length}/20
                </p>
              </div>

              <GameButton
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={loading}
              >
                {loading ? '登录中...' : '进入战场'}
              </GameButton>
            </form>

            <p className="text-center text-gray-500 text-sm mt-4">
              登录即表示同意《用户协议》和《隐私政策》
            </p>
          </GameCard>

          <GameCard className="p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <span className="text-yellow-400">🏆</span>
              排行榜
            </h3>

            {leaderboard.length === 0 ? (
              <p className="text-gray-500 text-center py-4">暂无数据</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((player, index) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
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
                      <span className="text-white">{player.nickname}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-cyan-400 font-semibold">{player.wins} 胜</p>
                      <p className="text-xs text-gray-500">
                        胜率: {player.totalGames > 0 ? Math.round((player.wins / player.totalGames) * 100) : 0}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GameCard>
        </div>
      </div>
    </div>
  );
}
