import { useEffect, useRef, useCallback } from 'react';
import { SceneRenderer } from '../../renderer/SceneRenderer';
import { useGameStore } from '../../store/useGameStore';
import { GameSocket } from '../../network/GameSocket';
import type { Entity } from '../../../shared/types';

interface GameCanvasProps {
  className?: string;
}

export function GameCanvas({ className = '' }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const gameState = useGameStore((state) => state.gameState);
  const selectedEntityId = useGameStore((state) => state.selectedEntityId);
  const setSelectedEntityId = useGameStore((state) => state.setSelectedEntityId);
  const isInGame = useGameStore((state) => state.isInGame);

  const handleEntityClick = useCallback((entity: Entity) => {
    setSelectedEntityId(entity.id);
  }, [setSelectedEntityId]);

  const handleGroundClick = useCallback((x: number, y: number) => {
    const socket = GameSocket.getInstance();
    const playerEntities = useGameStore.getState().getPlayerEntities();
    const selectedEntity = playerEntities.find(e => e.id === selectedEntityId) || playerEntities[0];

    if (selectedEntity) {
      socket.emit('entity:move', {
        entityId: selectedEntity.id,
        targetX: x,
        targetY: y
      });
    }
  }, [selectedEntityId]);

  const handleSkillTarget = useCallback((x: number, y: number) => {
    if (!rendererRef.current) return;

    const skillId = rendererRef.current.getPendingSkillId();
    const entityId = rendererRef.current.getPendingEntityId();

    if (skillId && entityId) {
      const socket = GameSocket.getInstance();
      socket.emit('entity:castSkill', {
        entityId,
        skillId,
        targetX: x,
        targetY: y
      });
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const container = containerRef.current;

    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      if (rendererRef.current) {
        rendererRef.current.resize(width, height);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    try {
      const renderer = new SceneRenderer(canvas);
      rendererRef.current = renderer;

      renderer.setOnEntityClick(handleEntityClick);
      renderer.setOnGroundClick(handleGroundClick);
      renderer.setOnSkillTarget(handleSkillTarget);

      if (isInGame) {
        renderer.start();
      }

      const socket = GameSocket.getInstance();

      const handleDamageEvents = (events: any[]) => {
        renderer.handleDamageEvents(events);
      };

      const handleSkillCastEvents = (events: any[]) => {
        renderer.handleSkillCastEvents(events);
      };

      socket.on('game:damageEvents', handleDamageEvents);
      socket.on('game:skillCastEvents', handleSkillCastEvents);

      let lastAOIUpdate = 0;
      const updateAOI = () => {
        const now = Date.now();
        if (now - lastAOIUpdate > 100 && rendererRef.current) {
          const camera = rendererRef.current.getCamera();
          if (camera && isInGame) {
            socket.setCameraPosition(camera.position.x, camera.position.y);
          }
          lastAOIUpdate = now;
        }
        if (isInGame) {
          requestAnimationFrame(updateAOI);
        }
      };
      updateAOI();

      return () => {
        window.removeEventListener('resize', resize);
        renderer.stop();
        socket.off('game:damageEvents', handleDamageEvents);
        socket.off('game:skillCastEvents', handleSkillCastEvents);
      };
    } catch (error) {
      console.error('Failed to create SceneRenderer:', error);
    }

    return () => {
      window.removeEventListener('resize', resize);
    };
  }, [isInGame, handleEntityClick, handleGroundClick, handleSkillTarget]);

  useEffect(() => {
    if (rendererRef.current && gameState) {
      rendererRef.current.setGameState(gameState);
    }
  }, [gameState]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSelectedEntityId(selectedEntityId);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    if (rendererRef.current) {
      if (isInGame) {
        rendererRef.current.start();
      } else {
        rendererRef.current.stop();
      }
    }
  }, [isInGame]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
