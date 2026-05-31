import type { Vector2 } from '../../shared/types';

export class Camera {
  position: Vector2 = { x: 0, y: 0 };
  targetPosition: Vector2 = { x: 0, y: 0 };
  zoom: number = 1;
  targetZoom: number = 1;
  minZoom: number = 0.5;
  maxZoom: number = 2;
  smoothness: number = 0.1;
  width: number = 800;
  height: number = 600;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  update(): void {
    this.position.x += (this.targetPosition.x - this.position.x) * this.smoothness;
    this.position.y += (this.targetPosition.y - this.position.y) * this.smoothness;
    this.zoom += (this.targetZoom - this.zoom) * this.smoothness;
  }

  lookAt(x: number, y: number): void {
    this.targetPosition.x = x - this.width / 2 / this.zoom;
    this.targetPosition.y = y - this.height / 2 / this.zoom;
  }

  move(dx: number, dy: number): void {
    this.targetPosition.x += dx / this.zoom;
    this.targetPosition.y += dy / this.zoom;
  }

  setZoom(zoom: number): void {
    this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  adjustZoom(delta: number, centerX?: number, centerY?: number): void {
    const oldZoom = this.targetZoom;
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + delta * 0.001));
    
    if (centerX !== undefined && centerY !== undefined) {
      const worldX = this.position.x + centerX / oldZoom;
      const worldY = this.position.y + centerY / oldZoom;
      
      this.targetZoom = newZoom;
      
      this.targetPosition.x = worldX - centerX / newZoom;
      this.targetPosition.y = worldY - centerY / newZoom;
    } else {
      this.targetZoom = newZoom;
    }
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: (worldX - this.position.x) * this.zoom,
      y: (worldY - this.position.y) * this.zoom
    };
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: screenX / this.zoom + this.position.x,
      y: screenY / this.zoom + this.position.y
    };
  }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.position.x, -this.position.y);
  }

  reset(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }
}
