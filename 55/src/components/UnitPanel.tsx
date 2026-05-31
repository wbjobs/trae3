import { Move, Crosshair, Clock, Heart, Sword, Shield, Footprints } from "lucide-react";
import type { Unit, Phase } from "../../shared/types";
import { UNIT_STATS } from "../../shared/types";
import { useGameStore } from "../stores/gameStore";

interface UnitPanelProps {
  onMove?: () => void;
  onAttack?: () => void;
  onWait?: () => void;
  currentPhase?: Phase;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const ratio = hp / maxHp;
  const color =
    ratio > 0.6 ? "bg-comm-green" : ratio > 0.3 ? "bg-tactical-sand" : "bg-alert-red";
  return (
    <div className="w-full h-2 bg-data-gray-700 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-300`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export default function UnitPanel({ onMove, onAttack, onWait, currentPhase }: UnitPanelProps) {
  const { selectedUnit, currentGame, currentPlayer, setSelectedUnit } = useGameStore();

  const myUnits = currentGame?.units.filter(
    (u) => u.faction === currentPlayer?.faction && u.status !== "destroyed"
  ) ?? [];

  const canMove = selectedUnit && !selectedUnit.moved && currentPhase === "move";
  const canAttack = selectedUnit && !selectedUnit.attacked && currentPhase === "combat";

  if (selectedUnit) {
    const stats = UNIT_STATS[selectedUnit.type];
    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{stats.icon}</span>
            <div>
              <p className="font-serif text-tactical-sand text-sm">{stats.label}</p>
              <p className="text-xs text-data-gray">{selectedUnit.faction}</p>
            </div>
            <span className={`ml-auto text-xs px-2 py-0.5 rounded-military ${
              selectedUnit.status === "active" ? "bg-comm-green/20 text-comm-green" :
              selectedUnit.status === "damaged" ? "bg-tactical-sand/20 text-tactical-sand" :
              "bg-alert-red/20 text-alert-red"
            }`}>
              {selectedUnit.status === "active" ? "正常" : selectedUnit.status === "damaged" ? "受损" : "摧毁"}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-data-gray">
              <Heart size={12} /> {selectedUnit.hp}/{selectedUnit.maxHp}
            </div>
            <HpBar hp={selectedUnit.hp} maxHp={selectedUnit.maxHp} />
          </div>
        </div>

        <div className="p-3 grid grid-cols-3 gap-2 border-b border-[var(--color-border)]">
          <div className="text-center">
            <Sword size={14} className="mx-auto mb-1 text-alert-red" />
            <p className="font-mono text-sm text-tactical-sand">{selectedUnit.attack}</p>
            <p className="text-[10px] text-data-gray">攻击</p>
          </div>
          <div className="text-center">
            <Shield size={14} className="mx-auto mb-1 text-map-blue" />
            <p className="font-mono text-sm text-tactical-sand">{selectedUnit.defense}</p>
            <p className="text-[10px] text-data-gray">防御</p>
          </div>
          <div className="text-center">
            <Footprints size={14} className="mx-auto mb-1 text-comm-green" />
            <p className="font-mono text-sm text-tactical-sand">{selectedUnit.movement}</p>
            <p className="text-[10px] text-data-gray">机动</p>
          </div>
        </div>

        <div className="p-3 space-y-2 border-b border-[var(--color-border)]">
          <button
            onClick={onMove}
            disabled={!canMove}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-military text-sm font-medium transition-colors ${
              canMove
                ? "bg-comm-green/20 text-comm-green hover:bg-comm-green/30 border border-comm-green/40"
                : "bg-data-gray-700/30 text-data-gray cursor-not-allowed border border-data-gray-700"
            }`}
          >
            <Move size={14} /> 移动
          </button>
          <button
            onClick={onAttack}
            disabled={!canAttack}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-military text-sm font-medium transition-colors ${
              canAttack
                ? "bg-alert-red/20 text-alert-red hover:bg-alert-red/30 border border-alert-red/40"
                : "bg-data-gray-700/30 text-data-gray cursor-not-allowed border border-data-gray-700"
            }`}
          >
            <Crosshair size={14} /> 攻击
          </button>
          <button
            onClick={onWait}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-military text-sm font-medium bg-tactical-sand/10 text-tactical-sand hover:bg-tactical-sand/20 border border-tactical-sand/30 transition-colors"
          >
            <Clock size={14} /> 待机
          </button>
        </div>

        <div className="p-3 flex-1 overflow-y-auto">
          <p className="text-xs text-data-gray mb-2">己方单位</p>
          <div className="space-y-1">
            {myUnits.map((unit) => {
              const s = UNIT_STATS[unit.type];
              return (
                <button
                  key={unit.id}
                  onClick={() => setSelectedUnit(unit)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-military text-xs transition-colors ${
                    selectedUnit.id === unit.id
                      ? "bg-tactical-sand/20 text-tactical-sand border border-tactical-sand/40"
                      : "text-data-gray hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)]"
                  }`}
                >
                  <span>{s.icon}</span>
                  <span className="flex-1 text-left">{s.label}</span>
                  <span className="font-mono">{unit.hp}/{unit.maxHp}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-3">
      <p className="text-xs text-data-gray mb-2">己方单位</p>
      <div className="space-y-1 flex-1 overflow-y-auto">
        {myUnits.map((unit) => {
          const s = UNIT_STATS[unit.type];
          return (
            <button
              key={unit.id}
              onClick={() => setSelectedUnit(unit)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-military text-xs text-data-gray hover:bg-[var(--color-surface)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              <span>{s.icon}</span>
              <span className="flex-1 text-left">{s.label}</span>
              <span className="font-mono">{unit.hp}/{unit.maxHp}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
