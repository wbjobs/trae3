const EventEmitter = require('events');
const { Logger } = require('./logger');
const zlib = require('zlib');

const MAX_HISTORY_PER_TANK = 500;
const MAX_ALERTS_PER_TANK = 100;
const ALERT_DEBOUNCE_TIME = 5000;
const BATCH_UPDATE_INTERVAL = 500;

class DataSimulator extends EventEmitter {
  constructor(tanksConfig) {
    super();
    this.tanksConfig = tanksConfig;
    this.currentData = {};
    this.historyData = {};
    this.alerts = {};
    this.lastAlertTime = {};
    this.interval = null;
    this.updateInterval = 2000;
    this.batchInterval = null;
    this.pendingUpdates = new Map();
    this.logger = new Logger('simulator');
    this.useCompression = true;

    tanksConfig.forEach(tank => {
      this.currentData[tank.id] = this.generateInitialData(tank);
      this.historyData[tank.id] = [];
      this.alerts[tank.id] = [];
      this.lastAlertTime[tank.id] = {};
    });

    this.logger.info('数据模拟器初始化完成', { tankCount: tanksConfig.length });
    this.startBatchEmitter();
  }

  generateInitialData(tank) {
    const level = tank.capacity * (0.4 + Math.random() * 0.4);
    return {
      level: level,
      levelPercent: (level / tank.capacity) * 100,
      pressure: 0.7 + Math.random() * 0.3,
      temperature: 25 + Math.random() * 15,
      timestamp: Date.now(),
      status: 'normal'
    };
  }

  start() {
    if (this.interval) {
      this.logger.warn('模拟器已在运行');
      return;
    }

    this.interval = setInterval(() => {
      this.tanksConfig.forEach(tank => {
        this.updateTankData(tank);
      });
    }, this.updateInterval);

    this.logger.info('数据模拟器已启动', { updateInterval: this.updateInterval });
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info('数据模拟器已停止');
    }
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  startBatchEmitter() {
    this.batchInterval = setInterval(() => {
      this.emitBatchUpdates();
    }, BATCH_UPDATE_INTERVAL);
  }

  updateTankData(tank) {
    const current = this.currentData[tank.id];
    const delta = (Math.random() - 0.5) * 0.02;
    
    let newLevel = current.level * (1 + delta);
    newLevel = Math.max(0, Math.min(tank.capacity, newLevel));

    const newPressure = Math.max(0.3, Math.min(2.0, current.pressure + (Math.random() - 0.5) * 0.05));
    const newTemperature = Math.max(0, Math.min(80, current.temperature + (Math.random() - 0.5) * 1));

    const data = {
      level: newLevel,
      levelPercent: (newLevel / tank.capacity) * 100,
      pressure: newPressure,
      temperature: newTemperature,
      timestamp: Date.now(),
      status: this.determineStatus(tank, newLevel, newPressure, newTemperature)
    };

    const hasSignificantChange = this.hasSignificantChange(current, data);
    
    this.currentData[tank.id] = data;
    
    if (hasSignificantChange) {
      this.pendingUpdates.set(tank.id, data);
    }

    this.historyData[tank.id].push(data);
    if (this.historyData[tank.id].length > MAX_HISTORY_PER_TANK) {
      const removed = this.historyData[tank.id].splice(0, this.historyData[tank.id].length - MAX_HISTORY_PER_TANK);
      if (removed.length > 0) {
        this.logger.debug('清理历史数据', { tankId: tank.id, removed: removed.length });
      }
    }

    this.checkThresholds(tank, data);
  }

  hasSignificantChange(oldData, newData) {
    const levelChange = Math.abs(newData.levelPercent - oldData.levelPercent);
    const pressureChange = Math.abs(newData.pressure - oldData.pressure);
    const tempChange = Math.abs(newData.temperature - oldData.temperature);
    
    return levelChange > 0.1 || pressureChange > 0.01 || tempChange > 0.5 || 
           newData.status !== oldData.status;
  }

  emitBatchUpdates() {
    if (this.pendingUpdates.size === 0) return;

    const updates = Array.from(this.pendingUpdates.entries());
    
    if (updates.length === 1) {
      const [tankId, data] = updates[0];
      this.emit('dataUpdate', tankId, data);
    } else {
      const batchData = Object.fromEntries(updates);
      this.emit('batchUpdate', batchData);
    }

    this.pendingUpdates.clear();
  }

