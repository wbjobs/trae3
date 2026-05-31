import { GameState, Player, Position, SocketEvent } from '../shared/types';
import { NetworkClient } from './network';
import { Renderer } from './renderer';
import { InputHandler } from './inputHandler';
import { ReplayEngine } from './replayEngine';

export class GameClient {
  private networkClient: NetworkClient;
  private renderer: Renderer | null = null;
  private inputHandler: InputHandler | null = null;
  private replayEngine: ReplayEngine;
  private gameState: GameState | null = null;
  private animationFrameId: number | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor(
    private canvasElementId: string,
    private serverUrl: string
  ) {
    this.networkClient = new NetworkClient(serverUrl);
    this.replayEngine = new ReplayEngine();
  }

  async init(): Promise<void> {
    this.canvas = document.getElementById(this.canvasElementId) as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error(`Canvas element with id '${this.canvasElementId}' not found`);
    }

    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;

    this.renderer = new Renderer(this.canvas);
    this.inputHandler = new InputHandler(this.canvas, this.renderer);

    this.inputHandler.onMoveRequest = (unitId: string, targetPos: Position) => {
      this.networkClient.moveUnit(unitId, targetPos);
    };

    this.inputHandler.onAttackRequest = (attackerId: string, targetId: string) => {
      this.networkClient.attackUnit(attackerId, targetId);
    };

    this.inputHandler.onUnitClick = (unit) => {
      console.log('Unit clicked:', unit);
    };

    this.inputHandler.onTileClick = (position) => {
      console.log('Tile clicked:', position);
    };

    this.networkClient.on(SocketEvent.GAME_STATE_UPDATE, (data: { gameState: GameState }) => {
      this.gameState = data.gameState;
      if (this.inputHandler) {
        this.inputHandler.setGameState(this.gameState);
      }
    });

    this.networkClient.on(SocketEvent.GAME_START, (data: { gameState: GameState }) => {
      this.gameState = data.gameState;
      if (this.inputHandler) {
        this.inputHandler.setGameState(this.gameState);
      }
    });

    this.replayEngine.setOnStateChange((state) => {
      this.gameState = state;
      if (this.inputHandler) {
        this.inputHandler.setGameState(state);
      }
    });

    window.addEventListener('resize', this.handleResize.bind(this));
  }

  start(): void {
    this.gameLoop();
  }

  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize.bind(this));
  }

  private gameLoop(): void {
    this.render();
    this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
  }

  private render(): void {
    if (!this.renderer || !this.gameState) {
      return;
    }

    const selectedUnitId = this.inputHandler?.getSelectedUnitId() || null;
    this.renderer.render(this.gameState, selectedUnitId);
  }

  private handleResize(): void {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  getCurrentState(): GameState | null {
    return this.gameState;
  }

  getCurrentPlayer(): Player | null {
    return this.networkClient.currentPlayer;
  }

  getNetworkClient(): NetworkClient {
    return this.networkClient;
  }

  getRenderer(): Renderer | null {
    return this.renderer;
  }

  getInputHandler(): InputHandler | null {
    return this.inputHandler;
  }

  getReplayEngine(): ReplayEngine {
    return this.replayEngine;
  }

  async connect(): Promise<void> {
    await this.networkClient.connect();
  }

  disconnect(): void {
    this.networkClient.disconnect();
    this.stop();
  }
}
