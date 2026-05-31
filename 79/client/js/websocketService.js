export class WebSocketService {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 20;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 30000;
    this.isManualClose = false;
    this.listeners = new Map();
    this.pingInterval = null;
    this.pingTimeout = null;
    this.pingIntervalTime = 25000;
    this.pongTimeoutTime = 10000;
    this.messageQueue = [];
    this.maxQueueSize = 100;
    this.isConnecting = false;
  }

  connect() {
    if (this.isConnecting) {
      return Promise.reject(new Error('Already connecting'));
    }

    this.isConnecting = true;
    this.isManualClose = false;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        const timeoutId = setTimeout(() => {
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.onopen = () => {
          clearTimeout(timeoutId);
          console.log('WebSocket 连接成功');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 3000;
          this.startHeartbeat();
          this.flushMessageQueue();
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('消息解析错误:', e);
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(timeoutId);
          this.isConnecting = false;
          console.error('WebSocket 错误:', error);
          this.emit('error', error);
          this.stopHeartbeat();
        };

        this.ws.onclose = (event) => {
          clearTimeout(timeoutId);
          this.isConnecting = false;
          console.log('WebSocket 连接关闭:', event.code, event.reason);
          this.stopHeartbeat();
          this.emit('disconnected');
          
          if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay);
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})... ${Math.round(delay / 1000)}秒后重试`);
            setTimeout(() => this.connect(), delay);
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('达到最大重连次数，停止重连');
            this.emit('maxReconnectAttemptsReached');
          }
        };

        this.ws.addEventListener('pong', () => {
          this.handlePong();
        });

      } catch (e) {
        this.isConnecting = false;
        reject(e);
      }
    });
  }

  handleMessage(message) {
    switch (message.type) {
      case 'tankData':
        this.emit('tankData', message.tankId, message.data);
        break;
      case 'alert':
        this.emit('alert', message.alert);
        break;
      case 'welcome':
        console.log('服务器欢迎消息:', message);
        this.emit('welcome', message);
        break;
      case 'pong':
        this.handlePong();
        break;
      default:
        console.log('未知消息类型:', message.type);
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping && this.ws.ping();
        } catch (e) {
          console.error('发送ping失败:', e);
        }

        this.pingTimeout = setTimeout(() => {
          console.warn('Pong超时，断开连接');
          if (this.ws) {
            this.ws.terminate();
          }
        }, this.pongTimeoutTime);
      }
    }, this.pingIntervalTime);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  handlePong() {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (e) {
        console.error('发送消息失败:', e);
        this.queueMessage(message);
        return false;
      }
    } else {
      this.queueMessage(message);
      return false;
    }
  }

  queueMessage(message) {
    this.messageQueue.push(message);
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift();
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (!this.send(message)) {
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  subscribe(tankIds = null) {
    return this.send({
      type: 'subscribe',
      tankIds
    });
  }

  unsubscribe(tankIds) {
    return this.send({
      type: 'unsubscribe',
      tankIds
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event, ...args) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(callback => {
      try {
        callback(...args);
      } catch (e) {
        console.error(`事件处理器错误 (${event}):`, e);
      }
    });
  }

  close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client closing');
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  getReconnectInfo() {
    return {
      attempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      nextDelay: this.reconnectDelay
    };
  }
}