  determineStatus(tank, level, pressure, temperature) {
    const t = tank.thresholds;
    
    if (level >= t.level.highHigh || level <= t.level.lowLow ||
        pressure >= t.pressure.high || pressure <= t.pressure.low ||
        temperature >= t.temperature.high || temperature <= t.temperature.low) {
      return 'critical';
    }
    
    if (level >= t.level.high || level <= t.level.low) {
      return 'warning';
    }
    
    return 'normal';
  }

  checkThresholds(tank, data) {
    const t = tank.thresholds;
    const now = Date.now();

    const checkAndTriggerAlert = (type, severity, message, value, threshold) => {
      const key = `${type}-${severity}`;
      const lastTime = this.lastAlertTime[tank.id][key] || 0;
      
      if (now - lastTime >= ALERT_DEBOUNCE_TIME) {
        this.lastAlertTime[tank.id][key] = now;
        
        const alertData = {
          type,
          severity,
          message,
          value,
          threshold,
          tankId: tank.id,
          tankName: tank.name,
          timestamp: now
        };

        this.alerts[tank.id].unshift(alertData);
        
        if (this.alerts[tank.id].length > MAX_ALERTS_PER_TANK) {
          this.alerts[tank.id].length = MAX_ALERTS_PER_TANK;
        }

        this.emit('alert', alertData);
      }
    };

    if (data.level >= t.level.highHigh) {
      checkAndTriggerAlert('level', 'critical', '液位超高报警', data.level, t.level.highHigh);
    } else if (data.level >= t.level.high) {
      checkAndTriggerAlert('level', 'warning', '液位高报警', data.level, t.level.high);
    } else if (data.level <= t.level.lowLow) {
      checkAndTriggerAlert('level', 'critical', '液位超低报警', data.level, t.level.lowLow);
    } else if (data.level <= t.level.low) {
      checkAndTriggerAlert('level', 'warning', '液位低报警', data.level, t.level.low);
    }

    if (data.pressure >= t.pressure.high) {
      checkAndTriggerAlert('pressure', 'critical', '压力超高报警', data.pressure, t.pressure.high);
    } else if (data.pressure <= t.pressure.low) {
      checkAndTriggerAlert('pressure', 'critical', '压力超低报警', data.pressure, t.pressure.low);
    }

    if (data.temperature >= t.temperature.high) {
      checkAndTriggerAlert('temperature', 'warning', '温度超高报警', data.temperature, t.temperature.high);
    } else if (data.temperature <= t.temperature.low) {
      checkAndTriggerAlert('temperature', 'warning', '温度超低报警', data.temperature, t.temperature.low);
    }
  }

  getCurrentData(tankId) {
    return this.currentData[tankId];
  }

  getAllCurrentDataCompressed() {
    const data = this.getAllCurrentData();
    
    if (this.useCompression) {
      return zlib.gzipSync(JSON.stringify(data));
    }
    return data;
  }

  getHistoryData(tankId, startTime, endTime, limit = MAX_HISTORY_PER_TANK) {
    let history = this.historyData[tankId] || [];
    
    if (startTime) {
      history = history.filter(d => d.timestamp >= startTime);
    }
    if (endTime) {
      history = history.filter(d => d.timestamp <= endTime);
    }

    const actualLimit = Math.min(limit, MAX_HISTORY_PER_TANK);
    return history.slice(-actualLimit);
  }

  getAlerts(tankId, limit = MAX_ALERTS_PER_TANK) {
    const alerts = this.alerts[tankId] || [];
    const actualLimit = Math.min(limit, MAX_ALERTS_PER_TANK);
    return alerts.slice(0, actualLimit);
  }

  getAllCurrentData() {
    return { ...this.currentData };
  }

  getStats() {
    return {
      tankCount: this.tanksConfig.length,
      maxHistory: MAX_HISTORY_PER_TANK,
      maxAlerts: MAX_ALERTS_PER_TANK,
      historySizes: Object.fromEntries(
        Object.entries(this.historyData).map(([id, data]) => [id, data.length])
      ),
      alertSizes: Object.fromEntries(
        Object.entries(this.alerts).map(([id, data]) => [id, data.length])
      )
    };
  }
}

module.exports = { DataSimulator, MAX_HISTORY_PER_TANK, MAX_ALERTS_PER_TANK };
