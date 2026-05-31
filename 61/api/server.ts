import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app.js';
import { addClient, removeClient, broadcastAll } from './services/subscription.js';
import { start as startMockSensors, stop as stopMockSensors } from './services/mock-sensor.js';
import type { ClientMessage } from '../shared/types.js';

const PORT = process.env.PORT || 3001;

const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('WebSocket client connected');
  addClient(ws);

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    removeClient(ws);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    removeClient(ws);
  });
});

startMockSensors();

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  console.log(`WebSocket server ready on ws://localhost:${PORT}/ws`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  stopMockSensors();
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  stopMockSensors();
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
