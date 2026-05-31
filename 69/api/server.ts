import { Server, Socket } from 'socket.io';
import { createServer } from 'http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import app from './app.js';
import { dataSimulator } from './services/dataSimulator.js';
import { getLogger, cleanupLoggers } from './utils/logger.js';
import { EquipmentData, DeltaEquipmentData, MaintenancePoint } from '../shared/types.js';

const logger = getLogger('WebSocketServer');

const PORT = process.env.PORT || 3002;

const httpServer = createServer(app);

const LOG_DIR = join(process.cwd(), 'logs');
const ARCHIVE_DIR = join(LOG_DIR, 'archive');
const MAINTENANCE_FILE = join(process.cwd(), 'data', 'maintenance-points.json');
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_ARCHIVES = 10;

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
if (!existsSync(ARCHIVE_DIR)) mkdirSync(ARCHIVE_DIR, { recursive: true });
if (!existsSync(join(process.cwd(), 'data'))) mkdirSync(join(process.cwd(), 'data'), { recursive: true });

interface ConnectionStats {
  totalConnections: number;
  activeConnections: number;
  messagesSent: number;
  bytesSent: number;
  errors: number;
  deltaMessagesSent: number;
  deltaBytesSaved: number;
}

class WebSocketServer {
  private io: Server;
  private stats: ConnectionStats = {
    totalConnections: 0,
    activeConnections: 0,
    messagesSent: 0,
    bytesSent: 0,
    errors: 0,
    deltaMessagesSent: 0,
    deltaBytesSaved: 0,
  };
  private dataBuffer: EquipmentData[] = [];
  private deltaBuffer: DeltaEquipmentData[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private deltaFlushTimer: NodeJS.Timeout | null = null;
  private connectedSockets = new Set<string>();
  private maintenancePoints: MaintenancePoint[] = [];
  private currentLogFile: string;
  private logStream: number | null = null;

  constructor(httpServer: any) {
    this.io = new Server(httpServer, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      pingInterval: 15000,
      pingTimeout: 30000,
      maxHttpBufferSize: 1e6,
      transports: ['websocket', 'polling'],
    });

    this.currentLogFile = join(LOG_DIR, `server-${new Date().toISOString().split('T')[0]}.log`);
    this.loadMaintenancePoints();
    this.setupEventHandlers();
    this.setupDataBuffering();
    this.setupLogRotation();
    dataSimulator.start();
  }

  private loadMaintenancePoints() {
    try {
      if (existsSync(MAINTENANCE_FILE)) {
        const data = readFileSync(MAINTENANCE_FILE, 'utf-8');
        this.maintenancePoints = JSON.parse(data);
        logger.info(`Loaded ${this.maintenancePoints.length} maintenance points`);
      }
    } catch (error) {
      logger.error('Failed to load maintenance points:', error);
      this.maintenancePoints = [];
    }
  }

  private saveMaintenancePoints() {
    try {
      writeFileSync(MAINTENANCE_FILE, JSON.stringify(this.maintenancePoints, null, 2));
    } catch (error) {
      logger.error('Failed to save maintenance points:', error);
    }
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    this.io.on('error', (error) => {
      this.stats.errors++;
      logger.error('Socket.IO error:', error);
    });
  }

