import { GameState, Player, SocketEvent, TacticalPlan, GameReplay } from '../shared/types';
import { GameClient } from './gameClient';

interface PlanListItem extends TacticalPlan {
  element: HTMLElement;
}

interface ReplayListItem extends GameReplay {
  element: HTMLElement;
}

export class UIManager {
  private gameClient: GameClient;
  private selectedGameId: string | null = null;

  private lobbyElement: HTMLElement | null = null;
  private gameElement: HTMLElement | null = null;
  private gameListElement: HTMLElement | null = null;
  private createGameBtn: HTMLButtonElement | null = null;
  private joinGameBtn: HTMLButtonElement | null = null;
  private playerNameInput: HTMLInputElement | null = null;
  private gameInfoElement: HTMLElement | null = null;
  private playerListElement: HTMLElement | null = null;
  private chatMessagesElement: HTMLElement | null = null;
  private chatInputElement: HTMLInputElement | null = null;
  private chatSendBtn: HTMLButtonElement | null = null;
  private readyBtn: HTMLButtonElement | null = null;
  private startBtn: HTMLButtonElement | null = null;
  private endTurnBtn: HTMLButtonElement | null = null;
  private toastElement: HTMLElement | null = null;
  private statusElement: HTMLElement | null = null;

  private planNameInput: HTMLInputElement | null = null;
  private savePlanBtn: HTMLButtonElement | null = null;
  private planListElement: HTMLElement | null = null;
  private refreshPlansBtn: HTMLButtonElement | null = null;

  private replayNameInput: HTMLInputElement | null = null;
  private saveReplayBtn: HTMLButtonElement | null = null;
  private replayListElement: HTMLElement | null = null;
  private refreshReplaysBtn: HTMLButtonElement | null = null;
  private replayControlsElement: HTMLElement | null = null;
  private replayProgressText: HTMLElement | null = null;
  private replayProgressSlider: HTMLInputElement | null = null;
  private replayPlayBtn: HTMLButtonElement | null = null;
  private replayPauseBtn: HTMLButtonElement | null = null;
  private replayStopBtn: HTMLButtonElement | null = null;
  private replayPrevBtn: HTMLButtonElement | null = null;
  private replayNextBtn: HTMLButtonElement | null = null;
  private replaySpeedSelect: HTMLSelectElement | null = null;

  private plans: TacticalPlan[] = [];
  private replays: GameReplay[] = [];

  constructor(gameClient: GameClient) {
    this.gameClient = gameClient;
  }

  init(): void {
    this.lobbyElement = document.getElementById('lobby');
    this.gameElement = document.getElementById('game');
    this.gameListElement = document.getElementById('gameList');
    this.createGameBtn = document.getElementById('createGameBtn') as HTMLButtonElement;
    this.joinGameBtn = document.getElementById('joinGameBtn') as HTMLButtonElement;
    this.playerNameInput = document.getElementById('playerName') as HTMLInputElement;
    this.gameInfoElement = document.getElementById('gameInfo');
    this.playerListElement = document.getElementById('playerList');
    this.chatMessagesElement = document.getElementById('chatMessages');
    this.chatInputElement = document.getElementById('chatInput') as HTMLInputElement;
    this.chatSendBtn = document.getElementById('chatSendBtn') as HTMLButtonElement;
    this.readyBtn = document.getElementById('readyBtn') as HTMLButtonElement;
    this.startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    this.endTurnBtn = document.getElementById('endTurnBtn') as HTMLButtonElement;
    this.toastElement = document.getElementById('toast');
    this.statusElement = document.getElementById('status');

    this.planNameInput = document.getElementById('planNameInput') as HTMLInputElement;
    this.savePlanBtn = document.getElementById('savePlanBtn') as HTMLButtonElement;
    this.planListElement = document.getElementById('planList');
    this.refreshPlansBtn = document.getElementById('refreshPlansBtn') as HTMLButtonElement;

    this.replayNameInput = document.getElementById('replayNameInput') as HTMLInputElement;
    this.saveReplayBtn = document.getElementById('saveReplayBtn') as HTMLButtonElement;
    this.replayListElement = document.getElementById('replayList');
    this.refreshReplaysBtn = document.getElementById('refreshReplaysBtn') as HTMLButtonElement;
    this.replayControlsElement = document.getElementById('replayControls');
    this.replayProgressText = document.getElementById('replayProgressText');
    this.replayProgressSlider = document.getElementById('replayProgressSlider') as HTMLInputElement;
    this.replayPlayBtn = document.getElementById('replayPlayBtn') as HTMLButtonElement;
    this.replayPauseBtn = document.getElementById('replayPauseBtn') as HTMLButtonElement;
    this.replayStopBtn = document.getElementById('replayStopBtn') as HTMLButtonElement;
    this.replayPrevBtn = document.getElementById('replayPrevBtn') as HTMLButtonElement;
    this.replayNextBtn = document.getElementById('replayNextBtn') as HTMLButtonElement;
    this.replaySpeedSelect = document.getElementById('replaySpeedSelect') as HTMLSelectElement;

    this.bindEvents();
    this.setupNetworkListeners();
  }

