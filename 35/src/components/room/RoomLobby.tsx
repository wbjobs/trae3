import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Room, Player } from '../../../shared/types';
import { GameCard } from '../common/GameCard';
import { GameButton } from '../common/GameButton';
import { APIClient } from '../../network/APIClient';
import { GameSocket } from '../../network/GameSocket';
import { useGameStore } from '../../store/useGameStore';

interface RoomLobbyProps {
  roomId: string;
}

export function RoomLobby({ roomId }: RoomLobbyProps) {
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const playerId = useGameStore((state) => state.playerId);
  const nickname = useGameStore((state) => state.nickname);
  const setCurrentRoom = useGameStore((state) => state.setCurrentRoom);
  const setInGame = useGameStore((state) => state.setInGame);
  const reset = useGameStore((state) => state.reset);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        const data = await APIClient.getRoom(roomId);
        setRoom(data);
        setCurrentRoom(data);
      } catch (err) {
        setError('房间不存在或已关闭');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId, setCurrentRoom]);

  useEffect(() => {
    const socket = GameSocket.getInstance();

    const handleRoomUpdate = (updatedRoom: Room) => {
      setRoom(updatedRoom);
      setCurrentRoom(updatedRoom);
    };

    const handleGameStart = () => {
      setInGame(true);
      navigate(`/game/${roomId}`);
    };

    const handlePlayerJoined = (player: Player) => {
      console.log('Player joined:', player.nickname);
    };

    const handlePlayerLeft = (playerId: string) => {
      console.log('Player left:', playerId);
    };

    socket.on('room:update', handleRoomUpdate);
    socket.on('game:start', handleGameStart);
    socket.on('room:playerJoined', handlePlayerJoined);
    socket.on('room:playerLeft', handlePlayerLeft);

    return () => {
      socket.off('room:update', handleRoomUpdate);
      socket.off('game:start', handleGameStart);
      socket.off('room:playerJoined', handlePlayerJoined);
      socket.off('room:playerLeft', handlePlayerLeft);
    };
  }, [roomId, navigate, setCurrentRoom, setInGame]);

  const handleToggleReady = async () => {
    if (!room) return;

    try {
      await APIClient.toggleReady(roomId, playerId);
    } catch (err) {
      setError('操作失败，请重试');
    }
  };

  const handleStartGame = async () => {
    if (!room) return;

    try {
      await APIClient.startGame(roomId, playerId);
    } catch (err) {
      setError('开始游戏失败，请确保所有玩家已准备');
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await APIClient.leaveRoom(roomId, playerId);
      reset();
      navigate('/lobby');
    } catch (err) {
      setError('离开房间失败');
    }
  };

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-red-400 text-xl">{error || '房间不存在'}</p>
        <GameButton onClick={() => navigate('/lobby')}>返回大厅</GameButton>
      </div>
    );
  }

  const currentPlayer = room.players.find((p) => p.id === playerId);
  const isOwner = room.ownerId === playerId;
  const allReady = room.players.every((p) => p.isReady);
  const canStart = isOwner && allReady && room.players.length >= 2;

  const modeText = {
    ffa: '个人战',
    team: '团队战'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{room.name}</h1>
            <div className="flex items-center gap-4 text-gray-400">
              <span>房间ID: {room.id}</span>
              <button
                onClick={handleCopyRoomId}
                className="text-cyan-400 hover:text-cyan-300 text-sm"
              >
                复制
              </button>
              <span>模式: {modeText[room.mode]}</span>
              <span>地图: {room.mapId === 'map_01' ? '太空战场' : room.mapId === 'map_02' ? '星际要塞' : room.mapId}</span>
            </div>
          </div>
          <GameButton variant="danger" size="sm" onClick={handleLeaveRoom}>
            离开房间
          </GameButton>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GameCard className="p-6">
              <h2 className="text-xl font-bold text-white mb-4">
                玩家列表 ({room.players.length}/{room.maxPlayers})
              </h2>

              <div className="space-y-3">
                {room.players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-4 rounded-lg border transition-all ${
                      player.id === playerId
                        ? 'border-cyan-500 bg-cyan-900/20'
                        : 'border-slate-700 bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-gray-500 w-8">
                        #{index + 1}
                      </span>
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                        style={{
                          backgroundColor: `hsl(${(index * 60) % 360}, 70%, 50%)`
                        }}
                      >
                        {player.nickname.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-semibold">
                          {player.nickname}
                          {player.id === playerId && (
                            <span className="text-cyan-400 text-sm ml-2">(你)</span>
                          )}
                          {player.isOwner && (
                            <span className="text-yellow-400 text-sm ml-2">👑 房主</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-400">
                          队伍 {player.team + 1} · 击杀: {player.kills} · 死亡: {player.deaths}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`px-4 py-2 rounded-lg font-semibold ${
                        player.isReady
                          ? 'bg-green-500/20 text-green-400 border border-green-500'
                          : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500'
                      }`}
                    >
                      {player.isReady ? '已准备' : '未准备'}
                    </div>
                  </div>
                ))}

                {room.players.length < room.maxPlayers && (
                  <div className="flex items-center justify-center p-4 rounded-lg border-2 border-dashed border-slate-600 text-gray-500">
                    等待玩家加入...
                  </div>
                )}
              </div>
            </GameCard>
          </div>

          <div className="space-y-4">
            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">房间设置</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">游戏模式</span>
                  <span className="text-white">{modeText[room.mode]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">最大玩家</span>
                  <span className="text-white">{room.maxPlayers}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">当前人数</span>
                  <span className="text-cyan-400">{room.players.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">已准备</span>
                  <span className="text-green-400">
                    {room.players.filter((p) => p.isReady).length}
                  </span>
                </div>
              </div>
            </GameCard>

            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">操作</h3>
              <div className="space-y-3">
                {!isOwner && currentPlayer && (
                  <GameButton
                    variant={currentPlayer.isReady ? 'secondary' : 'success'}
                    className="w-full"
                    onClick={handleToggleReady}
                  >
                    {currentPlayer.isReady ? '取消准备' : '准备游戏'}
                  </GameButton>
                )}

                {isOwner && (
                  <GameButton
                    variant="primary"
                    className="w-full"
                    onClick={handleStartGame}
                    disabled={!canStart}
                  >
                    {canStart ? '开始游戏' : allReady ? '等待更多玩家' : '等待玩家准备'}
                  </GameButton>
                )}

                <div className="text-xs text-gray-500 text-center">
                  {isOwner
                    ? '所有玩家准备好后即可开始游戏'
                    : currentPlayer?.isReady
                    ? '等待房主开始游戏...'
                    : '点击准备按钮开始匹配'}
                </div>
              </div>
            </GameCard>

            <GameCard className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">操作说明</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                <li>• 左键点击地面移动单位</li>
                <li>• 左键点击敌方单位攻击</li>
                <li>• 右键拖拽移动视角</li>
                <li>• 滚轮缩放视角</li>
                <li>• 1-4 快捷键释放技能</li>
                <li>• Tab 切换控制单位</li>
              </ul>
            </GameCard>
          </div>
        </div>
      </div>
    </div>
  );
}
