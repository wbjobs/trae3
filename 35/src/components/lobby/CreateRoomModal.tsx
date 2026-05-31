import { useState } from 'react';
import { GameButton } from '../common/GameButton';
import { GameCard } from '../common/GameCard';
import { APIClient } from '../../network/APIClient';
import { useGameStore } from '../../store/useGameStore';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export function CreateRoomModal({ isOpen, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [mode, setMode] = useState<'ffa' | 'team'>('ffa');
  const [mapId, setMapId] = useState('map_01');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const playerId = useGameStore((state) => state.playerId);
  const nickname = useGameStore((state) => state.nickname);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入房间名称');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const room = await APIClient.createRoom({
        name: name.trim(),
        ownerId: playerId,
        ownerName: nickname,
        maxPlayers,
        mode,
        mapId
      });
      onCreated(room.id);
      handleClose();
    } catch (err) {
      setError('创建房间失败，请重试');
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setMaxPlayers(4);
    setMode('ffa');
    setMapId('map_01');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <GameCard className="w-full max-w-md p-6 mx-4">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">创建房间</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-gray-300 text-sm mb-2">房间名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-cyan-500 transition-colors"
              placeholder="输入房间名称"
              maxLength={20}
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-2">最大人数: {maxPlayers}</label>
            <input
              type="range"
              min="2"
              max="8"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-2">游戏模式</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('ffa')}
                className={`flex-1 py-2 rounded transition-colors ${
                  mode === 'ffa'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                个人战
              </button>
              <button
                type="button"
                onClick={() => setMode('team')}
                className={`flex-1 py-2 rounded transition-colors ${
                  mode === 'team'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
                }`}
              >
                团队战
              </button>
            </div>
          </div>

          <div>
            <label className="block text-gray-300 text-sm mb-2">地图选择</label>
            <select
              value={mapId}
              onChange={(e) => setMapId(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-600 rounded text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="map_01">太空战场</option>
              <option value="map_02">星际要塞</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <GameButton
              type="button"
              variant="secondary"
              onClick={handleClose}
              className="flex-1"
            >
              取消
            </GameButton>
            <GameButton
              type="submit"
              variant="primary"
              disabled={creating}
              className="flex-1"
            >
              {creating ? '创建中...' : '创建'}
            </GameButton>
          </div>
        </form>
      </GameCard>
    </div>
  );
}
