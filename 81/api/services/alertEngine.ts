import { PrismaClient } from '@prisma/client';
import type { MeterDataRequest } from '../types/index.js';

const prisma = new PrismaClient();

export class AlertEngineService {
  async checkAndCreateAlerts(data: MeterDataRequest): Promise<void> {
    const alerts: Array<{
      type: string;
      level: string;
      message: string;
    }> = [];

    if (data.batteryLevel < 20) {
      alerts.push({
        type: 'battery_low',
        level: data.batteryLevel < 10 ? 'critical' : 'warning',
        message: `设备电量过低: ${data.batteryLevel}%`
      });
    }

    if (data.signalStrength < -90) {
      alerts.push({
        type: 'signal_weak',
        level: data.signalStrength < -100 ? 'error' : 'warning',
        message: `信号强度较弱: ${data.signalStrength} dBm`
      });
    }

    if (data.status === 'error') {
      alerts.push({
        type: 'device_error',
        level: 'error',
        message: '设备状态异常'
      });
    }

    if (data.status === 'offline') {
      alerts.push({
        type: 'device_offline',
        level: 'critical',
        message: '设备离线'
      });
    }

    if (data.flowRate > 100) {
      alerts.push({
        type: 'flow_abnormal',
        level: 'warning',
        message: `流量异常: ${data.flowRate} m³/h`
      });
    }

    for (const alert of alerts) {
      await this.createAlert(data.deviceId, alert);
    }
  }

  private async createAlert(
    deviceId: string,
    alertData: { type: string; level: string; message: string }
  ): Promise<void> {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        deviceId,
        type: alertData.type,
        status: {
          in: ['pending', 'processing']
        }
      }
    });

    if (!existingAlert) {
      await prisma.alert.create({
        data: {
          deviceId,
          type: alertData.type,
          level: alertData.level,
          message: alertData.message,
          status: 'pending'
        }
      });
    }
  }

  async getAlerts(filter: {
    status?: string;
    level?: string;
    deviceId?: string;
    page?: number;
    pageSize?: number;
  }) {
    const { page = 1, pageSize = 20, ...whereFilter } = filter;
    const where: any = {};

    if (whereFilter.status) {
      where.status = whereFilter.status;
    }
    if (whereFilter.level) {
      where.level = whereFilter.level;
    }
    if (whereFilter.deviceId) {
      where.deviceId = whereFilter.deviceId;
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          device: {
            select: {
              serialNumber: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.alert.count({ where })
    ]);

    return {
      list: alerts.map(alert => ({
        id: alert.id,
        deviceId: alert.deviceId,
        deviceSerial: alert.device?.serialNumber || 'Unknown',
        type: alert.type,
        level: alert.level,
        message: alert.message,
        status: alert.status,
        createdAt: alert.createdAt.toISOString(),
        resolvedAt: alert.resolvedAt?.toISOString()
      })),
      total,
      page,
      pageSize
    };
  }

  async handleAlert(alertId: string, status: string): Promise<void> {
    const updateData: any = {
      status
    };

    if (status === 'resolved') {
      updateData.resolvedAt = new Date();
    }

    await prisma.alert.update({
      where: { id: alertId },
      data: updateData
    });
  }

  async getAlertStatistics() {
    const statusStats = await prisma.alert.groupBy({
      by: ['status'],
      _count: true
    });

    const levelStats = await prisma.alert.groupBy({
      by: ['level'],
      _count: true
    });

    return {
      byStatus: Object.fromEntries(
        statusStats.map(s => [s.status, s._count])
      ),
      byLevel: Object.fromEntries(
        levelStats.map(s => [s.level, s._count])
      )
    };
  }
}

export const alertEngineService = new AlertEngineService();
