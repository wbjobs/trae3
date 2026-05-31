import { TankScene3D } from './js/scene3D.js';
import { WebSocketService } from './js/websocketService.js';
import { ApiService } from './js/apiService.js';

const UPDATE_THROTTLE = 50;
const MAX_ALERTS_DISPLAY = 20;

class TankMonitoringApp {
  constructor() {
    this.tanks = new Map();
    this.tankData = new Map();
    this.selectedTankId = null;
    this.alerts = [];
    this.pendingUpdates = new Map();
    this.updateTimeout = null;
    this.isUpdating = false;
    this.showPoints = false;
    this.cutMode = false;
    this.currentCutTankId = null;
    
    this.init();
  }

  async init() {
    this.initElements();
    this.initScene3D();
    this.initWebSocket();
    await this.loadTanks();
    this.initEventListeners();
    this.startClock();
  }

  initElements() {
    this.elements = {
      tankList: document.getElementById('tank-list'),
      alertList: document.getElementById('alert-list'),
      connectionStatus: document.getElementById('connection-status'),
      currentTime: document.getElementById('current-time'),
      tankDetail: document.getElementById('tank-detail'),
      detailTitle: document.getElementById('detail-title'),
      detailId: document.getElementById('detail-id'),
      detailType: document.getElementById('detail-type'),
      detailCapacity: document.getElementById('detail-capacity'),
      detailStatus: document.getElementById('detail-status'),
      detailLevel: document.getElementById('detail-level'),
      detailLevelBar: document.getElementById('detail-level-bar'),
      detailLevelPercent: document.getElementById('detail-level-percent'),
      detailPressure: document.getElementById('detail-pressure'),
      detailTemperature: document.getElementById('detail-temperature'),
      closeDetail: document.getElementById('close-detail'),
      viewHistory: document.getElementById('view-history'),
      viewAlerts: document.getElementById('view-alerts'),
      historyModal: document.getElementById('history-modal'),
      historyTitle: document.getElementById('history-title'),
      historyChart: document.getElementById('history-chart'),
      btnShowPoints: document.getElementById('btn-show-points'),
      btnCutMode: document.getElementById('btn-cut-mode'),
      btnResetView: document.getElementById('btn-reset-view'),
      cutControls: document.getElementById('cut-controls'),
      cutAngle: document.getElementById('cut-angle'),
      cutAngleValue: document.getElementById('cut-angle-value'),
      measurePointPopup: document.getElementById('measure-point-popup'),
      popupPointName: document.getElementById('popup-point-name'),
      popupPointType: document.getElementById('popup-point-type'),
      popupPointValue: document.getElementById('popup-point-value'),
      popupTankName: document.getElementById('popup-tank-name')
    };
  }

  initScene3D() {
    const container = document.getElementById('canvas-container');
    this.scene3D = new TankScene3D(container);
    
    this.scene3D.onTankSelect = (tankId) => {
      this.selectTank(tankId);
    };

    this.scene3D.onMeasurePointClick = (tankId, pointData) => {
      this.showMeasurePointPopup(tankId, pointData);
    };
  }

  initWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.hostname}:8080`;
    
    this.wsService = new WebSocketService(wsUrl);
    
    this.wsService.on('connected', () => {
      this.updateConnectionStatus(true);
      this.wsService.subscribe();
    });
    
    this.wsService.on('disconnected', () => {
      this.updateConnectionStatus(false);
    });
    
    this.wsService.on('tankData', (tankId, data) => {
      this.scheduleUpdate(tankId, data);
    });

    this.wsService.on('batchData', (batchData) => {
      Object.entries(batchData).forEach(([tankId, data]) => {
        this.scheduleUpdate(tankId, data);
      });
    });
    
    this.wsService.on('alert', (alert) => {
      this.addAlert(alert);
    });
    
    this.wsService.on('maxReconnectAttemptsReached', () => {
      this.showReconnectFailedMessage();
    });
    
    this.wsService.connect().catch(error => {
      console.error('WebSocket 连接失败:', error);
    });
  }

  scheduleUpdate(tankId, data) {
    this.tankData.set(tankId, data);
    this.pendingUpdates.set(tankId, data);

    if (!this.updateTimeout) {
      this.updateTimeout = setTimeout(() => {
        this.processPendingUpdates();
        this.updateTimeout = null;
      }, UPDATE_THROTTLE);
    }
  }

  processPendingUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updates = Array.from(this.pendingUpdates.entries());
    
    updates.forEach(([tankId, data]) => {
      this.scene3D.updateTankLevel(tankId, data.levelPercent);
      this.updateTankListItem(tankId, data);
      this.scene3D.updateMeasurePointValue(tankId, 'level', data.level);
      this.scene3D.updateMeasurePointValue(tankId, 'pressure', data.pressure);
      this.scene3D.updateMeasurePointValue(tankId, 'temperature', data.temperature);
    });

    if (this.selectedTankId && this.pendingUpdates.has(this.selectedTankId)) {
      this.updateTankDetail(this.selectedTankId, this.pendingUpdates.get(this.selectedTankId));
    }

    this.pendingUpdates.clear();
  }

  async loadTanks() {
    try {
      const tanks = await ApiService.getTanks();
      
      tanks.forEach(tank => {
        this.tanks.set(tank.id, tank);
      });

      this.scene3D.createTanksLazy(tanks, 2);
      
      this.renderTankList();
    } catch (error) {
      console.error('加载储罐列表失败:', error);
    }
  }

  initEventListeners() {
    this.elements.closeDetail.addEventListener('click', () => {
      this.hideTankDetail();
    });

    this.elements.viewHistory.addEventListener('click', () => {
      if (this.selectedTankId) {
        this.showHistoryModal();
      }
    });

    this.elements.viewAlerts.addEventListener('click', () => {
      if (this.selectedTankId) {
        this.showTankAlerts();
      }
    });

    this.elements.btnShowPoints.addEventListener('click', () => {
      this.toggleMeasurePoints();
    });

    this.elements.btnCutMode.addEventListener('click', () => {
      this.toggleCutMode();
    });

    this.elements.btnResetView.addEventListener('click', () => {
      this.resetView();
    });

    this.elements.cutAngle.addEventListener('input', (e) => {
      const angle = parseFloat(e.target.value);
      this.elements.cutAngleValue.textContent = `${angle}°`;
      if (this.currentCutTankId) {
        this.scene3D.rotateCutPlane(this.currentCutTankId, (angle * Math.PI) / 180);
      }
    });

    document.querySelector('.close-popup').addEventListener('click', () => {
      this.hideMeasurePointPopup();
    });

    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.dataset.modal;
        document.getElementById(modalId).classList.add('hidden');
      });
    });

    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('页面隐藏，暂停非关键更新');
      } else {
        console.log('页面可见，恢复更新');
      }
    });
  }

  toggleMeasurePoints() {
    this.showPoints = !this.showPoints;
    this.elements.btnShowPoints.classList.toggle('active', this.showPoints);
    
    this.tanks.forEach((tank, id) => {
      this.scene3D.showThicknessLabels(id, this.showPoints);
    });
  }

  toggleCutMode() {
    this.cutMode = !this.cutMode;
    this.elements.btnCutMode.classList.toggle('active', this.cutMode);
    this.elements.cutControls.classList.toggle('hidden', !this.cutMode);

    if (this.cutMode) {
      if (this.selectedTankId) {
        this.currentCutTankId = this.selectedTankId;
        this.scene3D.toggleCutMode(this.selectedTankId, true);
      }
    } else {
      if (this.currentCutTankId) {
        this.scene3D.toggleCutMode(this.currentCutTankId, false);
        this.currentCutTankId = null;
      }
    }
  }

  resetView() {
    this.scene3D.camera.position.set(80, 60, 100);
    this.scene3D.controls.target.set(0, 0, 0);
    this.scene3D.controls.update();
  }

  showMeasurePointPopup(tankId, pointData) {
    const tank = this.tanks.get(tankId);
    
    this.elements.popupPointName.textContent = pointData.pointName;
    
    const typeNames = {
      level: '液位',
      pressure: '压力',
      temperature: '温度',
      thickness: '壁厚'
    };
    this.elements.popupPointType.textContent = typeNames[pointData.pointType] || pointData.pointType;
    
    const units = {
      level: 'm³',
      pressure: 'MPa',
      temperature: '°C',
      thickness: 'mm'
    };
    
    const tankData = this.tankData.get(tankId);
    let value = pointData.value;
    
    if (pointData.pointType === 'level' && tankData) {
      value = tankData.level;
    } else if (pointData.pointType === 'pressure' && tankData) {
      value = tankData.pressure;
    } else if (pointData.pointType === 'temperature' && tankData) {
      value = tankData.temperature;
    }
    
    const unit = units[pointData.pointType] || '';
    this.elements.popupPointValue.textContent = value !== null ? `${value.toFixed(2)} ${unit}` : '-';
    this.elements.popupTankName.textContent = tank?.name || '-';

    const popup = this.elements.measurePointPopup;
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.classList.remove('hidden');
  }

  hideMeasurePointPopup() {
    this.elements.measurePointPopup.classList.add('hidden');
  }

  startClock() {
    const updateTime = () => {
      const now = new Date();
      this.elements.currentTime.textContent = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };
    
    updateTime();
    setInterval(updateTime, 1000);
  }

  updateConnectionStatus(connected) {
    const statusEl = this.elements.connectionStatus;
    if (connected) {
      statusEl.textContent = '已连接';
      statusEl.classList.remove('disconnected');
      statusEl.classList.add('connected');
    } else {
      statusEl.textContent = '重连中...';
      statusEl.classList.remove('connected');
      statusEl.classList.add('disconnected');
    }
  }

  showReconnectFailedMessage() {
    const statusEl = this.elements.connectionStatus;
    statusEl.textContent = '连接失败';
    statusEl.classList.remove('connected');
    statusEl.classList.add('disconnected');
  }

  renderTankList() {
    const fragment = document.createDocumentFragment();
    
    this.tanks.forEach((tank, id) => {
      const data = this.tankData.get(id) || {
        level: 0,
        levelPercent: 0,
        status: 'normal'
      };
      
      const item = document.createElement('div');
      item.className = 'tank-item';
      item.dataset.tankId = id;
      
      item.innerHTML = `
        <div class="tank-item-header">
          <span class="tank-name">${tank.name}</span>
          <span class="tank-status ${data.status}"></span>
        </div>
        <div class="tank-item-info">
          <span>${tank.type}</span>
          <span class="tank-level-value">${data.levelPercent.toFixed(1)}%</span>
        </div>
        <div class="tank-level-bar">
          <div class="tank-level-fill" style="width: ${data.levelPercent}%"></div>
        </div>
      `;
      
      item.addEventListener('click', () => {
        this.selectTank(id);
      });
      
      fragment.appendChild(item);
    });

    this.elements.tankList.innerHTML = '';
    this.elements.tankList.appendChild(fragment);
  }

  updateTankData(tankId, data) {
    this.tankData.set(tankId, data);
  }

  updateTankListItem(tankId, data) {
    const item = document.querySelector(`.tank-item[data-tank-id="${tankId}"]`);
    if (!item) return;
    
    const statusEl = item.querySelector('.tank-status');
    statusEl.className = `tank-status ${data.status}`;
    
    const percentEl = item.querySelector('.tank-level-value');
    percentEl.textContent = `${data.levelPercent.toFixed(1)}%`;
    
    const fillEl = item.querySelector('.tank-level-fill');
    fillEl.style.width = `${data.levelPercent}%`;
  }

  selectTank(tankId) {
    this.selectedTankId = tankId;
    this.scene3D.highlightTank(tankId);
    
    document.querySelectorAll('.tank-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.tankId === tankId);
    });
    
    this.showTankDetail(tankId);

    if (this.cutMode) {
      if (this.currentCutTankId && this.currentCutTankId !== tankId) {
        this.scene3D.toggleCutMode(this.currentCutTankId, false);
      }
      this.currentCutTankId = tankId;
      this.scene3D.toggleCutMode(tankId, true);
    }
  }

  showTankDetail(tankId) {
    const tank = this.tanks.get(tankId);
    const data = this.tankData.get(tankId);
    
    if (!tank) return;
    
    this.elements.detailTitle.textContent = tank.name;
    this.elements.detailId.textContent = tank.id;
    this.elements.detailType.textContent = tank.type;
    this.elements.detailCapacity.textContent = `${tank.capacity} ${tank.unit}`;
    
    if (data) {
      this.updateTankDetail(tankId, data);
    }
    
    this.elements.tankDetail.classList.remove('hidden');
  }

  updateTankDetail(tankId, data) {
    const statusEl = this.elements.detailStatus;
    statusEl.textContent = this.getStatusText(data.status);
    statusEl.className = `status-badge ${data.status}`;
    
    this.elements.detailLevel.textContent = data.level.toFixed(2);
    this.elements.detailLevelBar.style.width = `${data.levelPercent}%`;
    this.elements.detailLevelPercent.textContent = `${data.levelPercent.toFixed(1)}%`;
    this.elements.detailPressure.textContent = data.pressure.toFixed(3);
    this.elements.detailTemperature.textContent = data.temperature.toFixed(1);
  }

  hideTankDetail() {
    this.selectedTankId = null;
    this.scene3D.highlightTank(null);
    document.querySelectorAll('.tank-item').forEach(item => {
      item.classList.remove('selected');
    });
    this.elements.tankDetail.classList.add('hidden');
  }

  getStatusText(status) {
    const texts = {
      normal: '正常',
      warning: '警告',
      critical: '严重'
    };
    return texts[status] || status;
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    if (this.alerts.length > MAX_ALERTS_DISPLAY * 3) {
      this.alerts.length = MAX_ALERTS_DISPLAY * 3;
    }
    
    this.renderAlerts();
  }

  renderAlerts() {
    if (this.alerts.length === 0) {
      this.elements.alertList.innerHTML = '<div class="no-alerts">暂无报警</div>';
      return;
    }
    
    const fragment = document.createDocumentFragment();
    
    this.alerts.slice(0, MAX_ALERTS_DISPLAY).forEach(alert => {
      const item = document.createElement('div');
      item.className = `alert-item ${alert.severity}`;
      
      const time = new Date(alert.timestamp).toLocaleTimeString('zh-CN');
      
      item.innerHTML = `
        <div class="alert-tank">${alert.tankName}</div>
        <div class="alert-message">${alert.message}</div>
        <div class="alert-time">${time}</div>
      `;
      
      fragment.appendChild(item);
    });

    this.elements.alertList.innerHTML = '';
    this.elements.alertList.appendChild(fragment);
  }

  async showHistoryModal() {
    const tank = this.tanks.get(this.selectedTankId);
    this.elements.historyTitle.textContent = `${tank.name} - 历史数据`;
    this.elements.historyModal.classList.remove('hidden');
    
    try {
      const history = await ApiService.getTankHistory(this.selectedTankId);
      this.renderHistoryChart(history);
    } catch (error) {
      console.error('加载历史数据失败:', error);
      this.elements.historyChart.innerHTML = '<div style="text-align:center;color:#888;padding:50px;">加载失败</div>';
    }
  }

  renderHistoryChart(data) {
    const container = this.elements.historyChart;
    container.innerHTML = '';
    
    if (data.length === 0) {
      container.innerHTML = '<div style="text-align:center;color:#888;padding:50px;">暂无数据</div>';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 30, right: 60, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const levelData = data.map(d => d.levelPercent);

    const drawLine = (values, color, minVal, maxVal) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      values.forEach((val, i) => {
        const x = padding.left + (i / (values.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((val - minVal) / (maxVal - minVal)) * chartHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
    };

    ctx.fillStyle = '#1a2744';
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);

    ctx.strokeStyle = '#2a4a7a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = padding.top + (i / 5) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    const maxLevel = Math.max(...levelData, 100);
    drawLine(levelData, '#00d4ff', 0, maxLevel);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText('液位 %', padding.left - 50, padding.top + 10);
    ctx.fillStyle = '#00d4ff';
    ctx.fillText('0', padding.left - 25, padding.top + chartHeight);
    ctx.fillText('100', padding.left - 35, padding.top + 10);

    ctx.strokeStyle = '#2a4a7a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.stroke();
  }

  async showTankAlerts() {
    try {
      const alerts = await ApiService.getTankAlerts(this.selectedTankId);
      const tank = this.tanks.get(this.selectedTankId);
      
      this.elements.historyTitle.textContent = `${tank.name} - 报警记录`;
      this.elements.historyModal.classList.remove('hidden');
      
      const container = this.elements.historyChart;
      container.innerHTML = '';
      
      if (alerts.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#888;padding:50px;">暂无报警记录</div>';
        return;
      }

      const alertList = document.createElement('div');
      alertList.style.cssText = 'max-height: 250px; overflow-y: auto;';
      
      alerts.forEach(alert => {
        const item = document.createElement('div');
        item.className = `alert-item ${alert.severity}`;
        item.style.marginBottom = '8px';
        
        const time = new Date(alert.timestamp).toLocaleString('zh-CN');
        
        item.innerHTML = `
          <div class="alert-tank">${alert.message}</div>
          <div style="font-size:0.8rem;color:#aaa;">
            值: ${alert.value.toFixed(2)} | 阈值: ${alert.threshold}
          </div>
          <div class="alert-time">${time}</div>
        `;
        
        alertList.appendChild(item);
      });
      
      container.appendChild(alertList);
    } catch (error) {
      console.error('加载报警记录失败:', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new TankMonitoringApp();
});
