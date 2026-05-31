import { GameState, Position, Unit } from '../shared/types';
import { UnitType, Team, DEFAULT_GAME_CONFIG } from '../shared/constants';

const UNIT_COLORS: { [key: string]: string } = {
  [UnitType.SOLDIER]: '#4CAF50',
  [UnitType.ARCHER]: '#2196F3',
  [UnitType.CAVALRY]: '#FF9800',
  [UnitType.MAGE]: '#9C27B0',
  [UnitType.HEALER]: '#E91E63',
  [UnitType.TANK]: '#607D8B'
};

const TEAM_COLORS: { [key: string]: string } = {
  [Team.RED]: '#F44336',
  [Team.BLUE]: '#2196F3'
};

interface RenderCache {
  mapCanvas: OffscreenCanvas | null;
  mapVersion: number;
  lastStateHash: string;
  lastSelectedUnitId: string | null;
  lastZoom: number;
  lastOffset: { x: number; y: number };
}

interface DirtyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  tileSize: number = 40;
  cameraOffset: { x: number; y: number } = { x: 0, y: 0 };
  zoom: number = 1;
  private maxFps: number = 60;
  private lastFrameTime: number = 0;
  private frameInterval: number = 1000 / 60;
  private renderPending: boolean = false;
  private currentState: GameState | null = null;
  private currentSelectedUnitId: string | null = null;

  private cache: RenderCache = {
    mapCanvas: null,
    mapVersion: 0,
    lastStateHash: '',
    lastSelectedUnitId: null,
    lastZoom: 1,
    lastOffset: { x: 0, y: 0 }
  };

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D rendering context');
    }
    this.ctx = context;
    this.frameInterval = 1000 / this.maxFps;
    this.initMapCache();
  }

  private initMapCache(): void {
    this.cache.mapCanvas = new OffscreenCanvas(
      DEFAULT_GAME_CONFIG.mapWidth * this.tileSize * 2,
      DEFAULT_GAME_CONFIG.mapHeight * this.tileSize * 2
    );
    this.renderMapToCache();
  }

  private renderMapToCache(): void {
    if (!this.cache.mapCanvas) return;
    
    const ctx = this.cache.mapCanvas.getContext('2d');
    if (!ctx) return;

    const { mapWidth, mapHeight } = DEFAULT_GAME_CONFIG;
    const tileSize = this.tileSize * 2;

    ctx.clearRect(0, 0, this.cache.mapCanvas.width, this.cache.mapCanvas.height);

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const screenX = x * tileSize;
        const screenY = y * tileSize;

        ctx.strokeStyle = '#2d2d44';
        ctx.lineWidth = 2;
        ctx.fillStyle = (x + y) % 2 === 0 ? '#16213e' : '#1a1a2e';
        ctx.fillRect(screenX, screenY, tileSize, tileSize);
        ctx.strokeRect(screenX, screenY, tileSize, tileSize);
      }
    }

    this.cache.mapVersion++;
  }

  private calculateStateHash(state: GameState, selectedUnitId: string | null): string {
    const unitStates = state.units.map(u => 
      `${u.id}:${u.position.x},${u.position.y}:${u.health}:${u.hasMoved}:${u.hasAttacked}`
    ).join('|');
    return `${state.id}:${state.version || 0}:${state.currentTurn}:${selectedUnitId}:${unitStates}`;
  }

  render(gameState: GameState, selectedUnitId: string | null): void {
    const now = performance.now();
    if (now - this.lastFrameTime < this.frameInterval) {
      if (!this.renderPending) {
        this.renderPending = true;
        requestAnimationFrame(() => {
          this.renderPending = false;
          this.render(gameState, selectedUnitId);
        });
      }
      return;
    }
    this.lastFrameTime = now;

    this.currentState = gameState;
    this.currentSelectedUnitId = selectedUnitId;

    const stateHash = this.calculateStateHash(gameState, selectedUnitId);
    const viewChanged = this.cache.lastZoom !== this.zoom ||
      this.cache.lastOffset.x !== this.cameraOffset.x ||
      this.cache.lastOffset.y !== this.cameraOffset.y;

    if (stateHash === this.cache.lastStateHash && !viewChanged) {
      return;
    }

    this.cache.lastStateHash = stateHash;
    this.cache.lastZoom = this.zoom;
    this.cache.lastOffset = { ...this.cameraOffset };

    this.performRender(gameState, selectedUnitId);
  }

  private performRender(gameState: GameState, selectedUnitId: string | null): void {
    this.clear();
    this.drawCachedMap();

    const selectedUnit = selectedUnitId ? gameState.units.find(u => u.id === selectedUnitId) : null;
    
    if (selectedUnit) {
      this.drawMoveRange(selectedUnit);
      this.drawAttackRange(selectedUnit);
    }

    this.drawUnits(gameState.units, selectedUnitId);
    this.drawUI(gameState);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private drawCachedMap(): void {
    if (!this.cache.mapCanvas) {
      this.drawMap(DEFAULT_GAME_CONFIG.mapWidth, DEFAULT_GAME_CONFIG.mapHeight, []);
      return;
    }

    const tileSize = this.tileSize * this.zoom;
    const scale = this.zoom * 0.5;
    const destWidth = this.cache.mapCanvas.width * scale;
    const destHeight = this.cache.mapCanvas.height * scale;

    this.ctx.drawImage(
      this.cache.mapCanvas,
      this.cameraOffset.x,
      this.cameraOffset.y,
      destWidth,
      destHeight
    );
  }

  drawMap(width: number, height: number, obstacles: Position[]): void {
    const tileSize = this.tileSize * this.zoom;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const screenPos = this.worldToScreen({ x, y, z: 0 });
        
        if (screenPos.x + tileSize < 0 || screenPos.x > this.canvas.width ||
            screenPos.y + tileSize < 0 || screenPos.y > this.canvas.height) {
          continue;
        }

        const isObstacle = obstacles.some(o => o.x === x && o.y === y);
        
        this.ctx.strokeStyle = '#2d2d44';
        this.ctx.lineWidth = 1;
        this.ctx.fillStyle = (x + y) % 2 === 0 ? '#16213e' : '#1a1a2e';
        
        if (isObstacle) {
          this.ctx.fillStyle = '#3d3d5c';
        }
        
        this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
        this.ctx.strokeRect(screenPos.x, screenPos.y, tileSize, tileSize);
      }
    }
  }

  drawUnits(units: Unit[], selectedUnitId: string | null): void {
    const visibleUnits = units.filter(u => {
      const screenPos = this.worldToScreen(u.position);
      const tileSize = this.tileSize * this.zoom;
      return screenPos.x + tileSize >= 0 && screenPos.x <= this.canvas.width &&
             screenPos.y + tileSize >= 0 && screenPos.y <= this.canvas.height;
    });

    visibleUnits.sort((a, b) => a.position.y - b.position.y);
    visibleUnits.forEach(unit => {
      const isSelected = unit.id === selectedUnitId;
      this.drawUnit(unit, isSelected);
    });
  }

  drawUnit(unit: Unit, isSelected: boolean): void {
    const screenPos = this.worldToScreen(unit.position);
    const tileSize = this.tileSize * this.zoom;
    const centerX = screenPos.x + tileSize / 2;
    const centerY = screenPos.y + tileSize / 2;
    const radius = tileSize * 0.35;
    
    const teamColor = TEAM_COLORS[unit.playerId] || '#888888';
    const unitColor = UNIT_COLORS[unit.type] || '#888888';
    
    if (isSelected) {
      this.ctx.shadowColor = '#FFD700';
      this.ctx.shadowBlur = 15;
      this.ctx.strokeStyle = '#FFD700';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }
    
    this.ctx.fillStyle = teamColor;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = unitColor;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
    this.ctx.fill();
    
    const healthPercent = unit.health / unit.maxHealth;
    const healthBarWidth = tileSize * 0.8;
    const healthBarHeight = 4;
    const healthBarX = screenPos.x + (tileSize - healthBarWidth) / 2;
    const healthBarY = screenPos.y + tileSize - 8;
    
    this.ctx.fillStyle = '#333';
    this.ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
    
    this.ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FF9800' : '#F44336';
    this.ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercent, healthBarHeight);
    
    if (tileSize > 20) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = `bold ${tileSize * 0.35}px Arial`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(unit.type.charAt(0).toUpperCase(), centerX, centerY);
    }

    if (unit.hasMoved || unit.hasAttacked) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawMoveRange(unit: Unit): void {
    const tileSize = this.tileSize * this.zoom;
    const tiles: Position[] = [];
    
    for (let dx = -unit.moveRange; dx <= unit.moveRange; dx++) {
      for (let dy = -unit.moveRange; dy <= unit.moveRange; dy++) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance <= unit.moveRange && distance > 0) {
          tiles.push({ x: unit.position.x + dx, y: unit.position.y + dy, z: 0 });
        }
      }
    }

    this.ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
    tiles.forEach(pos => {
      const screenPos = this.worldToScreen(pos);
      if (screenPos.x + tileSize >= 0 && screenPos.x <= this.canvas.width &&
          screenPos.y + tileSize >= 0 && screenPos.y <= this.canvas.height) {
        this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
      }
    });
  }

  drawAttackRange(unit: Unit): void {
    const tileSize = this.tileSize * this.zoom;
    const tiles: Position[] = [];
    
    for (let dx = -unit.attackRange; dx <= unit.attackRange; dx++) {
      for (let dy = -unit.attackRange; dy <= unit.attackRange; dy++) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance <= unit.attackRange && distance > 0) {
          tiles.push({ x: unit.position.x + dx, y: unit.position.y + dy, z: 0 });
        }
      }
    }

    this.ctx.fillStyle = 'rgba(244, 67, 54, 0.3)';
    tiles.forEach(pos => {
      const screenPos = this.worldToScreen(pos);
      if (screenPos.x + tileSize >= 0 && screenPos.x <= this.canvas.width &&
          screenPos.y + tileSize >= 0 && screenPos.y <= this.canvas.height) {
        this.ctx.fillRect(screenPos.x, screenPos.y, tileSize, tileSize);
      }
    });
  }

  drawUI(gameState: GameState): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, 10, 280, 120);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    
    this.ctx.fillText(`回合: ${gameState.currentTurn}`, 20, 20);
    this.ctx.fillText(`阶段: ${gameState.phase}`, 20, 42);
    this.ctx.fillText(`状态: ${gameState.status}`, 20, 64);
    
    const playersText = gameState.players.map(p => `${p.name}${p.isReady ? ' ✓' : ''}`).join(', ');
    this.ctx.fillText(`玩家: ${playersText}`, 20, 86);
    
    const unitCount = gameState.units.length;
    const redUnits = gameState.units.filter(u => u.playerId === gameState.players[0]?.id).length;
    const blueUnits = gameState.units.filter(u => u.playerId === gameState.players[1]?.id).length;
    this.ctx.fillText(`单位: 总${unitCount} / 红${redUnits} / 蓝${blueUnits}`, 20, 108);
  }

  screenToWorld(screenX: number, screenY: number): Position {
    const tileSize = this.tileSize * this.zoom;
    const x = Math.floor((screenX - this.cameraOffset.x) / tileSize);
    const y = Math.floor((screenY - this.cameraOffset.y) / tileSize);
    return { x, y, z: 0 };
  }

  worldToScreen(worldPos: Position): { x: number; y: number } {
    const tileSize = this.tileSize * this.zoom;
    const x = worldPos.x * tileSize + this.cameraOffset.x;
    const y = worldPos.y * tileSize + this.cameraOffset.y;
    return { x, y };
  }

  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(2, zoom));
  }

  panCamera(dx: number, dy: number): void {
    this.cameraOffset.x += dx;
    this.cameraOffset.y += dy;
  }

  setMaxFps(fps: number): void {
    this.maxFps = Math.max(15, Math.min(120, fps));
    this.frameInterval = 1000 / this.maxFps;
  }

  forceRender(): void {
    if (this.currentState) {
      this.cache.lastStateHash = '';
      this.performRender(this.currentState, this.currentSelectedUnitId);
    }
  }
}
