import type { MeterDataRequest, AnomalyDetectionResult, AnomalyType } from '../types';

interface DeviceDataWindow {
  deviceId: string;
  dataPoints: Array<{
    timestamp: number;
    flowRate: number;
    totalConsumption: number;
  }>;
  baselineFlowRate: number | null;
  lastTotalConsumption: number | null;
  lastUpdate: number;
}

export class AnomalyDetectionService {
  private deviceWindows = new Map<string, DeviceDataWindow>();
  private readonly WINDOW_SIZE = 30;
  private readonly SPIKE_THRESHOLD = 3.0;
  private readonly DROP_THRESHOLD = 0.3;
  private readonly LEAK_MIN_FLOW = 0.5;
  private readonly LEAK_DURATION_THRESHOLD = 3600000;
  private readonly NO_FLOW_THRESHOLD = 86400000;
  private readonly REVERSE_FLOW_THRESHOLD = -0.1;

  detectAnomalies(data: MeterDataRequest): AnomalyDetectionResult[] {
    const anomalies: AnomalyDetectionResult[] = [];
    const window = this.getOrCreateWindow(data.deviceId);

    this.updateWindow(window, data);

    if (window.dataPoints.length < 5) {
      return anomalies;
    }

    if (data.flowRate < this.REVERSE_FLOW_THRESHOLD) {
      anomalies.push(this.createAnomaly('reverse_flow', data));
    }

    if (window.baselineFlowRate !== null) {
      const spikeResult = this.detectFlowSpike(data, window);
      if (spikeResult) anomalies.push(spikeResult);

      const dropResult = this.detectFlowDrop(data, window);
      if (dropResult) anomalies.push(dropResult);
    }

    const leakResult = this.detectLeak(window);
    if (leakResult) anomalies.push(leakResult);

    const noFlowResult = this.detectNoFlow(window);
    if (noFlowResult) anomalies.push(noFlowResult);

    const consumptionResult = this.detectAbnormalConsumption(data, window);
    if (consumptionResult) anomalies.push(consumptionResult);

    return anomalies;
  }

  private getOrCreateWindow(deviceId: string): DeviceDataWindow {
    let window = this.deviceWindows.get(deviceId);
    if (!window) {
      window = {
        deviceId,
        dataPoints: [],
        baselineFlowRate: null,
        lastTotalConsumption: null,
        lastUpdate: Date.now()
      };
      this.deviceWindows.set(deviceId, window);
    }
    return window;
  }

  private updateWindow(window: DeviceDataWindow, data: MeterDataRequest): void {
    window.dataPoints.push({
      timestamp: data.timestamp,
      flowRate: data.flowRate,
      totalConsumption: data.totalConsumption
    });

    if (window.dataPoints.length > this.WINDOW_SIZE) {
      window.dataPoints.shift();
    }

    if (window.dataPoints.length >= 10 && window.baselineFlowRate === null) {
      window.baselineFlowRate = this.calculateBaseline(window);
    } else if (window.baselineFlowRate !== null) {
      const newBaseline = this.calculateBaseline(window);
      window.baselineFlowRate = window.baselineFlowRate * 0.9 + newBaseline * 0.1;
    }

    window.lastTotalConsumption = data.totalConsumption;
    window.lastUpdate = Date.now();
  }

  private calculateBaseline(window: DeviceDataWindow): number {
    const values = window.dataPoints.map(d => d.flowRate).sort((a, b) => a - b);
    const start = Math.floor(values.length * 0.25);
    const end = Math.ceil(values.length * 0.75);
    const middle = values.slice(start, end);
    return middle.reduce((a, b) => a + b, 0) / middle.length;
  }

  private detectFlowSpike(data: MeterDataRequest, window: DeviceDataWindow): AnomalyDetectionResult | null {
    const baseline = window.baselineFlowRate!;
    const ratio = baseline > 0 ? data.flowRate / baseline : data.flowRate;

    if (ratio >= this.SPIKE_THRESHOLD && data.flowRate > baseline * 2) {
      return this.createAnomaly('flow_spike', data, {
        baselineFlowRate: baseline,
        currentFlowRate: data.flowRate,
        ratio,
        threshold: this.SPIKE_THRESHOLD
      });
    }
    return null;
  }

  private detectFlowDrop(data: MeterDataRequest, window: DeviceDataWindow): AnomalyDetectionResult | null {
    const baseline = window.baselineFlowRate!;
    const ratio = baseline > 0 ? data.flowRate / baseline : 0;

    if (ratio <= this.DROP_THRESHOLD && baseline > 1 && data.flowRate < baseline * 0.3) {
      return this.createAnomaly('flow_drop', data, {
        baselineFlowRate: baseline,
        currentFlowRate: data.flowRate,
        ratio,
        threshold: this.DROP_THRESHOLD
      });
    }
    return null;
  }

