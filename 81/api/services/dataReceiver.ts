import { PrismaClient, Prisma } from '@prisma/client';
import type { MeterDataRequest, BatchMeterDataRequest, AnomalyDetectionResult } from '../types/index.js';
import { anomalyDetectionService } from './anomalyDetection.js';

const prisma = new PrismaClient();

const processedNonces = new Map<string, number>();
const NONCE_TTL = 5 * 60 * 1000;

function cleanExpiredNonces() {
  const now = Date.now();
  for (const [nonce, timestamp] of processedNonces.entries()) {
    if (now - timestamp > NONCE_TTL) {
      processedNonces.delete(nonce);
    }
  }
}

setInterval(cleanExpiredNonces, 60 * 1000);

export class DataReceiverService {
  private async isDuplicate(data: MeterDataRequest): Promise<boolean> {
    if (data.nonce) {
      if (processedNonces.has(data.nonce)) {
        return true;
      }
      processedNonces.set(data.nonce, Date.now());
    }

    const existing = await prisma.meterData.findFirst({
      where: {
        deviceId: data.deviceId,
        timestamp: new Date(data.timestamp)
      },
      select: { id: true }
    });

    return existing !== null;
  }

  async receiveMeterData(
    data: MeterDataRequest
  ): Promise<{ success: boolean; receivedAt: number; isDuplicate: boolean }> {
    const receivedAt = Date.now();

    const isValid = await this.validateData(data);
    if (!isValid) {
      throw new Error('Invalid data format');
    }

    const isDuplicate = await this.isDuplicate(data);
    if (isDuplicate) {
      return {
        success: true,
        receivedAt,
        isDuplicate: true
      };
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const device = await tx.device.findUnique({
            where: { id: data.deviceId },
            select: { id: true }
          });

          if (device) {
            await tx.device.update({
              where: { id: data.deviceId },
              data: {
                status: data.status,
                batteryLevel: data.batteryLevel,
                signalStrength: data.signalStrength,
                lastOnline: new Date(data.timestamp),
                updatedAt: new Date()
              }
            });
          } else {
            await tx.device.create({
              data: {
                id: data.deviceId,
                serialNumber: `METER-${data.deviceId.slice(0, 8).toUpperCase()}`,
                model: 'SmartMeter-V1',
                status: data.status,
                batteryLevel: data.batteryLevel,
                signalStrength: data.signalStrength,
                lastOnline: new Date(data.timestamp)
              }
            });
          }

          const meterData = await tx.meterData.create({
            data: {
              deviceId: data.deviceId,
              flowRate: data.flowRate,
              totalConsumption: data.totalConsumption,
              timestamp: new Date(data.timestamp)
            }
          });

          return { meterData, deviceExisted: !!device };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000
        }
      );

      try {
        const anomalies = anomalyDetectionService.detectAnomalies(data);
        if (anomalies.length > 0) {
          await this.createAlertsForAnomalies(data.deviceId, anomalies);
        }
      } catch (anomalyError) {
        console.error('Error in anomaly detection:', anomalyError);
      }

