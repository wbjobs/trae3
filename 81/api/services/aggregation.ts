import { PrismaClient } from '@prisma/client';
import type { 
  DashboardOverview, 
  DataFilter, 
  ConsumptionStats,
  TrendReplayRequest,
  TrendReplayResponse,
  TrendReplayDataPoint,
  AnomalyType
} from '../types/index.js';
import dayjs from 'dayjs';
import dayjsWeekOfYear from 'dayjs/plugin/weekOfYear.js';

dayjs.extend(dayjsWeekOfYear);

const prisma = new PrismaClient();

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class CacheManager {
  private cache = new Map<string, CacheEntry<any>>();
  private ttl: number;
  private pendingPromises = new Map<string, Promise<any>>();

  constructor(ttl: number = 5000) {
    this.ttl = ttl;
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.data;
    }
    return null;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    if (this.pendingPromises.has(key)) {
      return this.pendingPromises.get(key) as Promise<T>;
    }

    const promise = fetcher()
      .then((data) => {
        this.set(key, data);
        this.pendingPromises.delete(key);
        return data;
      })
      .catch((error) => {
        this.pendingPromises.delete(key);
        throw error;
      });

    this.pendingPromises.set(key, promise);
    return promise;
  }
}

const overviewCache = new CacheManager(5000);
const deviceCache = new CacheManager(10000);
const statsCache = new CacheManager(30000);
const trendCache = new CacheManager(60000);

const ANOMALY_THRESHOLD = {
  flow_spike: 50,
  flow_drop: 30,
  leak_detected: 20,
  no_flow: 40,
  abnormal_consumption: 25,
  reverse_flow: 10
};

export class AggregationService {
  async getDashboardOverview(): Promise<DashboardOverview> {
    return overviewCache.getOrFetch('dashboard:overview', async () => {
      try {
        const results = await this.queryDashboardData();

        return {
          totalDevices: results.totalDevices,
          onlineDevices: results.statusDistribution.online,
          offlineDevices: results.statusDistribution.offline,
          todayAlerts: results.todayAlerts,
          todayConsumption: results.todayConsumption,
          deviceStatusDistribution: {
            normal: results.statusDistribution.normal,
            warning: results.statusDistribution.warning,
            error: results.statusDistribution.error,
            offline: results.statusDistribution.offline
          },
          hourlyConsumption: results.hourlyConsumption,
          recentAlerts: results.recentAlerts
        };
      } catch (error) {
        console.error('Error getting dashboard overview:', error);
        return this.getFallbackOverview();
      }
    });
  }

  private async queryDashboardData() {
    const [totalDevices, statusRows, todayAlerts, todayConsumption, hourlyData, recentAlerts] =
      await Promise.all([
        prisma.device.count(),
        prisma.device.groupBy({
          by: ['status'],
          _count: true
        }),
        this.queryTodayAlertsCount(),
        this.queryTodayConsumption(),
        this.queryHourlyConsumption(),
        this.queryRecentAlerts()
      ]);

    const statusDistribution = { normal: 0, warning: 0, error: 0, offline: 0, online: 0 };
    statusRows.forEach((item) => {
      const status = item.status as keyof typeof statusDistribution;
      if (status in statusDistribution) {
        statusDistribution[status] = item._count;
      }
      if (status === 'normal' || status === 'warning' || status === 'error') {
        statusDistribution.online += item._count;
      }
    });

    const hourlyConsumption = this.aggregateHourlyConsumption(hourlyData);

    return {
      totalDevices,
      statusDistribution,
      todayAlerts,
      todayConsumption,
      hourlyConsumption,
      recentAlerts
    };
  }

  private async queryTodayAlertsCount(): Promise<number> {
    const startOfDay = dayjs().startOf('day').toDate();
    return prisma.alert.count({
      where: {
        createdAt: { gte: startOfDay }
      }
    });
  }

  private async queryTodayConsumption(): Promise<number> {
    const startOfDay = dayjs().startOf('day').toDate();
    const endOfDay = dayjs().endOf('day').toDate();

    const result = await prisma.meterData.aggregate({
      _sum: { flowRate: true },
      where: {
        timestamp: { gte: startOfDay, lte: endOfDay }
      }
    });

    return Math.round((result._sum.flowRate || 0) * 100) / 100;
  }