  private detectLeak(window: DeviceDataWindow): AnomalyDetectionResult | null {
    const recent = window.dataPoints.slice(-10);
    if (recent.length < 10) return null;

    const allLowFlow = recent.every(d => 
      d.flowRate > 0 && d.flowRate < this.LEAK_MIN_FLOW
    );

    if (allLowFlow) {
      const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
      if (timeSpan >= this.LEAK_DURATION_THRESHOLD) {
        const avgFlow = recent.reduce((s, d) => s + d.flowRate, 0) / recent.length;
        return {
          type: 'leak_detected',
          level: 'error',
          message: `疑似管道泄漏，持续低流量约 ${(timeSpan / 3600000).toFixed(1)} 小时`,
          confidence: 0.85,
          details: {
            avgFlowRate: avgFlow,
            durationHours: timeSpan / 3600000,
            minFlow: Math.min(...recent.map(d => d.flowRate)),
            maxFlow: Math.max(...recent.map(d => d.flowRate))
          }
        };
      }
    }
    return null;
  }

  private detectNoFlow(window: DeviceDataWindow): AnomalyDetectionResult | null {
    const recent = window.dataPoints.slice(-20);
    if (recent.length < 20) return null;

    const allZero = recent.every(d => Math.abs(d.flowRate) < 0.001);
    if (allZero) {
      const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
      if (timeSpan >= this.NO_FLOW_THRESHOLD) {
        return {
          type: 'no_flow',
          level: 'warning',
          message: `设备持续无流量约 ${(timeSpan / 3600000).toFixed(0)} 小时，可能已关闭或故障`,
          confidence: 0.75,
          details: {
            durationHours: timeSpan / 3600000,
            dataPointCount: recent.length
          }
        };
      }
    }
    return null;
  }

  private detectAbnormalConsumption(data: MeterDataRequest, window: DeviceDataWindow): AnomalyDetectionResult | null {
    if (window.dataPoints.length < 2 || window.lastTotalConsumption === null) return null;

    const prev = window.dataPoints[window.dataPoints.length - 2];
    const consumptionDelta = data.totalConsumption - prev.totalConsumption;
    const timeDelta = (data.timestamp - prev.timestamp) / 3600000;

    if (timeDelta > 0 && timeDelta < 24) {
      const hourlyRate = consumptionDelta / timeDelta;
      const recentPoints = window.dataPoints.slice(-10);
      const baselineDelta = recentPoints.slice(1).reduce((sum, curr, i) => {
        return sum + (curr.totalConsumption - recentPoints[i].totalConsumption);
      }, 0) / (recentPoints.length - 1);

      if (consumptionDelta > baselineDelta * 5 && consumptionDelta > 100) {
        return {
          type: 'abnormal_consumption',
          level: 'warning',
          message: `时段用水量异常，当前时段 ${consumptionDelta.toFixed(1)} m³ 超出基线 ${(consumptionDelta / Math.max(baselineDelta, 1)).toFixed(1)} 倍`,
          confidence: 0.7,
          details: {
            currentConsumption: consumptionDelta,
            baselineConsumption: baselineDelta,
            hourlyRate,
            ratio: consumptionDelta / Math.max(baselineDelta, 1)
          }
        };
      }
    }
    return null;
  }

  private createAnomaly(type: AnomalyType, data: MeterDataRequest, details: Record<string, any> = {}): AnomalyDetectionResult {
    const configs: Record<AnomalyType, { level: 'warning' | 'error' | 'critical'; message: string; confidence: number }> = {
      flow_spike: {
        level: 'warning',
        message: `流量突增告警，当前流量 ${data.flowRate.toFixed(2)} m³/h`,
        confidence: 0.9
      },
      flow_drop: {
        level: 'warning',
        message: `流量骤降告警，当前流量 ${data.flowRate.toFixed(2)} m³/h`,
        confidence: 0.85
      },
      leak_detected: {
        level: 'error',
        message: '疑似管道泄漏',
        confidence: 0.8
      },
      no_flow: {
        level: 'warning',
        message: '设备持续无流量',
        confidence: 0.75
      },
      abnormal_consumption: {
        level: 'warning',
        message: '时段用水量异常',
        confidence: 0.7
      },
      reverse_flow: {
        level: 'critical',
        message: `检测到逆向流量 ${data.flowRate.toFixed(2)} m³/h，可能存在水表倒装或回水`,
        confidence: 0.95
      }
    };

    const config = configs[type];
    return {
      type,
      level: config.level,
      message: config.message,
      confidence: config.confidence,
      details: { ...details, deviceId: data.deviceId, timestamp: data.timestamp }
    };
  }

  cleanupOldWindows(maxAge: number = 86400000): void {
    const now = Date.now();
    for (const [deviceId, window] of this.deviceWindows) {
      if (now - window.lastUpdate > maxAge) {
        this.deviceWindows.delete(deviceId);
      }
    }
  }
}

export const anomalyDetectionService = new AnomalyDetectionService();
