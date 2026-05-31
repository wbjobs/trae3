import type { FaultRecord, KeyMetrics, FaultStatistics } from '@/types';
import { FAULT_TYPE_LABELS, FAULT_SEVERITY_LABELS } from '@/constants';

export function calculateKeyMetrics(data: {
  totalPower?: number;
  currentPower?: number;
  efficiency?: number;
  onlineRate?: number;
  faultCount?: number;
  avgTemperature?: number;
}): KeyMetrics {
  return {
    totalPower: safeNumber(data.totalPower, 0),
    totalGeneration: safeNumber(data.totalPower, 0),
    currentPower: safeNumber(data.currentPower, 0),
    efficiency: safeNumber(data.efficiency, 0),
    onlineRate: safeNumber(data.onlineRate, 0),
    faultCount: safeNumber(data.faultCount, 0),
    avgTemperature: safeNumber(data.avgTemperature, 0),
    temperatureAvg: safeNumber(data.avgTemperature, 0),
    lastUpdate: Date.now(),
  };
}

export function calculateFaultStatistics(
  faults: FaultRecord[]
): FaultStatistics {
  const validFaults = Array.isArray(faults)
    ? faults.filter(f => f && typeof f === 'object')
    : [];

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byComponent: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  validFaults.forEach(fault => {
    if (fault.faultType) {
      byType[fault.faultType] = (byType[fault.faultType] || 0) + 1;
    }
    if (fault.severity) {
      bySeverity[fault.severity] = (bySeverity[fault.severity] || 0) + 1;
    }
    if (fault.componentId) {
      byComponent[fault.componentId] = (byComponent[fault.componentId] || 0) + 1;
    }
    if (fault.status) {
      byStatus[fault.status] = (byStatus[fault.status] || 0) + 1;
    }
  });

  const total = validFaults.length;
  const active = byStatus['active'] || 0;
  const resolved = byStatus['resolved'] || 0;
  const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;

  const typeStats = Object.entries(byType).map(([type, count]) => ({
    name: FAULT_TYPE_LABELS[type] || type,
    value: count,
    percentage: total > 0 ? (count / total) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  const severityStats = Object.entries(bySeverity).map(([severity, count]) => ({
    name: FAULT_SEVERITY_LABELS[severity] || severity,
    value: count,
    percentage: total > 0 ? (count / total) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  const componentStats = Object.entries(byComponent).map(([componentId, count]) => ({
    name: componentId,
    value: count,
    percentage: total > 0 ? (count / total) * 100 : 0,
  })).sort((a, b) => b.value - a.value);

  return {
    total,
    active,
    resolved,
    ignored: byStatus['ignored'] || 0,
    resolutionRate,
    activeRate: total > 0 ? (active / total) * 100 : 0,
    mttr_hours: calculateMTTR(faults),
    mtbf_hours: calculateMTBF(faults),
    byType: typeStats,
    bySeverity: severityStats,
    byComponent: componentStats.slice(0, 10),
    byStatus: Object.entries(byStatus).map(([status, count]) => ({
      name: status,
      value: count,
    })),
    trend: calculateTrendData(faults, 30),
  } as FaultStatistics;
}

export function calculateTrendData(
  faults: FaultRecord[],
  days: number = 30
): { date: string; value: number }[] {
  const trendData: { date: string; value: number }[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const validFaults = Array.isArray(faults)
    ? faults.filter(f => f && typeof f.startTime === 'number')
    : [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * dayMs);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
    trendData.push({ date: dateStr, value: 0 });
  }

  validFaults.forEach(fault => {
    const faultDate = new Date(fault.startTime);
    const dateStr = `${faultDate.getMonth() + 1}/${faultDate.getDate()}`;
    const existing = trendData.find(d => d.date === dateStr);
    if (existing) {
      existing.value++;
    }
  });

  return trendData;
}

export function calculateMTBF(faults: FaultRecord[]): number {
  const validFaults = Array.isArray(faults)
    ? faults.filter(f => f && typeof f.startTime === 'number')
    : [];

  if (validFaults.length < 2) return 0;

  const sortedFaults = [...validFaults].sort((a, b) => a.startTime - b.startTime);
  let totalInterval = 0;

  for (let i = 1; i < sortedFaults.length; i++) {
    totalInterval += sortedFaults[i].startTime - sortedFaults[i - 1].startTime;
  }

  return totalInterval / (sortedFaults.length - 1) / (1000 * 60 * 60);
}

export function calculateMTTR(faults: FaultRecord[]): number {
  const validFaults = Array.isArray(faults)
    ? faults.filter(f =>
        f &&
        typeof f.startTime === 'number' &&
        typeof f.endTime === 'number' &&
        f.endTime > f.startTime
      )
    : [];

  if (validFaults.length === 0) return 0;

  const totalRepairTime = validFaults.reduce(
    (sum, f) => sum + (f.endTime! - f.startTime),
    0
  );

  return totalRepairTime / validFaults.length / (1000 * 60 * 60);
}

export function calculateFaultRate(
  faults: FaultRecord[],
  totalComponents: number,
  hours: number = 24
): number {
  const validFaults = Array.isArray(faults) ? faults : [];
  if (totalComponents === 0 || hours === 0) return 0;

  return (validFaults.length / (totalComponents * hours)) * 1000;
}

function safeNumber(value: any, defaultValue: number): number {
  if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
    return value;
  }
  return defaultValue;
}

export function safeDivide(numerator: number, denominator: number, defaultValue: number = 0): number {
  if (denominator === 0 || !isFinite(numerator) || !isFinite(denominator)) {
    return defaultValue;
  }
  return numerator / denominator;
}

export function safePercentage(
  value: number,
  total: number,
  decimals: number = 1
): number {
  if (total === 0 || !isFinite(value) || !isFinite(total)) {
    return 0;
  }
  const percentage = (value / total) * 100;
  return Math.round(percentage * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

export function calculateArrayEfficiency(
  componentData: Record<string, { voltage?: number; current?: number }[]>
): number {
  if (!componentData || typeof componentData !== 'object') {
    return 0;
  }

  const componentIds = Object.keys(componentData);
  if (componentIds.length === 0) return 0;

  let totalPower = 0;
  let count = 0;

  componentIds.forEach(componentId => {
    const data = componentData[componentId];
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1];
      if (latest && typeof latest.voltage === 'number' && typeof latest.current === 'number') {
        totalPower += latest.voltage * latest.current;
        count++;
      }
    }
  });

  if (count === 0) return 0;

  const ratedPower = 500 * count;
  return (totalPower / ratedPower) * 100;
}

export function calculateEnergyYield(
  powerData: { timestamp: number; value: number }[],
  timeUnit: 'hour' | 'day' | 'month' = 'hour'
): number {
  if (!Array.isArray(powerData) || powerData.length < 2) {
    return 0;
  }

  let totalEnergy = 0;
  const sortedData = [...powerData].sort((a, b) => a.timestamp - b.timestamp);

  for (let i = 1; i < sortedData.length; i++) {
    const prev = sortedData[i - 1];
    const curr = sortedData[i];
    const timeDiff = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
    const avgPower = (prev.value + curr.value) / 2;
    totalEnergy += avgPower * timeDiff;
  }

  return totalEnergy / 1000;
}

export function calculatePerformanceRatio(
  actualYield: number,
  theoreticalYield: number,
  systemLoss: number = 0.15
): number {
  if (theoreticalYield === 0) return 0;
  const adjustedTheoretical = theoreticalYield * (1 - systemLoss);
  return safePercentage(actualYield, adjustedTheoretical);
}
