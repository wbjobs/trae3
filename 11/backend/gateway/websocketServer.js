const WebSocket = require('ws');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map();
    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      const clientId = Date.now().toString();
      this.clients.set(clientId, ws);

      console.log(`WebSocket client connected: ${clientId}, total: ${this.clients.size}`);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleClientMessage(clientId, data);
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`WebSocket client disconnected: ${clientId}, total: ${this.clients.size}`);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });
  }

  handleClientMessage(clientId, data) {
    console.log(`Received from client ${clientId}:`, data.type);
  }

  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });

    this.clients.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
        } catch (err) {
          console.error(`Failed to send to client ${clientId}:`, err);
        }
      }
    });
  }

  sendToClient(clientId, type, payload) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
    }
  }

  getClientCount() {
    return this.clients.size;
  }

  close() {
    this.wss.close();
  }
}

module.exports = WebSocketServer;
