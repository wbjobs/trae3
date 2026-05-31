import { Equipment, EquipmentStatus, EquipmentParameter, EquipmentData, DeltaEquipmentData } from '../../shared/types';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('DataSimulator');

interface ParameterConfig {
  name: string;
  unit: string;
  baseValue: number;
  variation: number;
  warningThreshold: number;
  alarmThreshold: number;
}

interface EquipmentConfig {
  id: string;
  name: string;
  type: 'pump' | 'motor' | 'turbine' | 'compressor' | 'valve' | 'sensor';
  position: { x: number; y: number; z: number };
  description: string;
  parameters: ParameterConfig[];
}

const equipmentConfigs: EquipmentConfig[] = [
  {
    id: 'pump-001',
    name: '主循环泵 A',
    type: 'pump',
    position: { x: -4, y: 0, z: -2 },
    description: '负责主循环系统的液体输送',
    parameters: [
      { name: '流量', unit: 'm³/h', baseValue: 120, variation: 10, warningThreshold: 150, alarmThreshold: 180 },
      { name: '压力', unit: 'MPa', baseValue: 1.2, variation: 0.2, warningThreshold: 1.8, alarmThreshold: 2.2 },
      { name: '温度', unit: '°C', baseValue: 65, variation: 5, warningThreshold: 85, alarmThreshold: 95 },
      { name: '转速', unit: 'RPM', baseValue: 1480, variation: 50, warningThreshold: 1600, alarmThreshold: 1750 },
    ],
  },
  {
    id: 'pump-002',
    name: '主循环泵 B',
    type: 'pump',
    position: { x: -4, y: 0, z: 2 },
    description: '备用主循环泵',
    parameters: [
      { name: '流量', unit: 'm³/h', baseValue: 115, variation: 8, warningThreshold: 150, alarmThreshold: 180 },
      { name: '压力', unit: 'MPa', baseValue: 1.15, variation: 0.15, warningThreshold: 1.8, alarmThreshold: 2.2 },
      { name: '温度', unit: '°C', baseValue: 62, variation: 4, warningThreshold: 85, alarmThreshold: 95 },
      { name: '转速', unit: 'RPM', baseValue: 1450, variation: 40, warningThreshold: 1600, alarmThreshold: 1750 },
    ],
  },
  {
    id: 'motor-001',
    name: '驱动电机 1号',
    type: 'motor',
    position: { x: 0, y: 0, z: -3 },
    description: '主要驱动电机，功率500kW',
    parameters: [
      { name: '功率', unit: 'kW', baseValue: 420, variation: 30, warningThreshold: 480, alarmThreshold: 520 },
      { name: '电流', unit: 'A', baseValue: 780, variation: 50, warningThreshold: 900, alarmThreshold: 1000 },
      { name: '温度', unit: '°C', baseValue: 72, variation: 6, warningThreshold: 90, alarmThreshold: 105 },
      { name: '振动', unit: 'mm/s', baseValue: 2.1, variation: 0.5, warningThreshold: 4.5, alarmThreshold: 7.0 },
    ],
  },
  {
    id: 'motor-002',
    name: '驱动电机 2号',
    type: 'motor',
    position: { x: 0, y: 0, z: 3 },
    description: '辅助驱动电机，功率350kW',
    parameters: [
      { name: '功率', unit: 'kW', baseValue: 280, variation: 25, warningThreshold: 340, alarmThreshold: 380 },
      { name: '电流', unit: 'A', baseValue: 520, variation: 40, warningThreshold: 620, alarmThreshold: 700 },
      { name: '温度', unit: '°C', baseValue: 68, variation: 5, warningThreshold: 88, alarmThreshold: 100 },
      { name: '振动', unit: 'mm/s', baseValue: 1.8, variation: 0.4, warningThreshold: 4.0, alarmThreshold: 6.5 },
    ],
  },
  {
    id: 'turbine-001',
    name: '蒸汽涡轮',
    type: 'turbine',
    position: { x: 4, y: 0, z: 0 },
    description: '主蒸汽涡轮发电机组',
    parameters: [
      { name: '转速', unit: 'RPM', baseValue: 3000, variation: 50, warningThreshold: 3150, alarmThreshold: 3300 },
      { name: '功率', unit: 'MW', baseValue: 25, variation: 2, warningThreshold: 28, alarmThreshold: 30 },
      { name: '温度', unit: '°C', baseValue: 420, variation: 15, warningThreshold: 480, alarmThreshold: 520 },
      { name: '压力', unit: 'MPa', baseValue: 8.5, variation: 0.5, warningThreshold: 10, alarmThreshold: 11.5 },
    ],
  },
  {
    id: 'valve-001',
    name: '主控制阀',
    type: 'valve',
    position: { x: 2, y: 0, z: -2 },
    description: '主管路流量控制阀',
    parameters: [
      { name: '开度', unit: '%', baseValue: 75, variation: 3, warningThreshold: 90, alarmThreshold: 98 },
      { name: '压差', unit: 'kPa', baseValue: 45, variation: 5, warningThreshold: 70, alarmThreshold: 90 },
      { name: '温度', unit: '°C', baseValue: 58, variation: 4, warningThreshold: 80, alarmThreshold: 95 },
    ],
  },
  {
    id: 'compressor-001',
    name: '空气压缩机',
    type: 'compressor',
    position: { x: 2, y: 0, z: 2 },
    description: '工厂仪表空气供应',
    parameters: [
      { name: '压力', unit: 'bar', baseValue: 7.5, variation: 0.5, warningThreshold: 9, alarmThreshold: 10 },
      { name: '流量', unit: 'm³/min', baseValue: 12, variation: 1.5, warningThreshold: 16, alarmThreshold: 18 },
      { name: '温度', unit: '°C', baseValue: 85, variation: 8, warningThreshold: 105, alarmThreshold: 120 },
      { name: '功率', unit: 'kW', baseValue: 95, variation: 10, warningThreshold: 120, alarmThreshold: 140 },
    ],
  },
];

