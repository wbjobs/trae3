import { io, Socket } from 'socket.io-client';
import { useEquipmentStore } from '@/store/useEquipmentStore';
import { EquipmentData, DeltaEquipmentData, MaintenancePoint } from '@/types';

interface ConnectionStats {
  reconnectAttempts: number;
  successfulReconnects: number;
  failedReconnects: number;
  messagesReceived: number;
  deltaMessagesReceived: number;
  lastMessageTime: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private dataBuffer: EquipmentData[] = [];
  private deltaBuffer: DeltaEquipmentData[] = [];
  private flushTimer: number | null = null;
  private readonly bufferSize = 5;
  private readonly flushInterval = 100;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isManualDisconnect = false;
  private stats: ConnectionStats = {
    reconnectAttempts: 0,
    successfulReconnects: 0,
    failedReconnects: 0,
    messagesReceived: 0,
    deltaMessagesReceived: 0,
    lastMessageTime: 0,
  };

  connect() {
    if (this.socket?.connected) return;

    this.isManualDisconnect = false;

    this.socket = io('http://localhost:3002', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      useEquipmentStore.getState().setConnected(true);
      this.socket?.emit('subscribe', { equipmentId: 'all' });
      this.startDataBuffering();
    });

    this.socket.on('disconnect', (reason) => {
      useEquipmentStore.getState().setConnected(false);
      this.stopDataBuffering();

      if (reason === 'io client disconnect' && !this.isManualDisconnect) {
        this.handleReconnect();
      }
    });

    this.socket.on('connect_error', () => {
      useEquipmentStore.getState().setConnected(false);
    });

    this.socket.on('reconnect', () => {
      this.stats.successfulReconnects++;
    });

    this.socket.on('reconnect_failed', () => {
      this.stats.failedReconnects++;
    });

    this.socket.on('equipment_data', (data: EquipmentData) => {
      this.stats.messagesReceived++;
      this.stats.lastMessageTime = Date.now();
      this.dataBuffer.push(data);
      if (this.dataBuffer.length >= this.bufferSize) {
        this.flushBuffer();
      }
    });

    this.socket.on('delta_data', (data: DeltaEquipmentData[]) => {
      this.stats.deltaMessagesReceived += data.length;
      this.stats.lastMessageTime = Date.now();
      this.deltaBuffer.push(...data);
      if (this.deltaBuffer.length >= this.bufferSize) {
        this.flushDeltaBuffer();
      }
    });

    this.socket.on('initial_data', (data: { equipments: any[]; maintenancePoints?: MaintenancePoint[] }) => {
      useEquipmentStore.getState().setEquipments(data.equipments);
      if (data.maintenancePoints) {
        data.maintenancePoints.forEach((point) => {
          useEquipmentStore.getState().addMaintenancePoint(point);
        });
      }
    });

    this.socket.on('maintenance_points_updated', (points: MaintenancePoint[]) => {
      const store = useEquipmentStore.getState();
      const currentPoints = store.maintenancePoints;
      const currentIds = new Set(currentPoints.map((p) => p.id));
      const newIds = new Set(points.map((p) => p.id));

      currentPoints
        .filter((p) => !newIds.has(p.id))
        .forEach((p) => store.removeMaintenancePoint(p.id));

      points.forEach((point) => {
        if (!currentIds.has(point.id)) {
          store.addMaintenancePoint(point);
        } else {
          store.updateMaintenancePoint(point.id, point);
        }
      });
    });
  }

  private startDataBuffering() {
    if (this.flushTimer) return;

    this.flushTimer = window.setInterval(() => {
      if (this.dataBuffer.length > 0) this.flushBuffer();
      if (this.deltaBuffer.length > 0) this.flushDeltaBuffer();
    }, this.flushInterval);
  }

  private stopDataBuffering() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushBuffer();
    this.flushDeltaBuffer();
  }

  private flushBuffer() {
    if (this.dataBuffer.length === 0) return;

    const dataToProcess = [...this.dataBuffer];
    this.dataBuffer = [];

    try {
      const store = useEquipmentStore.getState();
      const mergedData = new Map<string, EquipmentData>();
      dataToProcess.forEach((data) => {
        const existing = mergedData.get(data.equipmentId);
        if (!existing || new Date(data.timestamp) > new Date(existing.timestamp)) {
          mergedData.set(data.equipmentId, data);
        }
      });
      store.batchUpdateEquipmentData(Array.from(mergedData.values()));
    } catch (error) {
      console.error('[WebSocket] Error processing buffered data:', error);
    }
  }

  private flushDeltaBuffer() {
    if (this.deltaBuffer.length === 0) return;

    const dataToProcess = [...this.deltaBuffer];
    this.deltaBuffer = [];

    try {
      const store = useEquipmentStore.getState();
      dataToProcess.forEach((delta) => {
        store.applyDeltaData(delta);
      });
    } catch (error) {
      console.error('[WebSocket] Error processing delta data:', error);
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    this.stats.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 10000);

    setTimeout(() => {
      if (!this.socket?.connected && !this.isManualDisconnect) {
        this.connect();
      }
    }, delay);
  }

  disconnect() {
    this.isManualDisconnect = true;
    this.stopDataBuffering();

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    useEquipmentStore.getState().setConnected(false);
  }

  addMaintenancePoint(point: MaintenancePoint) {
    this.socket?.emit('add_maintenance_point', point);
  }

  removeMaintenancePoint(id: string) {
    this.socket?.emit('remove_maintenance_point', id);
  }

  updateMaintenancePoint(id: string, updates: Partial<MaintenancePoint>) {
    this.socket?.emit('update_maintenance_point', { id, updates });
  }

  subscribe(equipmentId: string) {
    this.socket?.emit('subscribe', { equipmentId });
  }

  getStats(): ConnectionStats {
    return { ...this.stats };
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export const wsService = new WebSocketService();
