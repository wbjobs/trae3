import { GameState, Position, Unit } from '../shared/types';
import { Renderer } from './renderer';

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  threshold: number;
  moved: boolean;
}

export class InputHandler {
  private gameState: GameState | null = null;
  private currentPlayerId: string | null = null;
  private selectedUnitId: string | null = null;
  private hoveredTile: Position | null = null;
  private lastMouseMoveTime: number = 0;
  private lastWheelTime: number = 0;
  private readonly mouseMoveThrottle: number = 16;
  private readonly wheelThrottle: number = 50;
  private boundHandlers: Map<string, EventListener> = new Map();
  private dragState: DragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    threshold: 5,
    moved: false
  };
  
  onUnitClick: ((unit: Unit) => void) | null = null;
  onTileClick: ((position: Position) => void) | null = null;
  onMoveRequest: ((unitId: string, targetPos: Position) => void) | null = null;
  onAttackRequest: ((attackerId: string, targetId: string) => void) | null = null;
  onHoverChange: ((tile: Position | null) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer
  ) {
    this.bindEvents();
  }

  private bindEvents(): void {
    const handlers: [string, EventListener][] = [
      ['click', this.handleClick.bind(this)],
      ['mousedown', this.handleMouseDown.bind(this)],
      ['mousemove', this.handleMouseMove.bind(this)],
      ['mouseup', this.handleMouseUp.bind(this)],
      ['mouseleave', this.handleMouseUp.bind(this)],
      ['wheel', this.handleWheel.bind(this)],
      ['touchstart', this.handleTouchStart.bind(this)],
      ['touchmove', this.handleTouchMove.bind(this)],
      ['touchend', this.handleTouchEnd.bind(this)]
    ];

    handlers.forEach(([event, handler]) => {
      this.canvas.addEventListener(event, handler, { passive: event !== 'wheel' });
      this.boundHandlers.set(event, handler);
    });

    const keyHandler = this.handleKeyDown.bind(this);
    window.addEventListener('keydown', keyHandler);
    this.boundHandlers.set('keydown', keyHandler);
  }

  setGameState(gameState: GameState): void {
    this.gameState = gameState;
  }

  setCurrentPlayerId(playerId: string): void {
    this.currentPlayerId = playerId;
  }

  selectUnit(unitId: string | null): void {
    this.selectedUnitId = unitId;
  }

  getSelectedUnit(): Unit | null {
    if (!this.gameState || !this.selectedUnitId) {
      return null;
    }
    return this.gameState.units.find(u => u.id === this.selectedUnitId) || null;
  }

  private getWorldPosition(clientX: number, clientY: number): Position {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return this.renderer.screenToWorld(screenX, screenY);
  }

  private getUnitAtPosition(pos: Position): Unit | null {
    if (!this.gameState) return null;
    return this.gameState.units.find(
      u => u.position.x === pos.x && u.position.y === pos.y
    ) || null;
  }

  handleClick(e: Event): void {
    const mouseEvent = e as MouseEvent;
    if (this.dragState.moved) {
      this.dragState.moved = false;
      return;
    }

    const worldPos = this.getWorldPosition(mouseEvent.clientX, mouseEvent.clientY);
    
    if (!this.gameState) {
      this.onTileClick?.(worldPos);
      return;
    }
    
    const clickedUnit = this.getUnitAtPosition(worldPos);
    
    if (clickedUnit) {
      if (this.selectedUnitId && clickedUnit.playerId !== this.currentPlayerId) {
        if (this.onAttackRequest && this.isInAttackRange(this.getSelectedUnit(), clickedUnit)) {
          this.onAttackRequest(this.selectedUnitId, clickedUnit.id);
          return;
        }
      }
      
      this.selectedUnitId = clickedUnit.id;
      this.onUnitClick?.(clickedUnit);
    } else {
      if (this.selectedUnitId && this.onMoveRequest) {
        const selectedUnit = this.getSelectedUnit();
        if (selectedUnit && this.isInMoveRange(selectedUnit, worldPos)) {
          this.onMoveRequest(this.selectedUnitId, worldPos);
          return;
        }
      }
      
      this.onTileClick?.(worldPos);
      this.selectedUnitId = null;
    }
  }

  handleMouseDown(e: Event): void {
    const mouseEvent = e as MouseEvent;
    if (mouseEvent.button === 2 || mouseEvent.button === 1) {
      this.dragState.isDragging = true;
      this.dragState.startX = mouseEvent.clientX;
      this.dragState.startY = mouseEvent.clientY;
      this.dragState.lastX = mouseEvent.clientX;
      this.dragState.lastY = mouseEvent.clientY;
      this.dragState.moved = false;
      mouseEvent.preventDefault();
    }
  }

  handleMouseUp(_e: Event): void {
    this.dragState.isDragging = false;
  }

  handleMouseMove(e: Event): void {
    const mouseEvent = e as MouseEvent;
    const now = performance.now();
    
    if (this.dragState.isDragging) {
      const dx = mouseEvent.clientX - this.dragState.lastX;
      const dy = mouseEvent.clientY - this.dragState.lastY;
      
      const totalDx = Math.abs(mouseEvent.clientX - this.dragState.startX);
      const totalDy = Math.abs(mouseEvent.clientY - this.dragState.startY);
      if (totalDx > this.dragState.threshold || totalDy > this.dragState.threshold) {
        this.dragState.moved = true;
      }
      
      if (this.dragState.moved) {
        this.renderer.panCamera(dx, dy);
      }
      
      this.dragState.lastX = mouseEvent.clientX;
      this.dragState.lastY = mouseEvent.clientY;
      return;
    }

    if (now - this.lastMouseMoveTime < this.mouseMoveThrottle) {
      return;
    }
    this.lastMouseMoveTime = now;

    const worldPos = this.getWorldPosition(mouseEvent.clientX, mouseEvent.clientY);
    
    if (!this.hoveredTile || 
        this.hoveredTile.x !== worldPos.x || 
        this.hoveredTile.y !== worldPos.y) {
      this.hoveredTile = worldPos;
      this.onHoverChange?.(worldPos);
    }
  }

  handleWheel(e: Event): void {
    const wheelEvent = e as WheelEvent;
    wheelEvent.preventDefault();
    
    const now = performance.now();
    if (now - this.lastWheelTime < this.wheelThrottle) {
      return;
    }
    this.lastWheelTime = now;
    
    const delta = wheelEvent.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = this.renderer.zoom + delta;
    this.renderer.setZoom(newZoom);
  }

  handleTouchStart(e: Event): void {
    const touchEvent = e as TouchEvent;
    if (touchEvent.touches.length === 1) {
      const touch = touchEvent.touches[0];
      this.dragState.startX = touch.clientX;
      this.dragState.startY = touch.clientY;
      this.dragState.lastX = touch.clientX;
      this.dragState.lastY = touch.clientY;
      this.dragState.moved = false;
    }
  }

  handleTouchMove(e: Event): void {
    const touchEvent = e as TouchEvent;
    touchEvent.preventDefault();
    
    if (touchEvent.touches.length === 1) {
      const touch = touchEvent.touches[0];
      const dx = touch.clientX - this.dragState.lastX;
      const dy = touch.clientY - this.dragState.lastY;
      
      const totalDx = Math.abs(touch.clientX - this.dragState.startX);
      const totalDy = Math.abs(touch.clientY - this.dragState.startY);
      if (totalDx > this.dragState.threshold || totalDy > this.dragState.threshold) {
        this.dragState.moved = true;
        this.renderer.panCamera(dx, dy);
      }
      
      this.dragState.lastX = touch.clientX;
      this.dragState.lastY = touch.clientY;
    }
  }

  handleTouchEnd(e: Event): void {
    const touchEvent = e as TouchEvent;
    if (!this.dragState.moved && touchEvent.changedTouches.length === 1) {
      const touch = touchEvent.changedTouches[0];
      const worldPos = this.getWorldPosition(touch.clientX, touch.clientY);
      this.handleClick({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    }
    this.dragState.isDragging = false;
  }

  private keyCooldown: Map<string, number> = new Map();
  private readonly keyCooldownMs: number = 100;

  handleKeyDown(e: Event): void {
    const keyboardEvent = e as KeyboardEvent;
    const now = performance.now();
    const lastPress = this.keyCooldown.get(keyboardEvent.key) || 0;
    
    if (now - lastPress < this.keyCooldownMs) {
      return;
    }
    this.keyCooldown.set(keyboardEvent.key, now);

    const panSpeed = 20;
    
    switch (keyboardEvent.key.toLowerCase()) {
      case 'w':
      case 'arrowup':
        this.renderer.panCamera(0, panSpeed);
        break;
      case 's':
      case 'arrowdown':
        this.renderer.panCamera(0, -panSpeed);
        break;
      case 'a':
      case 'arrowleft':
        this.renderer.panCamera(panSpeed, 0);
        break;
      case 'd':
      case 'arrowright':
        this.renderer.panCamera(-panSpeed, 0);
        break;
      case '+':
      case '=':
        this.renderer.setZoom(this.renderer.zoom + 0.1);
        break;
      case '-':
        this.renderer.setZoom(this.renderer.zoom - 0.1);
        break;
      case '0':
        this.renderer.setZoom(1);
        this.renderer.cameraOffset = { x: 0, y: 0 };
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        this.selectUnitByIndex(parseInt(keyboardEvent.key) - 1);
        break;
      case 'escape':
        this.selectedUnitId = null;
        break;
    }
  }

  private selectUnitByIndex(index: number): void {
    if (!this.gameState || !this.currentPlayerId) {
      return;
    }
    
    const playerUnits = this.gameState.units.filter(u => u.playerId === this.currentPlayerId);
    if (index >= 0 && index < playerUnits.length) {
      this.selectedUnitId = playerUnits[index].id;
      this.onUnitClick?.(playerUnits[index]);
    }
  }

  private isInMoveRange(unit: Unit | null, targetPos: Position): boolean {
    if (!unit) return false;
    
    const dx = Math.abs(unit.position.x - targetPos.x);
    const dy = Math.abs(unit.position.y - targetPos.y);
    return dx + dy <= unit.moveRange;
  }

  private isInAttackRange(attacker: Unit | null, target: Unit): boolean {
    if (!attacker) return false;
    
    const dx = Math.abs(attacker.position.x - target.position.x);
    const dy = Math.abs(attacker.position.y - target.position.y);
    return dx + dy <= attacker.attackRange;
  }

  getSelectedUnitId(): string | null {
    return this.selectedUnitId;
  }

  getHoveredTile(): Position | null {
    return this.hoveredTile;
  }

  destroy(): void {
    this.boundHandlers.forEach((handler, event) => {
      if (event === 'keydown') {
        window.removeEventListener(event, handler);
      } else {
        this.canvas.removeEventListener(event, handler);
      }
    });
    this.boundHandlers.clear();
  }
}
