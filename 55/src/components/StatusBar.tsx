import { Radio, Shield, Clock, User } from "lucide-react";
import type { Phase, GameState, Player } from "../../shared/types";

interface StatusBarProps {
  game: GameState | null;
  currentPlayer: Player | null;
}

const PHASE_LABELS: Record<Phase, { label: string; color: string }> = {
  deploy: { label: "部署阶段", color: "text-tactical-sand" },
  move: { label: "机动阶段", color: "text-comm-green" },
  combat: { label: "交战阶段", color: "text-alert-red" },
  settle: { label: "结算阶段", color: "text-map-blue" },
};

export default function StatusBar({ game, currentPlayer }: StatusBarProps) {
  if (!game) return null;

  const phaseCfg = PHASE_LABELS[game.phase];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Shield size={14} className="text-tactical-sand" />
          <span className="font-serif text-sm text-tactical-sand">{game.scenarioName}</span>
        </div>

        <div className="h-4 w-px bg-[var(--color-border)]" />

        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-data-gray" />
          <span className="font-mono text-sm text-[var(--color-text-secondary)]">
            回合 {game.currentTurn}/{game.maxTurns}
          </span>
        </div>

        <div className="h-4 w-px bg-[var(--color-border)]" />

        <div className="flex items-center gap-1.5">
          <Radio size={14} className={phaseCfg.color} />
          <span className={`text-sm font-medium ${phaseCfg.color}`}>
            {phaseCfg.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {game.players.map((p) => (
          <div
            key={p.id}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-military text-xs ${
              p.id === currentPlayer?.id
                ? "bg-tactical-sand/15 text-tactical-sand border border-tactical-sand/30"
                : "text-data-gray"
            }`}
          >
            <User size={12} />
            <span>{p.name}</span>
            <span className="text-[10px] opacity-70">({p.faction})</span>
            {p.isReady && <span className="text-comm-green">●</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
