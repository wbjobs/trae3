import type { GameState, Entity, MapConfig, DamageEvent, SkillCastEvent } from '../../shared/types';
import { Camera } from './Camera';
import { EntityRenderer } from './EntityRenderer';
import { ParticleSystem } from './ParticleSystem';
import { ConfigLoader } from './ConfigLoader';

interface RenderStats {
  fps: number;
  frameTime: number;
  entitiesRendered: number;
  particlesRendered: number;
}

export class SceneRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private camera: Camera;
  private entityRenderer: EntityRenderer;
  private particleSystem: ParticleSystem;
  private configLoader: ConfigLoader;
  private animationFrameId: number | null = null;
  private lastTime: number = 0;
  private isRunning: boolean = false;
  private selectedEntityId: string | null = null;
  private mouseWorldPos: { x: number; y: number } = { x: 0, y: 0 };
  private isDragging: boolean = false;
  private dragStart: { x: number; y: number } = { x: 0, y: 0 };
  private onEntityClick?: (entity: Entity) => void;
  private onGroundClick?: (x: number, y: number) => void;
  private onSkillTarget?: (x: number, y: number) => void;
  private pendingSkillId: string | null = null;
  private pendingEntityId: string | null = null;
  private gameState: GameState | null = null;
  private radarAngle: number = 0;
  private showPerformance: boolean = false;
  private stats: RenderStats = {
    fps: 0,
    frameTime: 0,
    entitiesRendered: 0,
    particlesRendered: 0
  };
  private frameCount: number = 0;
  private fpsAccumulator: number = 0;
  private frameTimeAccumulator: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;

    this.camera = new Camera(canvas.width, canvas.height);
    this.entityRenderer = new EntityRenderer();
    this.particleSystem = new ParticleSystem();
    this.configLoader = new ConfigLoader();
    
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 2) {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = this.camera.screenToWorld(screenX, screenY);

    if (this.pendingSkillId && this.pendingEntityId && this.onSkillTarget) {
      this.onSkillTarget(world.x, world.y);
      this.pendingSkillId = null;
      this.pendingEntityId = null;
      return;
    }

    const clickedEntity = this.findEntityAt(world.x, world.y);
    if (clickedEntity && this.onEntityClick) {
      this.selectedEntityId = clickedEntity.id;
      this.onEntityClick(clickedEntity);
    } else if (this.onGroundClick) {
      this.onGroundClick(world.x, world.y);
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    this.mouseWorldPos = this.camera.screenToWorld(screenX, screenY);

    if (this.isDragging) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.camera.move(dx, dy);
      this.dragStart = { x: e.clientX, y: e.clientY };
    }
  }

  private handleMouseUp(): void {
    this.isDragging = false;
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const centerX = e.clientX - rect.left;
    const centerY = e.clientY - rect.top;
    this.camera.adjustZoom(e.deltaY, centerX, centerY);
  }

  private findEntityAt(x: number, y: number): Entity | null {
    if (!this.gameState) return null;

    for (const entity of this.gameState.entities) {
      if (entity.state === 'dead') continue;
      const dx = x - entity.position.x;
      const dy = y - entity.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= entity.size + 5) {
        return entity;
      }
    }
    return null;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.animate();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animate(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = Math.min(now - this.lastTime, 100);
    this.lastTime = now;

    this.updateFpsStats(deltaTime);
    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  private updateFpsStats(deltaTime: number): void {
    this.frameCount++;
    this.fpsAccumulator += deltaTime;
    this.frameTimeAccumulator += deltaTime;

    if (this.fpsAccumulator >= 500) {
      this.stats.fps = Math.round((this.frameCount / this.fpsAccumulator) * 1000);
      this.stats.frameTime = Math.round((this.frameTimeAccumulator / this.frameCount) * 10) / 10;
      this.frameCount = 0;
      this.fpsAccumulator = 0;
      this.frameTimeAccumulator = 0;
    }
  }

  private update(deltaTime: number): void {
    this.camera.update();
    this.particleSystem.update(deltaTime);
    this.radarAngle += deltaTime * 0.002;
  }

  private getViewport(): { x: number; y: number; width: number; height: number } {
    const zoom = this.camera.zoom;
    const width = this.canvas.width / zoom;
    const height = this.canvas.height / zoom;
    const x = this.camera.position.x - width / 2;
    const y = this.camera.position.y - height / 2;
    return { x, y, width, height };
  }

  private render(): void {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    this.ctx.fillStyle = '#0a1628';
    this.ctx.fillRect(0, 0, width, height);

    this.camera.apply(this.ctx);

    if (this.gameState) {
      const viewport = this.getViewport();
      const mapConfig = this.configLoader.getMapConfig(this.gameState.mapId);

      if (mapConfig) {
        this.entityRenderer.renderMap(this.ctx, mapConfig);
        
        for (const spawn of mapConfig.spawnPoints) {
          this.entityRenderer.renderSpawnPoint(this.ctx, spawn.x, spawn.y, spawn.team);
        }
      }

      const sortedEntities = [...this.gameState.entities].sort((a, b) => {
        if (a.state === 'dead' && b.state !== 'dead') return -1;
        if (a.state !== 'dead' && b.state === 'dead') return 1;
        return a.position.y - b.position.y;
      });

      let renderedCount = 0;
      for (const entity of sortedEntities) {
        if (!this.entityRenderer.isEntityVisible(entity, viewport)) continue;

        const isSelected = entity.id === this.selectedEntityId;
        
        if (entity.state === 'moving' && Math.random() < 0.05) {
          this.particleSystem.emitTrail(
            entity.position.x,
            entity.position.y,
            entity.color + '40'
          );
        }
        
        this.entityRenderer.render(this.ctx, entity, isSelected);
        renderedCount++;
      }
      this.stats.entitiesRendered = renderedCount;

      this.particleSystem.render(this.ctx, viewport);
      this.stats.particlesRendered = this.particleSystem.getActiveCount();

      if (this.pendingSkillId) {
        this.renderSkillTarget();
      }
    }

    this.camera.reset(this.ctx);

    this.renderRadar();
    this.renderMousePosition();

    if (this.showPerformance) {
      this.renderPerformanceStats();
    }
  }

  private renderSkillTarget(): void {
    const skill = this.configLoader.getSkillConfig(this.pendingSkillId!);
    if (!skill) return;

    this.ctx.save();
    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = skill.color + '40';
    this.ctx.strokeStyle = skill.color;
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.arc(this.mouseWorldPos.x, this.mouseWorldPos.y, skill.radius || 30, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.restore();
  }

  private renderRadar(): void {
    if (!this.gameState) return;

    const mapConfig = this.configLoader.getMapConfig(this.gameState.mapId);
    if (!mapConfig) return;

    const radarSize = 150;
    const radarX = this.canvas.width - radarSize - 20;
    const radarY = this.canvas.height - radarSize - 20;
    const scaleX = radarSize / mapConfig.width;
    const scaleY = radarSize / mapConfig.height;

    this.ctx.save();
    
    this.ctx.fillStyle = 'rgba(10, 22, 40, 0.9)';
    this.ctx.beginPath();
    this.ctx.arc(radarX + radarSize / 2, radarY + radarSize / 2, radarSize / 2, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.2)';
    this.ctx.beginPath();
    this.ctx.moveTo(radarX + radarSize / 2, radarY);
    this.ctx.lineTo(
      radarX + radarSize / 2 + Math.cos(this.radarAngle) * radarSize / 2,
      radarY + radarSize / 2 + Math.sin(this.radarAngle) * radarSize / 2
    );
    this.ctx.stroke();

    for (const entity of this.gameState.entities) {
      if (entity.state === 'dead') continue;
      
      const ex = radarX + entity.position.x * scaleX;
      const ey = radarY + entity.position.y * scaleY;
      
      this.ctx.fillStyle = entity.color;
      this.ctx.beginPath();
      this.ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    const viewX = radarX + this.camera.position.x * scaleX;
    const viewY = radarY + this.camera.position.y * scaleY;
    const viewW = (this.canvas.width / this.camera.zoom) * scaleX;
    const viewH = (this.canvas.height / this.camera.zoom) * scaleY;
    
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(viewX, viewY, viewW, viewH);

    this.ctx.restore();
  }

  private renderMousePosition(): void {
    const screen = this.camera.worldToScreen(this.mouseWorldPos.x, this.mouseWorldPos.y);
    
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 212, 255, 0.8)';
    this.ctx.font = '12px monospace';
    this.ctx.fillText(
      `X: ${Math.floor(this.mouseWorldPos.x)} Y: ${Math.floor(this.mouseWorldPos.y)}`,
      screen.x + 15,
      screen.y - 10
    );
    this.ctx.restore();
  }

  private renderPerformanceStats(): void {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 160, 90);

    this.ctx.fillStyle = '#00d4ff';
    this.ctx.font = '11px monospace';
    this.ctx.fillText(`FPS: ${this.stats.fps}`, 20, 30);
    this.ctx.fillText(`Frame: ${this.stats.frameTime}ms`, 20, 45);
    this.ctx.fillText(`Entities: ${this.stats.entitiesRendered}`, 20, 60);
    this.ctx.fillText(`Particles: ${this.stats.particlesRendered}`, 20, 75);
    this.ctx.fillText(`Zoom: ${this.camera.zoom.toFixed(2)}x`, 20, 90);
    this.ctx.restore();
  }

  setGameState(state: GameState): void {
    this.gameState = state;
    
    if (this.selectedEntityId) {
      const entity = state.entities.find(e => e.id === this.selectedEntityId);
      if (!entity || entity.state === 'dead') {
        this.selectedEntityId = null;
      }
    }
  }

  handleDamageEvents(events: DamageEvent[]): void {
    for (const event of events) {
      this.particleSystem.emitHit(event.x, event.y, '#ff4444');
    }
  }

  handleSkillCastEvents(events: SkillCastEvent[]): void {
    for (const event of events) {
      const skill = this.configLoader.getSkillConfig(event.skillId);
      if (skill) {
        this.particleSystem.emitSkillCast(event.x, event.y, skill.color, skill.radius || 30);
      }
    }
  }

  setSelectedEntityId(id: string | null): void {
    this.selectedEntityId = id;
  }

  getSelectedEntityId(): string | null {
    return this.selectedEntityId;
  }

  setPendingSkill(entityId: string, skillId: string): void {
    this.pendingEntityId = entityId;
    this.pendingSkillId = skillId;
  }

  cancelPendingSkill(): void {
    this.pendingEntityId = null;
    this.pendingSkillId = null;
  }

  hasPendingSkill(): boolean {
    return this.pendingSkillId !== null;
  }

  getPendingSkillId(): string | null {
    return this.pendingSkillId;
  }

  getPendingEntityId(): string | null {
    return this.pendingEntityId;
  }

  setOnEntityClick(callback: (entity: Entity) => void): void {
    this.onEntityClick = callback;
  }

  setOnGroundClick(callback: (x: number, y: number) => void): void {
    this.onGroundClick = callback;
  }

  setOnSkillTarget(callback: (x: number, y: number) => void): void {
    this.onSkillTarget = callback;
  }

  setShowPerformance(show: boolean): void {
    this.showPerformance = show;
  }

  togglePerformance(): void {
    this.showPerformance = !this.showPerformance;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.camera.setSize(width, height);
  }

  getCamera(): Camera {
    return this.camera;
  }

  getParticleSystem(): ParticleSystem {
    return this.particleSystem;
  }

  focusOnEntity(entityId: string): void {
    if (!this.gameState) return;
    
    const entity = this.gameState.entities.find(e => e.id === entityId);
    if (entity) {
      this.camera.lookAt(entity.position.x, entity.position.y);
    }
  }

  getMapConfig(): MapConfig | null {
    if (!this.gameState) return null;
    return this.configLoader.getMapConfig(this.gameState.mapId);
  }
}
