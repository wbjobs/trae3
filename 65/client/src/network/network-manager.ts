import {
  GameMessage,
  MessageType,
  JoinGamePayload,
  BuildRequest,
  DemolishRequest,
  ChatPayload,
  PlotData,
  PlayerState,
  StateSyncPayload,
  ResourceUpdatePayload,
  ErrorPayload,
  ResourceBag,
} from '../../shared';

export type MessageHandler = (msg: GameMessage) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private url: string;
  private playerId: string | null = null;
  private handlers: Map<MessageType, MessageHandler[]> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;
  private connected: boolean = false;
  private onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(url: string = `ws://${window.location.hostname}:3001`) {
    this.url = url;
  }

  connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[Network] Connected to server');
        if (this.onConnectionChange) this.onConnectionChange(true);
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: GameMessage = JSON.parse(event.data as string);
          this.dispatch(msg);
        } catch (err) {
          console.error('[Network] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this.connected = false;
        console.log('[Network] Disconnected from server');
        if (this.onConnectionChange) this.onConnectionChange(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Network] WebSocket error:', err);
      };
    } catch (err) {
      console.error('[Network] Connection failed:', err);
      this.attemptReconnect();
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Network] Max reconnection attempts reached');
      return;
    }
    this.reconnectAttempts++;
    console.log(`[Network] Reconnecting... attempt ${this.reconnectAttempts}`);
    setTimeout(() => this.connect(), this.reconnectDelay * this.reconnectAttempts);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: GameMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  joinGame(playerName: string): void {
    const payload: JoinGamePayload = { playerName };
    this.send({
      type: MessageType.JOIN_GAME,
      payload,
      timestamp: Date.now(),
    });
  }

  requestBuild(plotId: string, buildingType: string): void {
    const payload: BuildRequest = {
      playerId: this.playerId || '',
      plotId,
      buildingType: buildingType as any,
    };
    this.send({
      type: MessageType.BUILD_REQUEST,
      payload,
      timestamp: Date.now(),
    });
  }

  requestDemolish(plotId: string): void {
    const payload: DemolishRequest = {
      playerId: this.playerId || '',
      plotId,
    };
    this.send({
      type: MessageType.DEMOLISH_REQUEST,
      payload,
      timestamp: Date.now(),
    });
  }

  sendChat(text: string): void {
    const payload: ChatPayload = {
      playerId: this.playerId || '',
      playerName: '',
      text,
    };
    this.send({
      type: MessageType.CHAT_MESSAGE,
      payload,
      timestamp: Date.now(),
    });
  }

  on(type: MessageType, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const list = this.handlers.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  private dispatch(msg: GameMessage): void {
    const list = this.handlers.get(msg.type);
    if (list) {
      for (const handler of list) {
        handler(msg);
      }
    }
  }

  setPlayerId(id: string): void {
    this.playerId = id;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  isConnected(): boolean {
    return this.connected;
  }

  setOnConnectionChange(handler: (connected: boolean) => void): void {
    this.onConnectionChange = handler;
  }
}
