import type { GameState, GameAction, GameReplay, Position } from '../shared/types';
import { ActionType } from '../shared/types';
import { deepClone } from '../shared/utils';

export interface ReplayState {
  state: GameState;
  actionIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

export class ReplayEngine {
  private replay: GameReplay | null = null;
  private currentState: GameState | null = null;
  private currentActionIndex: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1;
  private timer: number | null = null;
  private onStateChange: ((state: GameState) => void) | null = null;
  private onActionApplied: ((action: GameAction, index: number) => void) | null = null;
  private onProgressChange: ((current: number, total: number) => void) | null = null;

  setOnStateChange(callback: (state: GameState) => void): void {
    this.onStateChange = callback;
  }

  setOnActionApplied(callback: (action: GameAction, index: number) => void): void {
    this.onActionApplied = callback;
  }

  setOnProgressChange(callback: (current: number, total: number) => void): void {
    this.onProgressChange = callback;
  }

  loadReplay(replay: GameReplay): void {
    this.stop();
    this.replay = replay;
    this.currentState = deepClone(replay.initialState);
    this.currentActionIndex = 0;
    this.isPlaying = false;
    this.playbackSpeed = 1;
    this.notifyStateChange();
    this.notifyProgressChange();
    console.log('[ReplayEngine] Replay loaded', { replayId: replay.id, actionCount: replay.actions.length });
  }

  unloadReplay(): void {
    this.stop();
    this.replay = null;
    this.currentState = null;
    this.currentActionIndex = 0;
    this.isPlaying = false;
  }

  play(): void {
    if (!this.replay || this.isPlaying) return;
    if (this.currentActionIndex >= this.replay.actions.length) return;

    this.isPlaying = true;
    this.scheduleNextAction();
    console.log('[ReplayEngine] Playback started', { speed: this.playbackSpeed });
  }

  pause(): void {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[ReplayEngine] Playback paused');
  }

  stop(): void {
    this.pause();
    if (this.replay) {
      this.currentState = deepClone(this.replay.initialState);
      this.currentActionIndex = 0;
      this.notifyStateChange();
      this.notifyProgressChange();
    }
    console.log('[ReplayEngine] Playback stopped');
  }

  stepForward(): boolean {
    if (!this.replay || !this.currentState) return false;
    if (this.currentActionIndex >= this.replay.actions.length) return false;

    const action = this.replay.actions[this.currentActionIndex];
    this.applyAction(this.currentState, action);
    this.currentActionIndex++;
    this.notifyStateChange();
    this.notifyProgressChange();
    this.notifyActionApplied(action, this.currentActionIndex - 1);
    return true;
  }

  stepBackward(): boolean {
    if (!this.replay || this.currentActionIndex <= 0) return false;

    this.currentActionIndex--;
    this.rebuildState();
    return true;
  }

  seekTo(actionIndex: number): void {
    if (!this.replay) return;
    if (actionIndex < 0 || actionIndex > this.replay.actions.length) return;

    const wasPlaying = this.isPlaying;
    this.pause();

    this.currentActionIndex = actionIndex;
    this.rebuildState();

    if (wasPlaying && actionIndex < this.replay.actions.length) {
      this.play();
    }
  }

  setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.25, Math.min(4, speed));
    console.log('[ReplayEngine] Playback speed changed', { speed: this.playbackSpeed });
  }

  getState(): ReplayState | null {
    if (!this.replay || !this.currentState) return null;
    return {
      state: this.currentState,
      actionIndex: this.currentActionIndex,
      isPlaying: this.isPlaying,
      playbackSpeed: this.playbackSpeed
    };
  }

  getTotalActions(): number {
    return this.replay?.actions.length || 0;
  }

  isLoaded(): boolean {
    return this.replay !== null;
  }

  private rebuildState(): void {
    if (!this.replay) return;

    this.currentState = deepClone(this.replay.initialState);

    for (let i = 0; i < this.currentActionIndex; i++) {
      const action = this.replay.actions[i];
      this.applyAction(this.currentState, action);
    }

    this.notifyStateChange();
    this.notifyProgressChange();
  }

  private scheduleNextAction(): void {
    if (!this.isPlaying || !this.replay) return;
    if (this.currentActionIndex >= this.replay.actions.length) {
      this.isPlaying = false;
      console.log('[ReplayEngine] Playback completed');
      return;
    }

    const nextAction = this.replay.actions[this.currentActionIndex];
    let delay = 1000 / this.playbackSpeed;

    if (nextAction.type === ActionType.END_TURN) {
      delay = 1500 / this.playbackSpeed;
    } else if (nextAction.type === ActionType.ATTACK) {
      delay = 800 / this.playbackSpeed;
    }

    this.timer = window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.stepForward();
      this.scheduleNextAction();
    }, delay);
  }

  private applyAction(state: GameState, action: GameAction): void {
    switch (action.type) {
      case ActionType.MOVE:
        this.applyMove(state, action);
        break;
      case ActionType.ATTACK:
        this.applyAttack(state, action);
        break;
      case ActionType.END_TURN:
        this.applyEndTurn(state, action);
        break;
      case ActionType.APPLY_PLAN:
        state.updatedAt = new Date();
        break;
      case ActionType.GAME_START:
      case ActionType.GAME_END:
        break;
    }
  }

  private applyMove(state: GameState, action: GameAction): void {
    const { unitId, to } = action.data;
    const unit = state.units.find(u => u.id === unitId);
    if (unit) {
      unit.position = { ...to } as Position;
      unit.hasMoved = true;
      state.updatedAt = new Date();
    }
  }

  private applyAttack(state: GameState, action: GameAction): void {
    const { attackerId, targetId, targetHealth } = action.data;
    const attacker = state.units.find(u => u.id === attackerId);
    const target = state.units.find(u => u.id === targetId);

    if (attacker) {
      attacker.hasAttacked = true;
    }

    if (target) {
      target.health = targetHealth;
      if (targetHealth <= 0) {
        state.units = state.units.filter(u => u.id !== targetId);
      }
    }

    state.updatedAt = new Date();
  }

  private applyEndTurn(state: GameState, action: GameAction): void {
    const { nextPlayer } = action.data;
    state.currentTurn = nextPlayer;

    for (const unit of state.units) {
      if (unit.playerId === nextPlayer) {
        unit.hasMoved = false;
        unit.hasAttacked = false;
      }
    }

    state.updatedAt = new Date();
  }

  private notifyStateChange(): void {
    if (this.onStateChange && this.currentState) {
      this.onStateChange(this.currentState);
    }
  }

  private notifyProgressChange(): void {
    if (this.onProgressChange) {
      this.onProgressChange(this.currentActionIndex, this.getTotalActions());
    }
  }

  private notifyActionApplied(action: GameAction, index: number): void {
    if (this.onActionApplied) {
      this.onActionApplied(action, index);
    }
  }
}