class DataSimulator {
  private equipments: Equipment[] = [];
  private updateInterval: NodeJS.Timeout | null = null;
  private callbacks: ((data: EquipmentData) => void)[] = [];
  private deltaCallbacks: ((delta: DeltaEquipmentData) => void)[] = [];
  private batchData: EquipmentData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly updateFrequency = 1000;
  private readonly batchSize = 7;
  private readonly batchInterval = 500;
  private isRunning = false;
  private seq = 0;
  private prevParams: Map<string, EquipmentParameter[]> = new Map();
  private stats = {
    totalUpdates: 0,
    deltaUpdates: 0,
    lastStatsTime: Date.now(),
  };

  constructor() {
    this.initEquipments();
  }

  private initEquipments() {
    this.equipments = equipmentConfigs.map((config) => ({
      id: config.id,
      name: config.name,
      type: config.type,
      status: 'normal' as EquipmentStatus,
      position: config.position,
      description: config.description,
      parameters: config.parameters.map((p) => ({
        name: p.name,
        value: p.baseValue,
        unit: p.unit,
        status: 'normal' as EquipmentStatus,
      })),
    }));

    this.equipments.forEach((eq) => {
      this.prevParams.set(eq.id, JSON.parse(JSON.stringify(eq.parameters)));
    });
  }

  getEquipments(): Equipment[] {
    return JSON.parse(JSON.stringify(this.equipments));
  }

  getEquipmentConfig(id: string): EquipmentConfig | undefined {
    return equipmentConfigs.find((c) => c.id === id);
  }

  private calculateStatus(value: number, config: ParameterConfig): EquipmentStatus {
    const deviation = Math.abs(value - config.baseValue) / config.baseValue;
    if (value >= config.alarmThreshold || deviation > 0.25) {
      return 'alarm';
    }
    if (value >= config.warningThreshold || deviation > 0.15) {
      return 'warning';
    }
    return 'normal';
  }

  private generateValue(config: ParameterConfig): number {
    const trend = Math.sin(Date.now() / 10000) * config.variation * 0.3;
    const noise = (Math.random() - 0.5) * config.variation;
    return config.baseValue + trend + noise;
  }

