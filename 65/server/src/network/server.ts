import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { Database } from '../core/database';
import { GameRoom } from '../network/game-room';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

export class Server {
  private app: express.Application;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private db: Database;
  private gameRoom: GameRoom;

  constructor() {
    this.app = express();
    this.httpServer = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.db = new Database();
    this.gameRoom = new GameRoom(this.db);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok', tick: this.gameRoom ? 0 : 0, players: 0 });
    });

    this.app.get('/api/games', (_req, res) => {
      const games = this.db.listGames();
      res.json(games);
    });

    this.app.post('/api/games', (_req, res) => {
      const id = `game_${Date.now()}`;
      this.db.saveGame({
        id,
        tick: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mapSeed: Date.now(),
      });
      res.json({ id, created: true });
    });

    this.app.get('/api/schemes/:ownerId', (req, res) => {
      const schemes = this.db.listSchemesByOwner(req.params.ownerId);
      res.json({ schemes, count: schemes.length });
    });

    this.app.get('/api/schemes/:id', (req, res) => {
      const scheme = this.db.getScheme(req.params.id);
      if (!scheme) {
        res.status(404).json({ error: 'Scheme not found' });
        return;
      }
      res.json(scheme);
    });

    this.app.delete('/api/schemes/:id', (req, res) => {
      this.db.deleteScheme(req.params.id);
      res.json({ deleted: true });
    });

    this.app.get('/api/history/:plotId', (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const beforeTick = req.query.beforeTick ? parseInt(req.query.beforeTick as string) : undefined;
      const entries = this.db.queryHistory(req.params.plotId, limit, beforeTick);
      res.json({ plotId: req.params.plotId, entries, total: entries.length });
    });

    this.app.get('/api/db/stats', (_req, res) => {
      res.json(this.db.getCacheStats());
    });

    this.app.post('/api/db/flush', (_req, res) => {
      this.db.flushDirty();
      res.json({ flushed: true });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws) => {
      this.gameRoom.handleConnection(ws);
    });
  }

  start(): void {
    this.gameRoom.start();
    this.httpServer.listen(PORT, () => {
      console.log(`[Server] HTTP + WebSocket listening on port ${PORT}`);
    });

    process.on('SIGINT', () => {
      console.log('[Server] Shutting down...');
      this.gameRoom.stop();
      this.db.stopAutoFlush();
      this.httpServer.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.gameRoom.stop();
      this.db.stopAutoFlush();
      this.httpServer.close();
      process.exit(0);
    });
  }
}
