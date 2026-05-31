import { PrismaClient } from '@prisma/client';
import type { DeviceFilter, PaginatedResponse } from '../types/index.js';

const prisma = new PrismaClient();

export class DeviceService {
  async getDevices(filter: DeviceFilter): Promise<PaginatedResponse<any>> {
    const { page = 1, pageSize = 20, ...queryFilter } = filter;
    const where: any = {};

    if (queryFilter.status) {
      where.status = queryFilter.status;
    }

    if (queryFilter.areaId) {
      where.areaId = queryFilter.areaId;
    }

    if (queryFilter.keyword) {
      where.OR = [
        { serialNumber: { contains: queryFilter.keyword } },
        { model: { contains: queryFilter.keyword } }
      ];
    }

    const [devices, total] = await Promise.all([
      prisma.device.findMany({
        where,
        include: {
          area: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.device.count({ where })
    ]);

    return {
      list: devices.map(device => ({
        id: device.id,
        serialNumber: device.serialNumber,
        model: device.model,
        status: device.status,
        batteryLevel: device.batteryLevel,
        signalStrength: device.signalStrength,
        lastOnline: device.lastOnline?.toISOString(),
        areaName: device.area?.name,
        createdAt: device.createdAt.toISOString(),
        updatedAt: device.updatedAt.toISOString()
      })),
      total,
      page,
      pageSize
    };
  }

  async getDeviceDetail(deviceId: string) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        area: true,
        meterData: {
          take: 50,
          orderBy: {
            timestamp: 'desc'
          }
        },
        alerts: {
          take: 10,
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!device) {
      return null;
    }

    return {
      id: device.id,
      serialNumber: device.serialNumber,
      model: device.model,
      status: device.status,
      batteryLevel: device.batteryLevel,
      signalStrength: device.signalStrength,
      lastOnline: device.lastOnline?.toISOString(),
      area: device.area,
      recentData: device.meterData,
      recentAlerts: device.alerts,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString()
    };
  }

  async createDevice(data: {
    serialNumber: string;
    model: string;
    areaId?: string;
  }) {
    return prisma.device.create({
      data: {
        serialNumber: data.serialNumber,
        model: data.model,
        areaId: data.areaId
      }
    });
  }

  async updateDevice(
    deviceId: string,
    data: {
      status?: string;
      areaId?: string;
    }
  ) {
    return prisma.device.update({
      where: { id: deviceId },
      data
    });
  }

  async deleteDevice(deviceId: string) {
    return prisma.device.delete({
      where: { id: deviceId }
    });
  }

  async getAreas() {
    return prisma.area.findMany({
      orderBy: {
        level: 'asc'
      }
    });
  }

  async createArea(data: {
    name: string;
    parentId?: string;
    level: number;
  }) {
    return prisma.area.create({
      data
    });
  }

  async initializeMockData() {
    const areas = await prisma.area.count();
    if (areas === 0) {
      await prisma.area.createMany({
        data: [
          { name: '东城区', level: 1 },
          { name: '西城区', level: 1 },
          { name: '朝阳区', level: 1 },
          { name: '海淀区', level: 1 }
        ]
      });
    }

    const devices = await prisma.device.count();
    if (devices === 0) {
      const areaList = await prisma.area.findMany();
      const deviceData = [];
      
      for (let i = 0; i < 50; i++) {
        const randomArea = areaList[Math.floor(Math.random() * areaList.length)];
        const statuses = ['normal', 'normal', 'normal', 'warning', 'error', 'offline'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        
        deviceData.push({
          serialNumber: `METER-${String(i + 1).padStart(6, '0')}`,
          model: 'SmartMeter-V1',
          status: randomStatus,
          batteryLevel: Math.floor(Math.random() * 100),
          signalStrength: -50 - Math.floor(Math.random() * 70),
          lastOnline: new Date(),
          areaId: randomArea.id
        });
      }

      await prisma.device.createMany({
        data: deviceData
      });

      const createdDevices = await prisma.device.findMany();
      const meterData = [];
      
      for (const device of createdDevices) {
        for (let i = 0; i < 24; i++) {
          meterData.push({
            deviceId: device.id,
            flowRate: Math.round(Math.random() * 50 * 100) / 100,
            totalConsumption: Math.round(Math.random() * 1000 * 100) / 100,
            timestamp: new Date(Date.now() - (24 - i) * 3600000)
          });
        }
      }

      await prisma.meterData.createMany({
        data: meterData
      });

      const alertTypes = [
        { type: 'battery_low', level: 'warning', message: '设备电量过低' },
        { type: 'signal_weak', level: 'warning', message: '信号强度较弱' },
        { type: 'device_error', level: 'error', message: '设备状态异常' },
        { type: 'flow_abnormal', level: 'warning', message: '流量异常' }
      ];

      const alerts = [];
      for (let i = 0; i < 20; i++) {
        const randomDevice = createdDevices[Math.floor(Math.random() * createdDevices.length)];
        const randomAlert = alertTypes[Math.floor(Math.random() * alertTypes.length)];
        const statuses = ['pending', 'processing', 'resolved'];
        
        alerts.push({
          deviceId: randomDevice.id,
          type: randomAlert.type,
          level: randomAlert.level,
          message: randomAlert.message,
          status: statuses[Math.floor(Math.random() * statuses.length)],
          createdAt: new Date(Date.now() - Math.random() * 86400000 * 7)
        });
      }

      await prisma.alert.createMany({
        data: alerts
      });
    }
  }
}

export const deviceService = new DeviceService();
