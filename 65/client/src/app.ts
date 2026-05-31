import { SceneBuilder } from './scene/scene-builder';
import { NetworkManager } from './network/network-manager';
import { GameStateStore } from './network/game-state-store';
import { MessageType, BuildingType, PlotData, ResourceBag, ResourceType } from '../shared';

export class App {
  private sceneBuilder: SceneBuilder | null = null;
  private network: NetworkManager;
  private stateStore: GameStateStore;
  private selectedPlotId: string | null = null;
  private selectedBuilding: BuildingType = BuildingType.FARM;

  constructor() {
    this.network = new NetworkManager();
    this.stateStore = new GameStateStore(this.network);
  }

  init(container: HTMLElement): void {
    this.sceneBuilder = new SceneBuilder(container);
    this.setupEventBindings();
    this.setupUI();

    this.network.connect();
    this.showJoinDialog();
  }

  private setupEventBindings(): void {
    if (!this.sceneBuilder) return;

    this.sceneBuilder.setOnPlotClick((plotId) => {
      this.selectedPlotId = plotId;
      this.updatePlotInfo(plotId);
    });

    this.stateStore.on('plot:update', (plot: PlotData) => {
      if (this.sceneBuilder) {
        this.sceneBuilder.updatePlot(plot);
      }
    });

    this.stateStore.on('resource:update', () => {
      this.updateResourceDisplay();
    });

    this.stateStore.on('state:sync', () => {
      if (this.sceneBuilder && this.stateStore.getAllPlots().length > 0) {
        this.sceneBuilder.initPlots(this.stateStore.getAllPlots());
      }
    });

    this.stateStore.on('state:delta', (delta: any) => {
      if (this.sceneBuilder) {
        for (const pd of delta.plots || []) {
          this.sceneBuilder.applyPlotDelta(pd);
        }
      }
    });

    this.stateStore.on('build:result', (result: any) => {
      if (result.success) {
        this.showToast(`建造成功: ${result.plot.building}`);
      } else {
        this.showToast(`建造失败: ${result.reason}`);
      }
    });

    this.stateStore.on('demolish:result', (result: any) => {
      if (result.success) {
        this.showToast(`拆除成功`);
      } else {
        this.showToast(`拆除失败: ${result.reason}`);
      }
    });

    this.stateStore.on('player:list', () => {
      this.updatePlayerList();
    });
  }

  private setupUI(): void {
    const buildPanel = document.getElementById('build-panel');
    if (buildPanel) {
      const buildings = [
        BuildingType.CASTLE, BuildingType.FARM, BuildingType.MINE,
        BuildingType.BARRACKS, BuildingType.MARKET, BuildingType.WALL, BuildingType.TOWER,
      ];

      for (const bt of buildings) {
        const btn = document.createElement('button');
        btn.className = 'build-btn';
        btn.textContent = bt;
        btn.dataset.building = bt;
        btn.addEventListener('click', () => {
          this.selectedBuilding = bt;
          document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
        });
        if (bt === this.selectedBuilding) btn.classList.add('active');
        buildPanel.appendChild(btn);
      }

      const buildAction = document.createElement('button');
      buildAction.id = 'build-action';
      buildAction.textContent = '建造';
      buildAction.addEventListener('click', () => this.doBuild());
      buildPanel.appendChild(buildAction);

      const demolishAction = document.createElement('button');
      demolishAction.id = 'demolish-action';
      demolishAction.textContent = '拆除';
      demolishAction.addEventListener('click', () => this.doDemolish());
      buildPanel.appendChild(demolishAction);
    }
  }

  private showJoinDialog(): void {
    const overlay = document.getElementById('join-overlay');
    const joinBtn = document.getElementById('join-btn');
    const nameInput = document.getElementById('player-name') as HTMLInputElement;

    if (joinBtn && overlay && nameInput) {
      joinBtn.addEventListener('click', () => {
        const name = nameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
        this.network.joinGame(name);
        overlay.style.display = 'none';

        this.network.on(MessageType.STATE_SYNC, (msg) => {
          if (!this.stateStore.getMyPlayerId()) {
            this.stateStore.setMyPlayerId(msg.playerId || '');
          }
        });
      });
    }
  }

  private doBuild(): void {
    if (!this.selectedPlotId) {
      this.showToast('请先选择一个地块');
      return;
    }
    this.network.requestBuild(this.selectedPlotId, this.selectedBuilding);
  }

  private doDemolish(): void {
    if (!this.selectedPlotId) {
      this.showToast('请先选择一个地块');
      return;
    }
    this.network.requestDemolish(this.selectedPlotId);
  }

  private updatePlotInfo(plotId: string): void {
    const plot = this.stateStore.getPlot(plotId);
    const infoEl = document.getElementById('plot-info');
    if (infoEl && plot) {
      infoEl.innerHTML = `
        <div class="info-row"><span>位置</span><span>${plot.position.x}, ${plot.position.y}</span></div>
        <div class="info-row"><span>地形</span><span>${plot.terrain}</span></div>
        <div class="info-row"><span>建筑</span><span>${plot.building}</span></div>
        <div class="info-row"><span>等级</span><span>${plot.level}</span></div>
        <div class="info-row"><span>所有者</span><span>${plot.ownerId || '无'}</span></div>
      `;
    }
  }

  private updateResourceDisplay(): void {
    const player = this.stateStore.getMyPlayer();
    const el = document.getElementById('resources');
    if (el && player) {
      const r = player.resources;
      el.innerHTML = `
        <span title="金币">🪙 ${r[ResourceType.GOLD]}</span>
        <span title="食物">🌾 ${r[ResourceType.FOOD]}</span>
        <span title="石头">🪨 ${r[ResourceType.STONE]}</span>
        <span title="木材">🪵 ${r[ResourceType.WOOD]}</span>
        <span title="铁矿">⛏️ ${r[ResourceType.IRON]}</span>
      `;
    }
  }

  private updatePlayerList(): void {
    const el = document.getElementById('player-list');
    if (el) {
      const players = Array.from((this.stateStore as any).players.values()) as any[];
      el.innerHTML = players.map(p =>
        `<div class="player-item" style="color:${p.color}">${p.name} (${p.status})</div>`
      ).join('');
    }
  }

  private showToast(message: string): void {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => container.removeChild(toast), 300);
    }, 2000);
  }

  dispose(): void {
    this.network.disconnect();
    if (this.sceneBuilder) this.sceneBuilder.dispose();
  }
}