  async getHourlyConsumption() {
    const cacheKey = `consumption:hourly:${dayjs().format('YYYY-MM-DD')}`;
    return overviewCache.getOrFetch(cacheKey, async () => {
      const data = await this.queryHourlyConsumption();
      return this.aggregateHourlyConsumption(data);
    });
  }

  private async queryHourlyConsumption() {
    const startOfDay = dayjs().startOf('day').toDate();
    const endOfDay = dayjs().endOf('day').toDate();

    return prisma.meterData.findMany({
      where: {
        timestamp: { gte: startOfDay, lte: endOfDay }
      },
      select: {
        timestamp: true,
        flowRate: true
      }
    });
  }

  private aggregateHourlyConsumption(data: Array<{ timestamp: Date; flowRate: number }>) {
    const hourlySums: number[] = new Array(24).fill(0);

    for (const item of data) {
      const hour = item.timestamp.getHours();
      hourlySums[hour] += item.flowRate;
    }

    return hourlySums.map((consumption, hour) => ({
      hour,
      consumption: Math.round(consumption * 100) / 100
    }));
  }

  private async queryRecentAlerts(limit: number = 10) {
    const alerts = await prisma.alert.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        device: { select: { serialNumber: true } }
      }
    });

    return alerts.map((alert) => ({
      id: alert.id,
      deviceId: alert.deviceId,
      deviceSerial: alert.device?.serialNumber || 'Unknown',
      type: alert.type,
      level: alert.level as 'info' | 'warning' | 'error' | 'critical',
      message: alert.message,
      status: alert.status as 'pending' | 'processing' | 'resolved',
      createdAt: alert.createdAt.toISOString()
    }));
  }

  async getConsumptionStats(filter: DataFilter = {}): Promise<ConsumptionStats> {
    const cacheKey = `stats:consumption:${JSON.stringify(filter)}`;
    return statsCache.getOrFetch(cacheKey, async () => {
      const [hourly, daily, weekly, monthly] = await Promise.all([
        this.getHourlyStats(filter),
        this.getDailyStats(filter),
        this.getWeeklyStats(filter),
        this.getMonthlyStats(filter)
      ]);

      return { hourly, daily, weekly, monthly };
    });
  }

  private async getHourlyStats(filter: DataFilter) {
    const startOfDay = dayjs().startOf('day').toDate();
    const endOfDay = dayjs().endOf('day').toDate();

    const data = await this.queryMeterDataByTimeRange(startOfDay, endOfDay, filter);
    return this.aggregateHourlyConsumption(data);
  }

  private async getDailyStats(filter: DataFilter) {
    const startDate = dayjs().subtract(30, 'day').startOf('day').toDate();
    const endDate = dayjs().endOf('day').toDate();

    const data = await this.queryMeterDataByTimeRange(startDate, endDate, filter);
    const dailyMap = new Map<string, number>();

    for (const item of data) {
      const date = dayjs(item.timestamp).format('YYYY-MM-DD');
      dailyMap.set(date, (dailyMap.get(date) || 0) + item.flowRate);
    }

    const result: { date: string; consumption: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      result.push({
        date,
        consumption: Math.round((dailyMap.get(date) || 0) * 100) / 100
      });
    }

    return result;
  }

  private async getWeeklyStats(filter: DataFilter) {
    const startDate = dayjs().subtract(12, 'week').startOf('week').toDate();
    const endDate = dayjs().endOf('day').toDate();

    const data = await this.queryMeterDataByTimeRange(startDate, endDate, filter);
    const weeklyMap = new Map<number, number>();

    for (const item of data) {
      const week = dayjs(item.timestamp).week();
      weeklyMap.set(week, (weeklyMap.get(week) || 0) + item.flowRate);
    }

    const result: { week: number; consumption: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const week = dayjs().subtract(i, 'week').week();
      result.push({
        week,
        consumption: Math.round((weeklyMap.get(week) || 0) * 100) / 100
      });
    }

    return result;
  }

  private async getMonthlyStats(filter: DataFilter) {
    const startDate = dayjs().subtract(12, 'month').startOf('month').toDate();
    const endDate = dayjs().endOf('day').toDate();

    const data = await this.queryMeterDataByTimeRange(startDate, endDate, filter);
    const monthlyMap = new Map<string, number>();

    for (const item of data) {
      const month = dayjs(item.timestamp).format('YYYY-MM');
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + item.flowRate);
    }

    const result: { month: string; consumption: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const month = dayjs().subtract(i, 'month').format('YYYY-MM');
      result.push({
        month,
        consumption: Math.round((monthlyMap.get(month) || 0) * 100) / 100
      });
    }

    return result;
  }

  private async queryMeterDataByTimeRange(
    start: Date,
    end: Date,
    filter: DataFilter
  ): Promise<Array<{ timestamp: Date; flowRate: number; deviceId: string; totalConsumption: number }>> {
    const where: any = {
      timestamp: { gte: start, lte: end }
    };

    if (filter.deviceId) {
      where.deviceId = filter.deviceId;
    }

    if (filter.areaId) {
      where.device = { areaId: filter.areaId };
    }

    return prisma.meterData.findMany({
      where,
      select: {
        timestamp: true,
        flowRate: true,
        deviceId: true,
        totalConsumption: true
      },
      orderBy: { timestamp: 'asc' }
    });
  }

  async getTrendReplay(request: TrendReplayRequest): Promise<TrendReplayResponse> {
    const cacheKey = `trend:replay:${JSON.stringify(request)}`;
    return trendCache.getOrFetch(cacheKey, async () => {
      const { startTime, endTime, granularity, deviceId, areaId } = request;

      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      const where: any = {
        timestamp: { gte: startDate, lte: endDate }
      };

      if (deviceId) {
        where.deviceId = deviceId;
      }

      if (areaId) {
        where.device = { areaId };
      }

      const rawData = await prisma.meterData.findMany({
        where,
        select: {
          timestamp: true,
          flowRate: true,
          totalConsumption: true,
          deviceId: true
        },
        orderBy: { timestamp: 'asc' }
      });

      const alertWhere: any = {
        createdAt: { gte: startDate, lte: endDate },
        type: {
          in: ['flow_spike', 'flow_drop', 'leak_detected', 'no_flow', 'abnormal_consumption', 'reverse_flow']
        }
      };

      if (deviceId) alertWhere.deviceId = deviceId;
      if (areaId) alertWhere.device = { areaId };

      const anomalies = await prisma.alert.findMany({
        where: alertWhere,
        select: {
          createdAt: true,
          type: true,
          level: true,
          message: true,
          deviceId: true
        },
        orderBy: { createdAt: 'asc' }
      });

      return this.aggregateTrendData(rawData, anomalies, request);
    });
  }

  private aggregateTrendData(
    rawData: Array<{ timestamp: Date; flowRate: number; totalConsumption: number; deviceId: string }>,
    anomalies: Array<{ createdAt: Date; type: string; level: string; message: string; deviceId: string }>,
    request: TrendReplayRequest
  ): TrendReplayResponse {
    const { startTime, endTime, granularity } = request;

    const granularityMs = {
      '1h': 3600000,
      '6h': 21600000,
      '12h': 43200000,
      '1d': 86400000,
      '1w': 604800000
    }[granularity];

    const dataPoints: TrendReplayDataPoint[] = [];
    const anomalyCountMap = new Map<number, number>();
    const anomalyDeviceCountMap = new Map<number, Set<string>>();

    for (const anomaly of anomalies) {
      const bucketStart = Math.floor(anomaly.createdAt.getTime() / granularityMs) * granularityMs;
      anomalyCountMap.set(bucketStart, (anomalyCountMap.get(bucketStart) || 0) + 1);
      if (!anomalyDeviceCountMap.has(bucketStart)) {
        anomalyDeviceCountMap.set(bucketStart, new Set());
      }
      anomalyDeviceCountMap.get(bucketStart)!.add(anomaly.deviceId);
    }

    const bucketMap = new Map<number, {
      consumption: number;
      flowSum: number;
      flowCount: number;
      devices: Set<string>;
      anomalyCount: number;
    }>();

    for (const data of rawData) {
      const bucketStart = Math.floor(data.timestamp.getTime() / granularityMs) * granularityMs;

      if (!bucketMap.has(bucketStart)) {
        bucketMap.set(bucketStart, {
          consumption: 0,
          flowSum: 0,
          flowCount: 0,
          devices: new Set(),
          anomalyCount: 0
        });
      }

      const bucket = bucketMap.get(bucketStart)!;
      bucket.consumption += data.flowRate;
      bucket.flowSum += data.flowRate;
      bucket.flowCount++;
      bucket.devices.add(data.deviceId);
    }

    for (let t = startTime; t <= endTime; t += granularityMs) {
      const bucket = bucketMap.get(t) || {
        consumption: 0,
        flowSum: 0,
        flowCount: 0,
        devices: new Set(),
        anomalyCount: 0
      };

      dataPoints.push({
        timestamp: t,
        consumption: Math.round(bucket.consumption * 100) / 100,
        avgFlowRate: bucket.flowCount > 0 ? Math.round((bucket.flowSum / bucket.flowCount) * 100) / 100 : 0,
        deviceCount: bucket.devices.size,
        anomalyCount: anomalyCountMap.get(t) || 0
      });
    }

    const consumptions = dataPoints.map(d => d.consumption);
    const totalConsumption = Math.round(consumptions.reduce((a, b) => a + b, 0) * 100) / 100;
    const maxConsumption = Math.max(...consumptions);
    const avgConsumption = Math.round((totalConsumption / Math.max(dataPoints.length, 1)) * 100) / 100;

    const anomalyPoints = anomalies
      .filter(a => {
        const threshold = ANOMALY_THRESHOLD[a.type as AnomalyType] || 20;
        return anomalyDeviceCountMap.get(
          Math.floor(a.createdAt.getTime() / granularityMs) * granularityMs
        )?.size || 0 >= threshold / 20;
      })
      .map(a => ({
        timestamp: a.createdAt.getTime(),
        type: a.type as AnomalyType,
        level: a.level,
        message: a.message,
        deviceCount: anomalyDeviceCountMap.get(
          Math.floor(a.createdAt.getTime() / granularityMs) * granularityMs
        )?.size || 1
      }));

    return {
      dataPoints,
      totalConsumption,
      maxConsumption,
      avgConsumption,
      anomalies: anomalyPoints
    };
  }

  private getFallbackOverview(): DashboardOverview {
    return {
      totalDevices: 0,
      onlineDevices: 0,
      offlineDevices: 0,
      todayAlerts: 0,
      todayConsumption: 0,
      deviceStatusDistribution: {
        normal: 0,
        warning: 0,
        error: 0,
        offline: 0
      },
      hourlyConsumption: Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        consumption: 0
      })),
      recentAlerts: []
    };
  }

  async getHistoricalData(filter: DataFilter) {
    const where: any = {};

    if (filter.deviceId) {
      where.deviceId = filter.deviceId;
    }

    if (filter.startTime) {
      where.timestamp = { ...where.timestamp, gte: new Date(filter.startTime) };
    }

    if (filter.endTime) {
      where.timestamp = { ...where.timestamp, lte: new Date(filter.endTime) };
    }

    try {
      return await prisma.meterData.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: 1000
      });
    } catch (error) {
      console.error('Error getting historical data:', error);
      return [];
    }
  }

  invalidateCaches(): void {
    overviewCache.invalidateAll();
    deviceCache.invalidateAll();
    statsCache.invalidateAll();
    trendCache.invalidateAll();
  }

  invalidateOverviewCaches(): void {
    overviewCache.invalidateAll();
  }

  invalidateStatsCaches(): void {
    statsCache.invalidateAll();
    trendCache.invalidateAll();
  }
}

export const aggregationService = new AggregationService();
