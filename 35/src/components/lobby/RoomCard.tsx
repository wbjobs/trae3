import type { Room } from '../../../shared/types';
import { GameCard } from '../common/GameCard';
import { GameButton } from '../common/GameButton';

interface RoomCardProps {
  room: Room;
  onJoin: (roomId: string) => void;
}

export function RoomCard({ room, onJoin }: RoomCardProps) {
  const statusColors = {
    waiting: 'text-green-400',
    playing: 'text-yellow-400',
    ended: 'text-gray-400'
  };

  const statusText = {
    waiting: '等待中',
    playing: '进行中',
    ended: '已结束'
  };

  const modeText = {
    ffa: '个人战',
    team: '团队战'
  };

  return (
    <GameCard className="p-4 hover:scale-105 transition-transform duration-300">
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-bold text-white">{room.name}</h3>
            <p className="text-sm text-gray-400">ID: {room.id.slice(0, 8)}</p>
          </div>
          <span className={`text-sm font-semibold ${statusColors[room.status]}`}>
            {statusText[room.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-400">
            模式: <span className="text-cyan-400">{modeText[room.mode]}</span>
          </div>
          <div className="text-gray-400">
            人数: <span className="text-cyan-400">{room.players.length}/{room.maxPlayers}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {room.players.map((player) => (
            <span
              key={player.id}
              className="text-xs px-2 py-1 bg-slate-700 rounded text-gray-300"
            >
              {player.nickname}
            </span>
          ))}
        </div>

        <GameButton
          variant="primary"
          size="sm"
          disabled={room.status !== 'waiting' || room.players.length >= room.maxPlayers}
          onClick={() => onJoin(room.id)}
        >
          {room.status === 'waiting' ? '加入房间' : '不可加入'}
        </GameButton>
      </div>
    </GameCard>
  );
}