      return {
        success: true,
        receivedAt,
        isDuplicate: false
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return {
            success: true,
            receivedAt,
            isDuplicate: true
          };
        }
      }
      console.error('Error receiving meter data:', error);
      throw error;
    }
  }

  async receiveBatchMeterData(
    batchData: BatchMeterDataRequest
  ): Promise<{
    success: boolean;
    receivedAt: number;
    processed: number;
    duplicates: number;
    failed: number;
    errors: string[];
  }> {
    const receivedAt = Date.now();
    let processed = 0;
    let duplicates = 0;
    let failed = 0;
    const errors: string[] = [];

    const validData: MeterDataRequest[] = [];
    for (const data of batchData.data) {
      const isValid = await this.validateData(data);
      if (!isValid) {
        failed++;
        errors.push(`Invalid data for device ${data.deviceId}`);
        continue;
      }

      const isDuplicate = await this.isDuplicate(data);
      if (isDuplicate) {
        duplicates++;
        continue;
      }

      validData.push(data);
    }

    if (validData.length === 0) {
      return {
        success: true,
        receivedAt,
        processed,
        duplicates,
        failed,
        errors
      };
    }

    const chunkSize = 50;
    for (let i = 0; i < validData.length; i += chunkSize) {
      const chunk = validData.slice(i, i + chunkSize);

      try {
        await prisma.$transaction(
          async (tx) => {
            await Promise.all(
              chunk.map((data) =>
                tx.device.upsert({
                  where: { id: data.deviceId },
                  update: {
                    status: data.status,
                    batteryLevel: data.batteryLevel,
                    signalStrength: data.signalStrength,
                    lastOnline: new Date(data.timestamp),
                    updatedAt: new Date()
                  },
                  create: {
                    id: data.deviceId,
                    serialNumber: `METER-${data.deviceId.slice(0, 8).toUpperCase()}-${Date.now().toString(36)}`,
                    model: 'SmartMeter-V1',
                    status: data.status,
                    batteryLevel: data.batteryLevel,
                    signalStrength: data.signalStrength,
                    lastOnline: new Date(data.timestamp)
                  }
                })
              )
            );

            await tx.meterData.createMany({
              data: chunk.map((data) => ({
                deviceId: data.deviceId,
                flowRate: data.flowRate,
                totalConsumption: data.totalConsumption,
                timestamp: new Date(data.timestamp)
              }))
            });

            processed += chunk.length;

            for (const data of chunk) {
              try {
                const anomalies = anomalyDetectionService.detectAnomalies(data);
                if (anomalies.length > 0) {
                  await this.createAlertsForAnomalies(data.deviceId, anomalies);
                }
              } catch (anomalyError) {
                console.error('Error in batch anomaly detection:', anomalyError);
              }
            }
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 30000
          }
        );
      } catch (error) {
        failed += chunk.length;
        errors.push(
          `Batch processing failed for chunk ${i / chunkSize}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`
        );
      }
    }

    return {
      success: failed === 0,
      receivedAt,
      processed,
      duplicates,
      failed,
      errors
    };
  }

  async validateData(data: MeterDataRequest): Promise<boolean> {
    if (!data.deviceId || data.deviceId.length < 5) {
      return false;
    }

    if (data.timestamp <= 0 || data.timestamp > Date.now() + 60000) {
      return false;
    }

    if (data.totalConsumption < 0) {
      return false;
    }

    if (data.batteryLevel < 0 || data.batteryLevel > 100) {
      return false;
    }

    if (data.signalStrength < -120 || data.signalStrength > 0) {
      return false;
    }

    const validStatuses = ['normal', 'warning', 'error', 'offline'];
    if (!validStatuses.includes(data.status)) {
      return false;
    }

    return true;
  }

  private async createAlertsForAnomalies(
    deviceId: string,
    anomalies: AnomalyDetectionResult[]
  ): Promise<void> {
    if (anomalies.length === 0) return;

    const pendingAlerts = await prisma.alert.findMany({
      where: {
        deviceId,
        status: { in: ['pending', 'processing'] },
        type: { in: anomalies.map(a => a.type) }
      },
      select: { type: true, createdAt: true }
    });

    const existingTypes = new Set(pendingAlerts.map(a => a.type));

    for (const anomaly of anomalies) {
      if (existingTypes.has(anomaly.type)) continue;

      try {
        await prisma.alert.create({
          data: {
            deviceId,
            type: anomaly.type,
            level: anomaly.level,
            message: anomaly.message,
            status: 'pending',
            createdAt: new Date()
          }
        });
      } catch (error) {
        console.error('Error creating alert for anomaly:', error);
      }
    }
  }
}

export const dataReceiverService = new DataReceiverService();
