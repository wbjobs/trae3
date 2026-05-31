import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { DatabaseManager } from './database';
import { StateSyncService } from './stateSync';
import { TacticalEngine } from './tacticalEngine';
import { GameManager } from './gameManager';
import { createSocketHandler } from './socketHandler';
import { logger } from './logger';
import { loadConfig, isConfigLoaded, getConfigLoadError } from '../shared/config';

const app = express();
const server = http.createServer(app);

try {
  loadConfig();
  logger.info('Configuration loaded successfully');
} catch (error) {
  logger.error('Failed to load configuration', { error: error as Error });
}

const config = isConfigLoaded() ? loadConfig() : null;
const PORT = config?.serverPort ?? 3000;
const DB_PATH = config?.databasePath ?? 'data/game.db';

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

async function startServer() {
  try {
    if (!isConfigLoaded()) {
      const configError = getConfigLoadError();
      logger.warn('Starting with default configuration', { configError: configError?.message });
    }

    const dbPath = path.join(__dirname, '..', DB_PATH);
    const database = new DatabaseManager(dbPath);
    await database.init();

    const stateSync = new StateSyncService();
    const engine = new TacticalEngine();
    const gameManager = new GameManager(database, stateSync, engine);

    app.use(express.static(path.join(__dirname, '..', 'client')));

    app.get('/api/config', (req, res) => {
      if (isConfigLoaded()) {
        res.json({ loaded: true, config: loadConfig() });
      } else {
        res.json({ loaded: false, error: getConfigLoadError()?.message });
      }
    });

    app.get('/api/games', async (req, res) => {
      try {
        const games = await gameManager.listGames();
        res.json({ count: games.length, games });
      } catch (error) {
        res.status(500).json({ error: 'Failed to list games' });
      }
    });

    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
    });

    const socketHandler = createSocketHandler(io, gameManager, stateSync, database);
    io.on('connection', socketHandler);

    server.listen(PORT, () => {
      logger.info('Server started', { port: PORT, dbPath });
      logger.info('Static files served from', { path: path.join(__dirname, '..', 'client') });
      logger.info('WebSocket server ready');
    });

    process.on('SIGINT', async () => {
      logger.info('Server shutting down (SIGINT)...');
      await database.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Server shutting down (SIGTERM)...');
      await database.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error as Error });
    process.exit(1);
  }
}

startServer();
