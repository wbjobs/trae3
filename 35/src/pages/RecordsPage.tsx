import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameCard } from '../components/common/GameCard';
import { GameButton } from '../components/common/GameButton';
import { GlitchText } from '../components/common/GlitchText';
import { APIClient } from '../network/APIClient';
import { useGameStore } from '../store/useGameStore';
import type { GameRecord } from '../../shared/types';

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}分${secs}秒`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function RecordsPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<GameRecord | null>(null);

  const playerId = useGameStore((state) => state.playerId);
  const nickname = useGameStore((state) => state.nickname);

  useEffect(() => {
    if (!playerId) {
      navigate('/');
    }

    const fetchRecords = async () => {
      try {
        const data = await APIClient.getPlayerRecords(playerId);
        setRecords(data);
      } catch (err) {
        console.error('Failed to fetch records:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [playerId, navigate]);

  if (!playerId) {
    return null;
  }

  const totalGames = records.length;
  const wins = records.filter(r => r.winnerId === playerId).length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const totalKills = records.reduce((sum, r) => {
    const stat = r.playerStats.find(s => s.playerId === playerId);
    return sum + (stat?.kills || 0);
  }, 0);
  const totalDeaths = records.reduce((sum, r) => {
    const stat = r.playerStats.find(s => s.playerId === playerId);
    return sum + (stat?.deaths || 0);
  }, 0);
  const totalDamage = records.reduce((sum, r) => {
    const stat = r.playerStats.find(s => s.playerId === playerId);
    return sum + (stat?.damageDealt || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <GlitchText
              text="战绩中心"
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500"
            />
          </div>

          <div className="flex items-center gap-4">
            <span className="text-white font-medium">{nickname}</span>
            <GameButton
              variant="secondary"
              size="sm"
              onClick={() => navigate('/lobby')}
            >
              返回大厅
            </GameButton>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <GameCard className="p-6 text-center">
            <p className="text-4xl font-bold text-cyan-400 mb-2">{totalGames}</p>
            <p className="text-gray-400">总场次</p>
          </GameCard>
          <GameCard className="p-6 text-center">
            <p className="text-4xl font-bold text-green-400 mb-2">{wins}</p>
            <p className="text-gray-400">胜利场次</p>
          </GameCard>
          <GameCard className="p-6 text-center">
            <p className="text-4xl font-bold text-yellow-400 mb-2">{winRate}%</p>
            <p className="text-gray-400">胜率</p>
          </GameCard>
          <GameCard className="p-6 text-center">
            <p className="text-4xl font-bold text-red-400 mb-2">{totalKills}</p>
            <p className="text-gray-400">总击杀</p>
          </GameCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <GameCard className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">对战记录</h2>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg mb-2">暂无对战记录</p>
                  <p className="text-sm">去游戏大厅开始你的第一场战斗吧！</p>
                  <GameButton
                    variant="primary"
                    className="mt-4"
                    onClick={() => navigate('/lobby')}
                  >
                    前往大厅
                  </GameButton>
                </div>
              ) : (
                <div className="space-y-3">
                  {records.map((record) => {
                    const playerStat = record.playerStats.find(s => s.playerId === playerId);
                    const isWinner = record.winnerId === playerId;

                    return (
                      <div
                        key={record.id}
                        onClick={() => setSelectedRecord(record)}
                        className={`p-4 rounded-lg border cursor-pointer transition-all hover:scale-[1.01] ${
                          isWinner
                            ? 'border-green-500/50 bg-green-900/20 hover:bg-green-900/30'
                            : 'border-red-500/50 bg-red-900/20 hover:bg-red-900/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span
                              className={`px-3 py-1 rounded text-sm font-bold ${
                                isWinner
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {isWinner ? '胜利' : '失败'}
                            </span>
                            <span className="text-white font-medium">{record.roomName}</span>
                          </div>
                          <span className="text-gray-500 text-sm">
                            {formatDate(record.startTime)}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">击杀</span>
                            <p className="text-yellow-400 font-bold">{playerStat?.kills || 0}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">死亡</span>
                            <p className="text-red-400 font-bold">{playerStat?.deaths || 0}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">伤害</span>
                            <p className="text-cyan-400 font-bold">{playerStat?.damageDealt || 0}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">时长</span>
                            <p className="text-white font-bold">{formatDuration(record.duration)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GameCard>
          </div>

          <div className="space-y-6">
            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">综合数据</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">K/D 比率</span>
                  <span className="text-white font-bold">
                    {totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">总伤害</span>
                  <span className="text-cyan-400 font-bold">{totalDamage}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">场均击杀</span>
                  <span className="text-yellow-400 font-bold">
                    {totalGames > 0 ? (totalKills / totalGames).toFixed(1) : 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">场均死亡</span>
                  <span className="text-red-400 font-bold">
                    {totalGames > 0 ? (totalDeaths / totalGames).toFixed(1) : 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">场均伤害</span>
                  <span className="text-cyan-400 font-bold">
                    {totalGames > 0 ? Math.round(totalDamage / totalGames) : 0}
                  </span>
                </div>
              </div>
            </GameCard>

            {selectedRecord && (
              <GameCard className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">详细战绩</h3>
                  <button
                    onClick={() => setSelectedRecord(null)}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    关闭
                  </button>
                </div>

                <p className="text-gray-400 text-sm mb-4">{selectedRecord.roomName}</p>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-gray-400">玩家数据</h4>
                  {selectedRecord.playerStats
                    .sort((a, b) => b.kills - a.kills)
                    .map((stat, index) => (
                      <div
                        key={stat.playerId}
                        className={`flex items-center justify-between p-2 rounded ${
                          stat.playerId === playerId
                            ? 'bg-cyan-900/30 border border-cyan-700'
                            : 'bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 text-sm w-6">#{index + 1}</span>
                          <span className={`text-sm ${stat.playerId === playerId ? 'text-cyan-400' : 'text-white'}`}>
                            {stat.nickname}
                            {stat.playerId === playerId && ' (你)'}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs">
                          <span className="text-yellow-400">{stat.kills}K</span>
                          <span className="text-red-400">{stat.deaths}D</span>
                          <span className="text-cyan-400">{stat.damageDealt}DMG</span>
                        </div>
                      </div>
                    ))}
                </div>
              </GameCard>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