  private bindEvents(): void {
    this.createGameBtn?.addEventListener('click', () => this.handleCreateGame());
    this.joinGameBtn?.addEventListener('click', () => this.handleJoinGame());
    this.readyBtn?.addEventListener('click', () => this.handleReady());
    this.startBtn?.addEventListener('click', () => this.handleStart());
    this.endTurnBtn?.addEventListener('click', () => this.handleEndTurn());
    this.chatSendBtn?.addEventListener('click', () => this.handleSendChat());
    this.chatInputElement?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.handleSendChat();
      }
    });

    this.savePlanBtn?.addEventListener('click', () => this.handleSavePlan());
    this.refreshPlansBtn?.addEventListener('click', () => this.refreshPlans());

    this.saveReplayBtn?.addEventListener('click', () => this.handleSaveReplay());
    this.refreshReplaysBtn?.addEventListener('click', () => this.refreshReplays());

    this.replayPlayBtn?.addEventListener('click', () => this.gameClient.getReplayEngine().play());
    this.replayPauseBtn?.addEventListener('click', () => this.gameClient.getReplayEngine().pause());
    this.replayStopBtn?.addEventListener('click', () => this.gameClient.getReplayEngine().stop());
    this.replayPrevBtn?.addEventListener('click', () => this.gameClient.getReplayEngine().stepBackward());
    this.replayNextBtn?.addEventListener('click', () => this.gameClient.getReplayEngine().stepForward());
    this.replaySpeedSelect?.addEventListener('change', (e) => {
      const speed = parseFloat((e.target as HTMLSelectElement).value);
      this.gameClient.getReplayEngine().setPlaybackSpeed(speed);
    });
    this.replayProgressSlider?.addEventListener('input', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value);
      this.gameClient.getReplayEngine().seekTo(value);
    });
  }

  private setupNetworkListeners(): void {
    const networkClient = this.gameClient.getNetworkClient();

    networkClient.on(SocketEvent.GAME_STATE_UPDATE, (data: { gameState: GameState }) => {
      this.updateGameInfo(data.gameState);
      this.updatePlayerList(data.gameState.players);
    });

    networkClient.on(SocketEvent.INCREMENTAL_UPDATE, () => {
      const state = this.gameClient.getCurrentState();
      if (state) {
        this.updateGameInfo(state);
        this.updatePlayerList(state.players);
      }
    });

    networkClient.on(SocketEvent.GAME_START, (data: { gameState: GameState }) => {
      this.updateGameInfo(data.gameState);
      this.updatePlayerList(data.gameState.players);
      this.showSuccess('游戏开始！');
    });

    networkClient.on(SocketEvent.CHAT_MESSAGE, (data: { playerId: string; playerName: string; content: string }) => {
      this.addChatMessage(data.playerName, data.content);
    });

    networkClient.on(SocketEvent.ERROR, (data: { message: string }) => {
      this.showError(data.message);
    });
  }

  showLobby(): void {
    if (this.lobbyElement) {
      this.lobbyElement.style.display = 'flex';
    }
    if (this.gameElement) {
      this.gameElement.style.display = 'none';
    }
    this.refreshGameList();
  }

  showGame(): void {
    if (this.lobbyElement) {
      this.lobbyElement.style.display = 'none';
    }
    if (this.gameElement) {
      this.gameElement.style.display = 'flex';
    }
    this.refreshPlans();
    this.refreshReplays();
  }

  async refreshGameList(): Promise<void> {
    try {
      const networkClient = this.gameClient.getNetworkClient();
      const games = await networkClient.listGames();
      this.updateGameList(games);
    } catch (error) {
      this.showError('获取游戏列表失败');
    }
  }

  updateGameList(games: GameState[]): void {
    if (!this.gameListElement) return;

    this.gameListElement.innerHTML = '';

    if (games.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'game-list-empty';
      emptyItem.textContent = '暂无可用游戏，创建一个吧！';
      this.gameListElement.appendChild(emptyItem);
      return;
    }

    games.forEach((game) => {
      const item = document.createElement('div');
      item.className = 'game-list-item';
      if (game.id === this.selectedGameId) {
        item.classList.add('selected');
      }

      const name = document.createElement('div');
      name.className = 'game-name';
      name.textContent = game.name;

      const info = document.createElement('div');
      info.className = 'game-info';
      info.textContent = `玩家: ${game.players.length}/2 | 状态: ${this.getStatusText(game.status)}`;

      item.appendChild(name);
      item.appendChild(info);

      item.addEventListener('click', () => {
        this.selectedGameId = game.id;
        this.updateGameList(games);
      });

      if (this.gameListElement) {
        this.gameListElement.appendChild(item);
      }
    });
  }

  private getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      waiting: '等待中',
      playing: '进行中',
      finished: '已结束'
    };
    return statusMap[status] || status;
  }

  updateGameInfo(gameState: GameState): void {
    if (!this.gameInfoElement) return;

    const currentPlayer = this.gameClient.getCurrentPlayer();
    const isMyTurn = currentPlayer && gameState.currentTurn === currentPlayer.id;

    this.gameInfoElement.innerHTML = `
      <div class="game-info-header">
        <h3>${gameState.name}</h3>
        <span class="game-status ${gameState.status}">${this.getStatusText(gameState.status)}</span>
      </div>
      <div class="game-info-details">
        <div class="info-row">
          <span class="label">回合:</span>
          <span class="value ${isMyTurn ? 'my-turn' : ''}">
            ${this.getPlayerNameById(gameState.players, gameState.currentTurn)}
            ${isMyTurn ? '(你的回合)' : ''}
          </span>
        </div>
        <div class="info-row">
          <span class="label">阶段:</span>
          <span class="value">${gameState.phase}</span>
        </div>
      </div>
    `;

    this.updateActionButtons(gameState);
  }

  private getPlayerNameById(players: Player[], playerId: string): string {
    const player = players.find((p) => p.id === playerId);
    return player?.name || '未知玩家';
  }

  updatePlayerList(players: Player[]): void {
    if (!this.playerListElement) return;

    const currentPlayer = this.gameClient.getCurrentPlayer();

    this.playerListElement.innerHTML = '';

    players.forEach((player) => {
      const item = document.createElement('div');
      item.className = 'player-list-item';
      if (currentPlayer && player.id === currentPlayer.id) {
        item.classList.add('current-player');
      }

      const name = document.createElement('div');
      name.className = 'player-name';
      name.textContent = player.name;

      const badges = document.createElement('div');
      badges.className = 'player-badges';

      if (player.isReady) {
        const readyBadge = document.createElement('span');
        readyBadge.className = 'badge ready';
        readyBadge.textContent = '已准备';
        badges.appendChild(readyBadge);
      }

      const teamBadge = document.createElement('span');
      teamBadge.className = `badge team ${player.team}`;
      teamBadge.textContent = player.team === 'red' ? '红方' : '蓝方';
      badges.appendChild(teamBadge);

      item.appendChild(name);
      item.appendChild(badges);
      if (this.playerListElement) {
        this.playerListElement.appendChild(item);
      }
    });
  }

  addChatMessage(playerName: string, message: string): void {
    if (!this.chatMessagesElement) return;

    const msgElement = document.createElement('div');
    msgElement.className = 'chat-message';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-player';
    nameSpan.textContent = `${playerName}: `;

    const contentSpan = document.createElement('span');
    contentSpan.className = 'chat-content';
    contentSpan.textContent = message;

    msgElement.appendChild(nameSpan);
    msgElement.appendChild(contentSpan);
    this.chatMessagesElement.appendChild(msgElement);
    this.chatMessagesElement.scrollTop = this.chatMessagesElement.scrollHeight;
  }

  showError(message: string): void {
    this.showToast(message, 'error');
  }

  showSuccess(message: string): void {
    this.showToast(message, 'success');
  }

  private showToast(message: string, type: 'error' | 'success'): void {
    if (!this.toastElement) return;

    this.toastElement.textContent = message;
    this.toastElement.className = `toast ${type} show`;

    setTimeout(() => {
      if (this.toastElement) {
        this.toastElement.classList.remove('show');
      }
    }, 3000);
  }

  setActionButtonsEnabled(enabled: boolean): void {
    if (this.readyBtn) {
      this.readyBtn.disabled = !enabled;
    }
    if (this.startBtn) {
      this.startBtn.disabled = !enabled;
    }
    if (this.endTurnBtn) {
      this.endTurnBtn.disabled = !enabled;
    }
  }

  private updateActionButtons(gameState: GameState): void {
    const currentPlayer = this.gameClient.getCurrentPlayer();
    if (!currentPlayer) return;

    const isMyTurn = gameState.currentTurn === currentPlayer.id;
    const isWaiting = gameState.status === 'waiting';
    const isPlaying = gameState.status === 'playing';

    if (this.readyBtn) {
      this.readyBtn.style.display = isWaiting ? 'inline-block' : 'none';
      this.readyBtn.disabled = currentPlayer.isReady;
      this.readyBtn.textContent = currentPlayer.isReady ? '已准备' : '准备';
    }

    if (this.startBtn) {
      this.startBtn.style.display = isWaiting && gameState.players.length >= 2 ? 'inline-block' : 'none';
      this.startBtn.disabled = !gameState.players.every((p) => p.isReady);
    }

    if (this.endTurnBtn) {
      this.endTurnBtn.style.display = isPlaying ? 'inline-block' : 'none';
      this.endTurnBtn.disabled = !isMyTurn;
    }
  }

  private async handleCreateGame(): Promise<void> {
    const playerName = this.playerNameInput?.value.trim();
    if (!playerName) {
      this.showError('请输入玩家名称');
      return;
    }

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const gameName = `${playerName}的游戏`;
      const team = 'RED';
      const gameState = await networkClient.createGame(gameName, playerName, team);

      this.selectedGameId = gameState.id;
      this.showGame();
      this.updateGameInfo(gameState);
      this.updatePlayerList(gameState.players);
    } catch (error) {
      this.showError('创建游戏失败');
    }
  }

  private async handleJoinGame(): Promise<void> {
    const playerName = this.playerNameInput?.value.trim();
    if (!playerName) {
      this.showError('请输入玩家名称');
      return;
    }

    if (!this.selectedGameId) {
      this.showError('请选择一个游戏');
      return;
    }

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const result = await networkClient.joinGame(this.selectedGameId, playerName);

      if (result.success && result.game) {
        this.showGame();
        this.updateGameInfo(result.game);
        this.updatePlayerList(result.game.players);
      } else {
        this.showError(result.error || '加入游戏失败');
      }
    } catch (error) {
      this.showError('加入游戏失败');
    }
  }

  private handleReady(): void {
    const currentPlayer = this.gameClient.getCurrentPlayer();
    if (!currentPlayer) return;

    const networkClient = this.gameClient.getNetworkClient();
    networkClient.setReady(!currentPlayer.isReady);
  }

  private handleStart(): void {
    const networkClient = this.gameClient.getNetworkClient();
    networkClient.startGame();
  }

  private handleEndTurn(): void {
    const networkClient = this.gameClient.getNetworkClient();
    networkClient.endTurn();
  }

  private handleSendChat(): void {
    const message = this.chatInputElement?.value.trim();
    if (!message) return;

    const networkClient = this.gameClient.getNetworkClient();
    networkClient.sendChat(message);

    if (this.chatInputElement) {
      this.chatInputElement.value = '';
    }
  }

  setStatus(message: string): void {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
  }

  async refreshPlans(): Promise<void> {
    try {
      const networkClient = this.gameClient.getNetworkClient();
      const currentPlayer = this.gameClient.getCurrentPlayer();
      this.plans = await networkClient.listTacticalPlans(currentPlayer?.id);
      this.updatePlanList();
    } catch (error) {
      this.showError('获取战术方案列表失败');
    }
  }

  updatePlanList(): void {
    if (!this.planListElement) return;

    this.planListElement.innerHTML = '';

    if (this.plans.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'plan-list-empty';
      emptyItem.textContent = '暂无方案，保存一个吧！';
      this.planListElement.appendChild(emptyItem);
      return;
    }

    this.plans.forEach((plan) => {
      const item = document.createElement('div');
      item.className = 'plan-list-item';

      const name = document.createElement('div');
      name.className = 'plan-name';
      name.textContent = plan.name;

      const desc = document.createElement('div');
      desc.className = 'plan-desc';
      desc.textContent = plan.description || `${plan.deployments.length} 个部署`;

      const buttons = document.createElement('div');
      buttons.className = 'plan-buttons';

      const applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-small btn-primary';
      applyBtn.textContent = '应用';
      applyBtn.addEventListener('click', () => this.handleApplyPlan(plan.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-small btn-danger';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', () => this.handleDeletePlan(plan.id));

      buttons.appendChild(applyBtn);
      buttons.appendChild(deleteBtn);

      item.appendChild(name);
      item.appendChild(desc);
      item.appendChild(buttons);

      this.planListElement?.appendChild(item);
    });
  }

  private async handleSavePlan(): Promise<void> {
    const planName = this.planNameInput?.value.trim();
    if (!planName) {
      this.showError('请输入方案名称');
      return;
    }

    const currentState = this.gameClient.getCurrentState();
    const currentPlayer = this.gameClient.getCurrentPlayer();
    if (!currentState || !currentPlayer) {
      this.showError('请先进入游戏');
      return;
    }

    const playerUnits = currentState.units.filter(u => u.playerId === currentPlayer.id);
    if (playerUnits.length === 0) {
      this.showError('没有可保存的单位');
      return;
    }

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const result = await networkClient.saveTacticalPlan({
        name: planName,
        description: `包含 ${playerUnits.length} 个单位`,
        playerId: currentPlayer.id,
        mapId: 'default',
        team: currentPlayer.team || 'RED',
        deployments: playerUnits.map(u => ({
          type: u.type,
          unitType: u.type,
          position: u.position
        }))
      });

      if (!result) {
        this.showError('保存战术方案失败');
        return;
      }

      if (this.planNameInput) {
        this.planNameInput.value = '';
      }

      this.showSuccess('战术方案已保存');
      await this.refreshPlans();
    } catch (error) {
      this.showError('保存战术方案失败');
    }
  }

  private async handleApplyPlan(planId: string): Promise<void> {
    try {
      const networkClient = this.gameClient.getNetworkClient();
      const success = await networkClient.applyTacticalPlan(planId);
      if (success) {
        this.showSuccess('战术方案已应用');
      } else {
        this.showError('应用失败');
      }
    } catch (error) {
      this.showError('应用战术方案失败');
    }
  }

  private async handleDeletePlan(planId: string): Promise<void> {
    if (!confirm('确定要删除这个战术方案吗？')) return;

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const success = await networkClient.deleteTacticalPlan(planId);
      if (success) {
        this.showSuccess('战术方案已删除');
        await this.refreshPlans();
      } else {
        this.showError('删除失败');
      }
    } catch (error) {
      this.showError('删除战术方案失败');
    }
  }

  async refreshReplays(): Promise<void> {
    try {
      const networkClient = this.gameClient.getNetworkClient();
      this.replays = await networkClient.listReplays();
      this.updateReplayList();
    } catch (error) {
      this.showError('获取回放列表失败');
    }
  }

  updateReplayList(): void {
    if (!this.replayListElement) return;

    this.replayListElement.innerHTML = '';

    if (this.replays.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'replay-list-empty';
      emptyItem.textContent = '暂无回放，保存一个吧！';
      this.replayListElement.appendChild(emptyItem);
      return;
    }

    this.replays.forEach((replay) => {
      const item = document.createElement('div');
      item.className = 'replay-list-item';

      const name = document.createElement('div');
      name.className = 'replay-name';
      name.textContent = replay.name;

      const info = document.createElement('div');
      info.className = 'replay-info';
      const duration = Math.round(replay.duration / 1000);
      info.textContent = `${replay.actions.length} 步 | ${duration}秒 | ${replay.playerCount} 玩家`;

      const buttons = document.createElement('div');
      buttons.className = 'replay-buttons';

      const loadBtn = document.createElement('button');
      loadBtn.className = 'btn btn-small btn-primary';
      loadBtn.textContent = '加载';
      loadBtn.addEventListener('click', () => this.handleLoadReplay(replay.id));

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-small btn-danger';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', () => this.handleDeleteReplay(replay.id));

      buttons.appendChild(loadBtn);
      buttons.appendChild(deleteBtn);

      item.appendChild(name);
      item.appendChild(info);
      item.appendChild(buttons);

      this.replayListElement?.appendChild(item);
    });
  }

  updateReplayControls(currentAction: number, totalActions: number): void {
    if (this.replayProgressText) {
      this.replayProgressText.textContent = `${currentAction} / ${totalActions}`;
    }
    if (this.replayProgressSlider) {
      this.replayProgressSlider.max = totalActions.toString();
      this.replayProgressSlider.value = currentAction.toString();
    }
  }

  showReplayControls(): void {
    if (this.replayControlsElement) {
      this.replayControlsElement.style.display = 'block';
    }
  }

  hideReplayControls(): void {
    if (this.replayControlsElement) {
      this.replayControlsElement.style.display = 'none';
    }
  }

  private async handleSaveReplay(): Promise<void> {
    const replayName = this.replayNameInput?.value.trim();
    if (!replayName) {
      this.showError('请输入回放名称');
      return;
    }

    const currentState = this.gameClient.getCurrentState();
    if (!currentState) {
      this.showError('请先进入游戏');
      return;
    }

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const result = await networkClient.saveReplay(currentState.id, replayName);
      if (result) {
        if (this.replayNameInput) {
          this.replayNameInput.value = '';
        }
        this.showSuccess('回放已保存');
        await this.refreshReplays();
      } else {
        this.showError('保存失败');
      }
    } catch (error) {
      this.showError('保存回放失败');
    }
  }

  private async handleLoadReplay(replayId: string): Promise<void> {
    try {
      const networkClient = this.gameClient.getNetworkClient();
      const result = await networkClient.loadReplay(replayId);
      if (result) {
        this.gameClient.getReplayEngine().loadReplay(result);
        this.showReplayControls();
        const total = this.gameClient.getReplayEngine().getTotalActions();
        this.updateReplayControls(0, total);
        this.showSuccess('回放已加载');
      } else {
        this.showError('加载失败');
      }
    } catch (error) {
      this.showError('加载回放失败');
    }
  }

  private async handleDeleteReplay(replayId: string): Promise<void> {
    if (!confirm('确定要删除这个回放吗？')) return;

    try {
      const networkClient = this.gameClient.getNetworkClient();
      const success = await networkClient.deleteReplay(replayId);
      if (success) {
        this.showSuccess('回放已删除');
        await this.refreshReplays();
      } else {
        this.showError('删除失败');
      }
    } catch (error) {
      this.showError('删除回放失败');
    }
  }
}