  private updateEquipment(equipment: Equipment): EquipmentData {
    const config = this.getEquipmentConfig(equipment.id);
    if (!config) {
      throw new Error(`Config not found for equipment ${equipment.id}`);
    }

    const parameters: EquipmentParameter[] = config.parameters.map((paramConfig) => {
      const value = this.generateValue(paramConfig);
      const status = this.calculateStatus(value, paramConfig);
      return {
        name: paramConfig.name,
        value: Math.round(value * 100) / 100,
        unit: paramConfig.unit,
        status,
      };
    });

    equipment.parameters = parameters;
    equipment.status = parameters.some((p) => p.status === 'alarm')
      ? 'alarm'
      : parameters.some((p) => p.status === 'warning')
        ? 'warning'
        : 'normal';

    return {
      equipmentId: equipment.id,
      parameters,
      timestamp: new Date().toISOString(),
    };
  }

  private flushBatch() {
    if (this.batchData.length === 0) return;

    const dataToSend = [...this.batchData];
    this.batchData = [];

    dataToSend.forEach((data) => {
      this.notifyCallbacks(data);
    });
  }

  private notifyCallbacks(data: EquipmentData) {
    for (const callback of this.callbacks) {
      try {
        callback(data);
      } catch (error) {
        logger.error('Callback error:', error);
      }
    }

    const delta = this.computeDelta(data.equipmentId, data.parameters);
    if (delta) {
      this.stats.deltaUpdates++;
      for (const callback of this.deltaCallbacks) {
        try {
          callback(delta);
        } catch (error) {
          logger.error('Delta callback error:', error);
        }
      }
    }
  }

  private updateAllEquipments() {
    for (const equipment of this.equipments) {
      try {
        const data = this.updateEquipment(equipment);
        this.batchData.push(data);

        if (this.batchData.length >= this.batchSize) {
          this.flushBatch();
        }
      } catch (error) {
        logger.error(`Failed to update equipment ${equipment.id}:`, error);
      }
    }

    this.stats.totalUpdates += this.equipments.length;

    const now = Date.now();
    if (now - this.stats.lastStatsTime >= 60000) {
      logger.debug(`Stats: ${this.stats.totalUpdates} updates, ${this.stats.deltaUpdates} deltas in last minute`);
      this.stats.totalUpdates = 0;
      this.stats.deltaUpdates = 0;
      this.stats.lastStatsTime = now;
    }
  }

  public onDataUpdate(callback: (data: EquipmentData) => void) {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) {
        this.callbacks.splice(index, 1);
      }
    };
  }

  public onDeltaUpdate(callback: (delta: DeltaEquipmentData) => void) {
    this.deltaCallbacks.push(callback);
    return () => {
      const index = this.deltaCallbacks.indexOf(callback);
      if (index > -1) {
        this.deltaCallbacks.splice(index, 1);
      }
    };
  }

  private computeDelta(equipmentId: string, newParams: EquipmentParameter[]): DeltaEquipmentData | null {
    const prev = this.prevParams.get(equipmentId);
    if (!prev) return null;

    const changes: DeltaEquipmentData['changes'] = [];
    for (let i = 0; i < newParams.length; i++) {
      if (i >= prev.length) continue;
      const p = prev[i];
      const n = newParams[i];
      if (Math.abs(n.value - p.value) > 0.05 || n.status !== p.status) {
        changes.push({ paramIndex: i, value: n.value, status: n.status });
      }
    }

    this.prevParams.set(equipmentId, JSON.parse(JSON.stringify(newParams)));

    if (changes.length === 0) return null;

    return {
      equipmentId,
      changes,
      timestamp: new Date().toISOString(),
      seq: ++this.seq,
    };
  }

  public start() {
    if (this.isRunning) {
      logger.warn('DataSimulator already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting DataSimulator...');

    this.updateInterval = setInterval(() => {
      this.updateAllEquipments();
    }, this.updateFrequency);

    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.batchInterval);

    logger.info(`DataSimulator started with ${this.equipments.length} equipments`);
  }

  public stop() {
    if (!this.isRunning) return;

    this.isRunning = false;
    logger.info('Stopping DataSimulator...');

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.flushBatch();
      this.batchTimer = null;
    }

    logger.info('DataSimulator stopped');
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      equipmentCount: this.equipments.length,
      callbackCount: this.callbacks.length,
      pendingBatchSize: this.batchData.length,
    };
  }
}

export const dataSimulator = new DataSimulator();
