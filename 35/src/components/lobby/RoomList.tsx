import { useState, useEffect } from 'react';
import type { Room } from '../../../shared/types';
import { APIClient } from '../../network/APIClient';
import { RoomCard } from './RoomCard';
import { GameButton } from '../common/GameButton';

interface RoomListProps {
  onJoinRoom: (roomId: string) => void;
  onCreateRoom: () => void;
}

export function RoomList({ onJoinRoom, onCreateRoom }: RoomListProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRooms = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const data = await APIClient.getRooms();
      setRooms(data);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    } finally {
      setLoading(false);
      if (showRefreshing) setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(() => fetchRooms(), 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">房间列表</h2>
        <div className="flex gap-2">
          <GameButton
            variant="secondary"
            size="sm"
            onClick={() => fetchRooms(true)}
            disabled={refreshing}
          >
            {refreshing ? '刷新中...' : '刷新'}
          </GameButton>
          <GameButton variant="primary" size="sm" onClick={onCreateRoom}>
            创建房间
          </GameButton>
        </div>
      </div>

      {rooms.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">暂无房间</p>
          <p className="text-sm mt-2">点击上方按钮创建第一个房间</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room) => (
            <RoomCard key={room.id} room={room} onJoin={onJoinRoom} />
          ))}
        </div>
      )}
    </div>
  );
}
