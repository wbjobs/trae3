import { Users, Swords, Clock } from "lucide-react";
import type { GameListItem, GameStatus } from "../../shared/types";
import { useNavigate } from "react-router-dom";

interface GameCardProps {
  game: GameListItem;
}

const STATUS_CONFIG: Record<GameStatus, { label: string; color: string; bgColor: string }> = {
  waiting: { label: "等待中", color: "text-tactical-sand", bgColor: "bg-tactical-sand/15" },
  playing: { label: "进行中", color: "text-comm-green", bgColor: "bg-comm-green/15" },
  finished: { label: "已结束", color: "text-data-gray", bgColor: "bg-data-gray-700/30" },
};

export default function GameCard({ game }: GameCardProps) {
  const navigate = useNavigate();
  const statusCfg = STATUS_CONFIG[game.status];

  return (
    <div className="military-border bg-[var(--color-surface)]/60 hover:bg-[var(--color-surface-hover)]/80 transition-all duration-200 hover:glow-sand group">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-tactical-sand text-sm truncate group-hover:text-glow">
              {game.scenarioName}
            </h3>
            <p className="text-[10px] text-data-gray mt-0.5 font-mono">
              ID: {game.id.slice(0, 8)}
            </p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-military ${statusCfg.bgColor} ${statusCfg.color} whitespace-nowrap ml-2`}>
            {statusCfg.label}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-3 text-xs text-[var(--color-text-secondary)]">
          <div className="flex items-center gap-1">
            <Users size={12} className="text-data-gray" />
            <span>{game.playerCount}/2</span>
          </div>
          {game.status === "playing" && (
            <div className="flex items-center gap-1">
              <Swords size={12} className="text-comm-green" />
              <span>回合 {game.currentTurn}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-data-gray" />
            <span>{new Date(game.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          {game.factions.map((f, i) => (
            <span
              key={i}
              className="text-[10px] px-2 py-0.5 rounded-military bg-map-blue/15 text-map-blue"
            >
              {f}
            </span>
          ))}
        </div>

        <button
          onClick={() => {
            if (game.status === "finished") {
              navigate(`/replay/${game.id}`);
            } else {
              navigate(`/game/${game.id}`);
            }
          }}
          className={`w-full py-1.5 rounded-military text-xs font-medium transition-colors ${
            game.status === "waiting"
              ? "bg-tactical-sand/20 text-tactical-sand hover:bg-tactical-sand/30 border border-tactical-sand/30"
              : game.status === "playing"
              ? "bg-comm-green/15 text-comm-green hover:bg-comm-green/25 border border-comm-green/30"
              : "bg-data-gray-700/20 text-data-gray hover:bg-data-gray-700/30 border border-data-gray-700/30"
          }`}
        >
          {game.status === "waiting" ? "加入对局" : game.status === "playing" ? "进入对局" : "查看战报"}
        </button>
      </div>
    </div>
  );
}