  private handleConnection(socket: Socket) {
    this.stats.totalConnections++;
    this.stats.activeConnections++;
    this.connectedSockets.add(socket.id);

    logger.info(`Client connected: ${socket.id}, Active: ${this.stats.activeConnections}`);

    try {
      socket.emit('initial_data', {
        equipments: dataSimulator.getEquipments(),
        maintenancePoints: this.maintenancePoints,
      });
    } catch (error) {
      this.stats.errors++;
      logger.error('Failed to send initial data:', error);
    }

    socket.on('subscribe', (data) => {
      logger.debug(`Subscribe request from ${socket.id}:`, data);
    });

    socket.on('unsubscribe', (data) => {
      logger.debug(`Unsubscribe request from ${socket.id}:`, data);
    });

    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback({ status: 'ok', timestamp: Date.now() });
      }
    });

    socket.on('add_maintenance_point', (point: MaintenancePoint) => {
      this.maintenancePoints.push(point);
      this.saveMaintenancePoints();
      this.io.emit('maintenance_points_updated', this.maintenancePoints);
      logger.info(`Maintenance point added: ${point.id}`);
    });

    socket.on('remove_maintenance_point', (id: string) => {
      this.maintenancePoints = this.maintenancePoints.filter((p) => p.id !== id);
      this.saveMaintenancePoints();
      this.io.emit('maintenance_points_updated', this.maintenancePoints);
      logger.info(`Maintenance point removed: ${id}`);
    });

    socket.on('update_maintenance_point', ({ id, updates }: { id: string; updates: Partial<MaintenancePoint> }) => {
      this.maintenancePoints = this.maintenancePoints.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      );
      this.saveMaintenancePoints();
      this.io.emit('maintenance_points_updated', this.maintenancePoints);
      logger.info(`Maintenance point updated: ${id}`);
    });

    socket.on('disconnect', (reason) => {
      this.handleDisconnect(socket, reason);
    });

    socket.on('error', (error) => {
      this.stats.errors++;
      logger.error(`Socket error ${socket.id}:`, error);
    });
  }

  private handleDisconnect(socket: Socket, reason: string) {
    this.stats.activeConnections--;
    this.connectedSockets.delete(socket.id);

    logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}, Active: ${this.stats.activeConnections}`);

    if (this.stats.activeConnections === 0) {
      this.flushBuffer();
      this.flushDeltaBuffer();
    }
  }

  private setupDataBuffering() {
    dataSimulator.onDataUpdate((data) => {
      this.dataBuffer.push(data);
      if (this.dataBuffer.length >= this.bufferSize) {
        this.flushBuffer();
      }
    });

    dataSimulator.onDeltaUpdate((delta) => {
      this.deltaBuffer.push(delta);
      if (this.deltaBuffer.length >= this.bufferSize) {
        this.flushDeltaBuffer();
      }
    });

    this.flushTimer = setInterval(() => {
      if (this.dataBuffer.length > 0) this.flushBuffer();
      if (this.deltaBuffer.length > 0) this.flushDeltaBuffer();
    }, 100);
  }

  private readonly bufferSize = 10;

  private flushBuffer() {
    if (this.dataBuffer.length === 0) return;
    if (this.stats.activeConnections === 0) {
      this.dataBuffer = [];
      return;
    }

    const dataToSend = [...this.dataBuffer];
    this.dataBuffer = [];

    setImmediate(() => {
      try {
        dataToSend.forEach((data) => {
          this.io.emit('equipment_data', data);
          this.stats.messagesSent++;
          this.stats.bytesSent += JSON.stringify(data).length;
        });
      } catch (error) {
        this.stats.errors++;
        logger.error('Broadcast error:', error);
      }
    });
  }

  private flushDeltaBuffer() {
    if (this.deltaBuffer.length === 0) return;
    if (this.stats.activeConnections === 0) {
      this.deltaBuffer = [];
      return;
    }

    const dataToSend = [...this.deltaBuffer];
    this.deltaBuffer = [];

    setImmediate(() => {
      try {
        const startTime = Date.now();
        const deltaJson = JSON.stringify(dataToSend);
        this.io.emit('delta_data', dataToSend);
        this.stats.deltaMessagesSent += dataToSend.length;

        const fullSize = dataToSend.reduce((sum, d) => {
          const eq = dataSimulator.getEquipments().find((e) => e.id === d.equipmentId);
          return sum + (eq ? JSON.stringify({ equipmentId: d.equipmentId, parameters: eq.parameters, timestamp: d.timestamp }).length : 0);
        }, 0);
        this.stats.deltaBytesSaved += (fullSize - deltaJson.length);

        const duration = Date.now() - startTime;
        if (duration > 50) {
          logger.warn(`Slow delta broadcast: ${duration}ms for ${dataToSend.length} messages`);
        }
      } catch (error) {
        this.stats.errors++;
        logger.error('Delta broadcast error:', error);
      }
    });
  }

  private setupLogRotation() {
    setInterval(() => {
      this.rotateLogIfNeeded();
    }, 60000);

    setInterval(() => {
      this.archiveOldLogs();
    }, 24 * 60 * 60 * 1000);
  }

  private rotateLogIfNeeded() {
    if (!existsSync(this.currentLogFile)) return;

    try {
      const stats = statSync(this.currentLogFile);
      if (stats.size >= MAX_LOG_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archiveName = `server-${timestamp}.log.gz`;
        const archivePath = join(ARCHIVE_DIR, archiveName);

        try {
          const content = readFileSync(this.currentLogFile, 'utf-8');
          writeFileSync(archivePath, content);
          unlinkSync(this.currentLogFile);
          logger.info(`Log rotated to ${archiveName}`);
        } catch (e) {
          logger.error('Log rotation failed:', e);
        }

        this.currentLogFile = join(LOG_DIR, `server-${new Date().toISOString().split('T')[0]}.log`);
      }
    } catch (error) {
      // file may have been deleted
    }
  }

  private archiveOldLogs() {
    try {
      if (!existsSync(ARCHIVE_DIR)) return;

      const files = readdirSync(ARCHIVE_DIR)
        .filter((f) => f.endsWith('.log.gz'))
        .map((f) => ({
          name: f,
          path: join(ARCHIVE_DIR, f),
          time: statSync(join(ARCHIVE_DIR, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > MAX_ARCHIVES) {
        files.slice(MAX_ARCHIVES).forEach((f) => {
          try {
            unlinkSync(f.path);
            logger.info(`Archived log purged: ${f.name}`);
          } catch (e) {
            logger.error(`Failed to purge ${f.name}:`, e);
          }
        });
      }
    } catch (error) {
      logger.error('Archive cleanup failed:', error);
    }
  }

  public getStats(): ConnectionStats {
    return { ...this.stats };
  }

  public shutdown() {
    logger.info('Shutting down WebSocket server...');

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.flushBuffer();
    this.flushDeltaBuffer();
    dataSimulator.stop();
    this.saveMaintenancePoints();

    this.io.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}

const wsServer = new WebSocketServer(httpServer);

const server = httpServer.listen(PORT, () => {
  logger.info(`Server ready on port ${PORT}`);
  logger.info('WebSocket server running with delta protocol');
});

setInterval(() => {
  const stats = wsServer.getStats();
  logger.debug(`Stats: conn=${stats.activeConnections}, msgs=${stats.messagesSent}, deltas=${stats.deltaMessagesSent}, saved=${stats.deltaBytesSaved}B`);
}, 30000);

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received');
  wsServer.shutdown();
  cleanupLoggers();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received');
  wsServer.shutdown();
  cleanupLoggers();
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

export default app;
