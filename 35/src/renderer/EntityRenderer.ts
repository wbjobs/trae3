import type { Entity, MapConfig } from '../../shared/types';

interface ShapeCache {
  fighter: Path2D;
  tank: Path2D;
  ranged: Path2D;
  support: Path2D;
}

export class EntityRenderer {
  private shapeCache: ShapeCache | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;
  private lastMapHash: string = '';

  render(ctx: CanvasRenderingContext2D, entity: Entity, isSelected: boolean = false): void {
    if (entity.state === 'dead') {
      this.renderDeadEntity(ctx, entity);
      return;
    }

    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);

    if (isSelected) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, entity.size + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.size + 10);
    gradient.addColorStop(0, entity.color + '80');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, entity.size + 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(entity.rotation);

    ctx.fillStyle = entity.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    this.renderEntityShape(ctx, entity);

    ctx.restore();

    if (entity.state === 'attacking') {
      ctx.save();
      ctx.translate(entity.position.x, entity.position.y);
      ctx.rotate(entity.rotation);
      ctx.strokeStyle = entity.color;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(entity.size, 0, entity.size * 0.5, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(entity.position.x, entity.position.y);
    this.renderHealthBar(ctx, entity);
    this.renderSkillCooldowns(ctx, entity);
    ctx.restore();

    if (entity.targetPosition) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(entity.position.x, entity.position.y);
      ctx.lineTo(entity.targetPosition.x, entity.targetPosition.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private renderEntityShape(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const size = entity.size;

    if (entity.type === 'fighter') {
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, -size * 0.7);
      ctx.lineTo(-size * 0.3, 0);
      ctx.lineTo(-size * 0.7, size * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (entity.type === 'tank') {
      ctx.fillRect(-size, -size * 0.8, size * 2, size * 1.6);
      ctx.strokeRect(-size, -size * 0.8, size * 2, size * 1.6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -size * 0.15, size * 1.2, size * 0.3);
    } else if (entity.type === 'ranged') {
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(size * 0.5, 0);
      ctx.lineTo(size * 1.5, 0);
      ctx.stroke();
    } else if (entity.type === 'support') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * size;
        const y = Math.sin(angle) * size;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  private renderDeadEntity(ctx: CanvasRenderingContext2D, entity: Entity): void {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#666666';
    ctx.beginPath();
    ctx.arc(entity.position.x, entity.position.y, entity.size * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#999999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(entity.position.x - entity.size * 0.5, entity.position.y - entity.size * 0.5);
    ctx.lineTo(entity.position.x + entity.size * 0.5, entity.position.y + entity.size * 0.5);
    ctx.moveTo(entity.position.x + entity.size * 0.5, entity.position.y - entity.size * 0.5);
    ctx.lineTo(entity.position.x - entity.size * 0.5, entity.position.y + entity.size * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  private renderHealthBar(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const barWidth = entity.size * 2;
    const barHeight = 4;
    const barY = -entity.size - 12;
    const healthPercent = entity.health / entity.maxHealth;

    ctx.fillStyle = '#333333';
    ctx.fillRect(-barWidth / 2, barY, barWidth, barHeight);

    const healthColor = healthPercent > 0.6 ? '#22c55e' : healthPercent > 0.3 ? '#eab308' : '#ef4444';
    ctx.fillStyle = healthColor;
    ctx.fillRect(-barWidth / 2, barY, barWidth * healthPercent, barHeight);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barWidth / 2, barY, barWidth, barHeight);
  }

  private renderSkillCooldowns(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const skillCount = entity.skills.length;
    const size = 8;
    const spacing = 4;
    const totalWidth = skillCount * size + (skillCount - 1) * spacing;
    const startX = -totalWidth / 2;
    const y = entity.size + 8;

    for (let i = 0; i < skillCount; i++) {
      const skill = entity.skills[i];
      const x = startX + i * (size + spacing);
      const cooldownPercent = skill.maxCooldown > 0 ? skill.cooldown / skill.maxCooldown : 0;

      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x, y, size, size);

      if (cooldownPercent > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, size, size * cooldownPercent);
      } else {
        ctx.fillStyle = '#00d4ff';
        ctx.fillRect(x, y, size, size);
      }

      ctx.strokeStyle = '#4b5563';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, size, size);
    }
  }

  renderMap(ctx: CanvasRenderingContext2D, mapConfig: MapConfig): void {
    const mapHash = `${mapConfig.id}-${mapConfig.width}-${mapConfig.height}`;

    if (this.lastMapHash !== mapHash || !this.offscreenCanvas) {
      this.renderMapToCache(mapConfig);
      this.lastMapHash = mapHash;
    }

    if (this.offscreenCanvas) {
      ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  private renderMapToCache(mapConfig: MapConfig): void {
    this.offscreenCanvas = new OffscreenCanvas(mapConfig.width, mapConfig.height);
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    if (!this.offscreenCtx) return;

    const ctx = this.offscreenCtx;

    ctx.fillStyle = mapConfig.background;
    ctx.fillRect(0, 0, mapConfig.width, mapConfig.height);

    ctx.strokeStyle = 'rgba(0, 212, 255, 0.1)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= mapConfig.width; x += mapConfig.gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapConfig.height);
      ctx.stroke();
    }

    for (let y = 0; y <= mapConfig.height; y += mapConfig.gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(mapConfig.width, y);
      ctx.stroke();
    }

    for (const obstacle of mapConfig.obstacles) {
      const gradient = ctx.createLinearGradient(
        obstacle.x, obstacle.y,
        obstacle.x + obstacle.width, obstacle.y + obstacle.height
      );
      gradient.addColorStop(0, '#374151');
      gradient.addColorStop(0.5, '#4b5563');
      gradient.addColorStop(1, '#374151');

      ctx.fillStyle = gradient;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

      ctx.strokeStyle = '#00d4ff40';
      ctx.lineWidth = 2;
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }

    ctx.strokeStyle = '#00d4ff';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, mapConfig.width, mapConfig.height);
  }

  renderSpawnPoint(ctx: CanvasRenderingContext2D, x: number, y: number, team: number): void {
    const color = team === 0 ? '#00d4ff' : '#ff6b35';

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  isEntityVisible(entity: Entity, viewport: { x: number; y: number; width: number; height: number }): boolean {
    const margin = entity.size * 3;
    return (
      entity.position.x + margin >= viewport.x &&
      entity.position.x - margin <= viewport.x + viewport.width &&
      entity.position.y + margin >= viewport.y &&
      entity.position.y - margin <= viewport.y + viewport.height
    );
  }

  clearCache(): void {
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.lastMapHash = '';
  }
}
