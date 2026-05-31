import { useGameStore } from '../../store/useGameStore';
import { GameCard } from '../common/GameCard';
import type { Player, Entity } from '../../../shared/types';

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function EntityStatus({ entity, isSelected }: { entity: Entity; isSelected: boolean }) {
  const healthPercent = (entity.health / entity.maxHealth) * 100;

  return (
    <div
      className={`p-2 rounded-lg border transition-all ${
        isSelected
          ? 'border-cyan-400 bg-cyan-900/30'
          : 'border-slate-700 bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: entity.color }}
        >
          {entity.name.charAt(0)}
        </div>
        <span className="text-sm text-white font-medium truncate flex-1">
          {entity.name}
        </span>
        <span className="text-xs text-gray-400 capitalize">{entity.state}</span>
      </div>

      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${healthPercent}%`,
            backgroundColor: healthPercent > 50 ? '#22c55e' : healthPercent > 25 ? '#eab308' : '#ef4444'
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>HP: {Math.floor(entity.health)}/{entity.maxHealth}</span>
        <span>DMG: {entity.damage}</span>
      </div>
    </div>
  );
}

function PlayerStats({ player, isCurrentPlayer }: { player: Player; isCurrentPlayer: boolean }) {
  return (
    <div
      className={`flex items-center justify-between p-2 rounded ${
        isCurrentPlayer ? 'bg-cyan-900/30 border border-cyan-700' : 'bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${player.isReady ? 'bg-green-500' : 'bg-yellow-500'}`}
        />
        <span className={`text-sm ${isCurrentPlayer ? 'text-cyan-400' : 'text-white'}`}>
          {player.nickname}
          {isCurrentPlayer && ' (你)'}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-gray-400">
        <span>K: {player.kills}</span>
        <span>D: {player.deaths}</span>
        <span>DMG: {player.damageDealt}</span>
      </div>
    </div>
  );
}

export function StatusPanel() {
  const gameState = useGameStore((state) => state.gameState);
  const selectedEntityId = useGameStore((state) => state.selectedEntityId);
  const playerId = useGameStore((state) => state.playerId);
  const currentRoom = useGameStore((state) => state.currentRoom);
  const isInGame = useGameStore((state) => state.isInGame);
  const gameOver = useGameStore((state) => state.gameOver);
  const winner = useGameStore((state) => state.winner);

  const getPlayerEntities = useGameStore((state) => state.getPlayerEntities);
  const playerEntities = getPlayerEntities();

  if (!isInGame || !gameState || !currentRoom) {
    return null;
  }

  const sortedPlayers = [...gameState.players].sort((a, b) => b.kills - a.kills);

  return (
    <div className="fixed top-4 left-4 z-40 w-72 space-y-4">
      <GameCard className="p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-white">{currentRoom.name}</h3>
          <span className="text-cyan-400 font-mono">
            {formatTime(gameState.gameTime)}
          </span>
        </div>

        {gameOver && (
          <div className="mb-3 p-3 bg-yellow-500/20 border border-yellow-500 rounded text-center">
            <p className="text-yellow-400 font-bold text-lg">
              {winner ? `${winner} 获胜!` : '游戏结束'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-400">玩家排名</h4>
          {sortedPlayers.map((player) => (
            <PlayerStats
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === playerId}
            />
          ))}
        </div>
      </GameCard>

      <GameCard className="p-4">
        <h4 className="text-sm font-semibold text-gray-400 mb-3">我的单位</h4>
        <div className="space-y-2">
          {playerEntities.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-2">所有单位已阵亡</p>
          ) : (
            playerEntities.map((entity) => (
              <EntityStatus
                key={entity.id}
                entity={entity}
                isSelected={entity.id === selectedEntityId}
              />
            ))
          )}
        </div>
      </GameCard>

      {selectedEntityId && (
        <GameCard className="p-4">
          <h4 className="text-sm font-semibold text-gray-400 mb-3">选中单位</h4>
          {gameState.entities.find(e => e.id === selectedEntityId) && (
            <EntityStatus
              entity={gameState.entities.find(e => e.id === selectedEntityId)!}
              isSelected={true}
            />
          )}
        </GameCard>
      )}
    </div>
  );
}
