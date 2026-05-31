// WebSocket服务 - STOMP协议实时通信

import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { Client, IMessage, Stomp } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { Observable, Subject, Subscription } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * WebSocket连接状态
 */
export enum ConnectionStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error'
}

/**
 * WebSocket消息接口
 */
export interface WebSocketMessage<T = any> {
  event: string;
  data: T;
  timestamp: number;
  senderId?: string;
  messageId: string;
}

@Injectable({ providedIn: 'root' })
export class WebSocketService implements OnDestroy {
  private authService = inject(AuthService);

  private client: Client | null = null;
  private readonly wsUrl = '/ws';
  private subscriptions: Map<string, Subscription> = new Map();
  private stompSubscriptions: Map<string, any> = new Map();

  connectionStatus = signal<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  isConnected = signal<boolean>(false);

  private connectPromise: Promise<void> | null = null;

  constructor() {}

  /**
   * 连接WebSocket服务器
   */
  connect(): Promise<void> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    if (this.client?.connected) {
      return Promise.resolve();
    }

    this.connectionStatus.set(ConnectionStatus.CONNECTING);

    this.connectPromise = new Promise((resolve, reject) => {
      const token = this.authService.getAccessToken();

      this.client = new Client({
        webSocketFactory: () => new SockJS(this.wsUrl) as any,
        connectHeaders: {
          Authorization: token ? `Bearer ${token}` : ''
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        debug: (str) => {
          console.debug('STOMP:', str);
        }
      });

      this.client.onConnect = (frame) => {
        console.log('WebSocket连接成功');
        this.connectionStatus.set(ConnectionStatus.CONNECTED);
        this.isConnected.set(true);
        this.connectPromise = null;
        resolve();
      };

      this.client.onDisconnect = (frame) => {
        console.log('WebSocket断开连接');
        this.connectionStatus.set(ConnectionStatus.DISCONNECTED);
        this.isConnected.set(false);
        this.connectPromise = null;
      };

      this.client.onStompError = (frame) => {
        console.error('STOMP错误:', frame);
        this.connectionStatus.set(ConnectionStatus.ERROR);
        this.isConnected.set(false);
        this.connectPromise = null;
        reject(frame);
      };

      this.client.onWebSocketError = (event) => {
        console.error('WebSocket错误:', event);
        this.connectionStatus.set(ConnectionStatus.ERROR);
        this.isConnected.set(false);
        this.connectPromise = null;
        reject(event);
      };

      this.client.onWebSocketClose = (event) => {
        console.log('WebSocket关闭:', event);
        this.connectionStatus.set(ConnectionStatus.DISCONNECTED);
        this.isConnected.set(false);
        this.connectPromise = null;
      };

      this.client.activate();
    });

    return this.connectPromise;
  }

  /**
   * 发送消息到指定目的地
   */
  send(destination: string, body: any, headers?: any): void {
    if (!this.client?.connected) {
      console.warn('WebSocket未连接，无法发送消息');
      return;
    }

    this.client.publish({
      destination,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers
    });
  }

  /**
   * 订阅指定目的地
   */
  subscribe<T = any>(destination: string): Observable<T> {
    return new Observable((observer) => {
      this.connect().then(() => {
        if (!this.client?.connected) {
          observer.error('WebSocket未连接');
          return;
        }

        if (this.stompSubscriptions.has(destination)) {
          this.stompSubscriptions.get(destination)?.unsubscribe();
        }

        const subscription = this.client.subscribe(destination, (message: IMessage) => {
          try {
            const data = JSON.parse(message.body);
            observer.next(data);
          } catch (e) {
            observer.next(message.body as T);
          }
        });

        this.stompSubscriptions.set(destination, subscription);

        return () => {
          subscription.unsubscribe();
          this.stompSubscriptions.delete(destination);
        };
      }).catch((error) => {
        observer.error(error);
      });
    });
  }

  /**
   * 取消订阅
   */
  unsubscribe(destination: string): void {
    const subscription = this.stompSubscriptions.get(destination);
    if (subscription) {
      subscription.unsubscribe();
      this.stompSubscriptions.delete(destination);
    }
  }

  /**
   * 加入项目房间
   */
  joinProject(projectId: string): Observable<any> {
    return this.subscribe(`/topic/project/${projectId}`);
  }

  /**
   * 离开项目房间
   */
  leaveProject(projectId: string): void {
    this.unsubscribe(`/topic/project/${projectId}`);
  }

  /**
   * 加入页面房间
   */
  joinPage(pageId: string): Observable<any> {
    return this.subscribe(`/topic/page/${pageId}`);
  }

  /**
   * 离开页面房间
   */
  leavePage(pageId: string): void {
    this.unsubscribe(`/topic/page/${pageId}`);
  }

  /**
   * 订阅个人通知
   */
  subscribeNotifications(): Observable<any> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) {
      return new Observable((observer) => observer.error('用户未登录'));
    }
    return this.subscribe(`/user/queue/notification`);
  }

  /**
   * 发送批注事件
   */
  sendAnnotationEvent(projectId: string, event: any): void {
    this.send('/app/annotation/event', {
      projectId,
      ...event
    });
  }

  /**
   * 发送勘校事件
   */
  sendCollationEvent(pageId: string, event: any): void {
    this.send('/app/collation/event', {
      pageId,
      ...event
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    if (this.client) {
      this.client.deactivate();
      this.client = null;
    }

    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions.clear();
    this.stompSubscriptions.clear();

    this.connectionStatus.set(ConnectionStatus.DISCONNECTED);
    this.isConnected.set(false);
    this.connectPromise = null;
  }

  /**
   * 组件销毁时断开连接
   */
  ngOnDestroy(): void {
    this.disconnect();
  }
}
