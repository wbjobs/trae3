import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { GameSocket } from '../../network/GameSocket';
import { ConfigLoader } from '../../renderer/ConfigLoader';
import type { SkillConfig, Entity } from '../../../shared/types';

const configLoader = new ConfigLoader();

interface SkillSlotProps {
  skill: SkillConfig;
  cooldown: number;
  maxCooldown: number;
  onCast: () => void;
  isSelected: boolean;
  disabled: boolean;
}

function SkillSlot({ skill, cooldown, maxCooldown, onCast, isSelected, disabled }: SkillSlotProps) {
  const cooldownPercent = maxCooldown > 0 ? (cooldown / maxCooldown) * 100 : 0;
  const isOnCooldown = cooldown > 0;

  return (
    <button
      onClick={onCast}
      disabled={isOnCooldown || disabled}
      className={`relative w-16 h-16 rounded-lg border-2 transition-all overflow-hidden ${
        isSelected
          ? 'border-cyan-400 shadow-lg shadow-cyan-500/50 scale-110'
          : 'border-slate-600 hover:border-cyan-500'
      } ${disabled || isOnCooldown ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ backgroundColor: skill.color + '30' }}
      title={`${skill.name} - ${skill.description}`}
    >
      <div className="absolute inset-0 flex items-center justify-center text-2xl">
        {skill.icon}
      </div>

      {isOnCooldown && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/70 transition-all"
          style={{ height: `${cooldownPercent}%` }}
        />
      )}

      {isOnCooldown && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">
          {(cooldown / 1000).toFixed(1)}s
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-white bg-black/50 py-0.5 truncate px-1">
        {skill.name}
      </div>
    </button>
  );
}

export function SkillBar() {
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);
  const [pendingEntity, setPendingEntity] = useState<string | null>(null);

  const selectedEntityId = useGameStore((state) => state.selectedEntityId);
  const gameState = useGameStore((state) => state.gameState);
  const playerId = useGameStore((state) => state.playerId);
  const isInGame = useGameStore((state) => state.isInGame);

  const getPlayerEntities = useGameStore((state) => state.getPlayerEntities);
  const setSelectedEntityId = useGameStore((state) => state.setSelectedEntityId);

  const playerEntities = getPlayerEntities();
  const selectedEntity = playerEntities.find(e => e.id === selectedEntityId) || playerEntities[0];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isInGame || !selectedEntity) return;

      const key = e.key;
      if (key >= '1' && key <= '4') {
        const skillIndex = parseInt(key) - 1;
        if (selectedEntity.skills[skillIndex]) {
          handleSkillClick(selectedEntity, selectedEntity.skills[skillIndex].configId);
        }
      }

      if (key === 'Escape') {
        cancelPendingSkill();
      }

      if (key === 'Tab') {
        e.preventDefault();
        const currentIndex = playerEntities.findIndex(e => e.id === selectedEntityId);
        const nextIndex = (currentIndex + 1) % playerEntities.length;
        setSelectedEntityId(playerEntities[nextIndex]?.id || null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInGame, selectedEntity, playerEntities, selectedEntityId, setSelectedEntityId]);

  const handleSkillClick = (entity: Entity, skillConfigId: string) => {
    const skill = entity.skills.find(s => s.configId === skillConfigId);
    const skillConfig = configLoader.getSkillConfig(skillConfigId);

    if (!skill || !skillConfig || skill.cooldown > 0) return;

    if (skillConfig.type === 'heal' || skillConfig.type === 'buff') {
      const socket = GameSocket.getInstance();
      socket.emit('entity:castSkill', {
        entityId: entity.id,
        skillId: skillConfigId,
        targetX: entity.position.x,
        targetY: entity.position.y
      });
    } else {
      setPendingSkill(skillConfigId);
      setPendingEntity(entity.id);

      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvas.style.cursor = 'crosshair';
      }
    }
  };

  const cancelPendingSkill = () => {
    setPendingSkill(null);
    setPendingEntity(null);

    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.style.cursor = 'default';
    }
  };

  useEffect(() => {
    if (pendingSkill && pendingEntity) {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const handleClick = () => {
          setTimeout(() => {
            cancelPendingSkill();
          }, 100);
        };
        canvas.addEventListener('click', handleClick, { once: true });
        return () => canvas.removeEventListener('click', handleClick);
      }
    }
  }, [pendingSkill, pendingEntity]);

  if (!isInGame || playerEntities.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
      <div className="bg-slate-900/90 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
        <div className="flex gap-4">
          {playerEntities.map((entity, idx) => (
            <div key={entity.id} className="flex flex-col items-center gap-2">
              <button
                onClick={() => setSelectedEntityId(entity.id)}
                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-white font-bold transition-all ${
                  entity.id === selectedEntity?.id
                    ? 'border-cyan-400 shadow-lg shadow-cyan-500/50 scale-110'
                    : 'border-slate-600 hover:border-cyan-500'
                }`}
                style={{ backgroundColor: entity.color }}
                title={`${entity.name} [${idx + 1}]`}
              >
                {entity.name.charAt(0)}
              </button>

              <div className="flex gap-1">
                {entity.skills.map((skillInstance, skillIdx) => {
                  const skillConfig = configLoader.getSkillConfig(skillInstance.configId);
                  if (!skillConfig) return null;

                  return (
                    <SkillSlot
                      key={skillInstance.id}
                      skill={skillConfig}
                      cooldown={skillInstance.cooldown}
                      maxCooldown={skillInstance.maxCooldown}
                      onCast={() => handleSkillClick(entity, skillInstance.configId)}
                      isSelected={pendingSkill === skillInstance.configId && pendingEntity === entity.id}
                      disabled={entity.id !== selectedEntity?.id}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 text-center text-xs text-gray-400">
          快捷键: 1-4 释放技能 | Tab 切换单位 | ESC 取消选择
        </div>
      </div>
    </div>
  );
}
