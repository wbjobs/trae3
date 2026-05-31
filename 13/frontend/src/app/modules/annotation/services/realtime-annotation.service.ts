// 批注实时协作服务 - WebSocket实时通信

import { Injectable, inject, OnDestroy, signal } from '@angular/core';
import { Observable, Subject, filter, share, takeUntil, tap, debounceTime, bufferTime } from 'rxjs';
import { WebSocketService } from '@core/services/websocket.service';
import { AuthService } from '@core/services/auth.service';
import {
  Annotation,
  AnnotationReply,
  AnnotationNotification,
  RealtimeAnnotationEvent,
  RealtimeAnnotationEventType,
  UserTypingEventData
} from '@core/models/annotation.model';

interface QueuedEvent {
  type: string;
  data: any;
  timestamp: number;
}

@Injectable({ providedIn: 'root' })
export class RealtimeAnnotationService implements OnDestroy {
  private webSocketService = inject(WebSocketService);
  private authService = inject(AuthService);

  private destroy$ = new Subject<void>();

  private currentProjectId = signal<number | null>(null);
  private currentPageId = signal<number | null>(null);

  private annotationCreated$ = new Subject<Annotation>();
  private annotationUpdated$ = new Subject<Annotation>();
  private annotationDeleted$ = new Subject<string>();
  private replyCreated$ = new Subject<{ annotationId: string; reply: AnnotationReply }>();
  private replyUpdated$ = new Subject<{ annotationId: string; reply: AnnotationReply }>();
  private replyDeleted$ = new Subject<{ annotationId: string; replyId: string }>();
  private notification$ = new Subject<AnnotationNotification>();
  private userTyping$ = new Subject<{ userId: string; annotationId?: string; isTyping: boolean }>();

  private eventQueue$ = new Subject<QueuedEvent>();
  private readonly DEBOUNCE_MS = 50;

  onlineUsers = signal<string[]>([]);

  get connectionStatus() {
    return this.webSocketService.connectionStatus;
  }

  get isConnected() {
    return this.webSocketService.isConnected;
  }

  constructor() {
    this.setupEventBatching();
  }

  private setupEventBatching(): void {
    this.eventQueue$.pipe(
      bufferTime(this.DEBOUNCE_MS),
      takeUntil(this.destroy$)
    ).subscribe((events) => {
      this.processBatchedEvents(events);
    });
  }

  private processBatchedEvents(events: QueuedEvent[]): void {
    if (events.length === 0) return;

    const eventMap = new Map<string, QueuedEvent>();

    for (const event of events) {
      const dedupKey = this.generateDedupKey(event);
      const existing = eventMap.get(dedupKey);
      if (!existing || event.timestamp > existing.timestamp) {
        eventMap.set(dedupKey, event);
      }
    }

    for (const event of eventMap.values()) {
      this.dispatchEvent(event);
    }

    if (events.length > 1) {
      console.debug(`合并了 ${events.length} 个事件为 ${eventMap.size} 个`);
    }
  }

  private generateDedupKey(event: QueuedEvent): string {
    let key = event.type;
    if (event.data && typeof event.data === 'object') {
      if ('id' in event.data) {
        key += ':' + event.data.id;
      }
      if ('annotationId' in event.data) {
        key += ':' + event.data.annotationId;
      }
      if ('annotationId' in event.data) {
        key += ':' + event.data.annotationId;
      }
      if ('replyId' in event.data) {
        key += ':' + event.data.replyId;
      }
      if ('isTyping' in event.data) {
        key += ':' + event.data.isTyping;
      }
    }
    return key;
  }

  private dispatchEvent(event: QueuedEvent): void {
    switch (event.type) {
      case 'ANNOTATION_CREATED':
        this.annotationCreated$.next(event.data as Annotation);
        break;
      case 'ANNOTATION_UPDATED':
        this.annotationUpdated$.next(event.data as Annotation);
        break;
      case 'ANNOTATION_DELETED':
        this.annotationDeleted$.next(event.data as string);
        break;
      case 'REPLY_CREATED':
        this.replyCreated$.next(event.data as { annotationId: string; reply: AnnotationReply });
        break;
      case 'REPLY_UPDATED':
        this.replyUpdated$.next(event.data as { annotationId: string; reply: AnnotationReply });
        break;
      case 'REPLY_DELETED':
        this.replyDeleted$.next(event.data as { annotationId: string; replyId: string });
        break;
    }
  }

  connect(): void {
    this.webSocketService.connect();
  }

  disconnect(): void {
    this.leaveAllRooms();
    this.webSocketService.disconnect();
  }

  joinProject(projectId: number): void {
    if (this.currentProjectId() === projectId) {
      return;
    }

    this.leaveProject();
    this.currentProjectId.set(projectId);

    this.webSocketService.joinProject(projectId.toString()).pipe(
      takeUntil(this.destroy$)
    ).subscribe((message: any) => {
      this.handleProjectMessage(message);
    });
  }

  leaveProject(): void {
    const projectId = this.currentProjectId();
    if (projectId) {
      this.webSocketService.leaveProject(projectId.toString());
      this.currentProjectId.set(null);
    }
  }

  joinPage(pageId: number): void {
    if (this.currentPageId() === pageId) {
      return;
    }

    this.leavePage();
    this.currentPageId.set(pageId);

    this.webSocketService.joinPage(pageId.toString()).pipe(
      takeUntil(this.destroy$)
    ).subscribe((message: any) => {
      this.handlePageMessage(message);
    });
  }

  leavePage(): void {
    const pageId = this.currentPageId();
    if (pageId) {
      this.webSocketService.leavePage(pageId.toString());
      this.currentPageId.set(null);
    }
  }

  leaveAllRooms(): void {
    this.leaveProject();
    this.leavePage();
  }

  private handleProjectMessage(message: any): void {
    if (!message) return;

    const messageType = message.type || message.typeName;

    if (messageType === '新批注' || message.type === 1) {
      this.notification$.next(message as AnnotationNotification);
    } else if (messageType === '批注回复' || message.type === 2) {
      this.notification$.next(message as AnnotationNotification);
    } else if (message.type === 'ANNOTATION_CREATED') {
      this.queueEvent('ANNOTATION_CREATED', message.data);
    } else if (message.type === 'ANNOTATION_UPDATED') {
      this.queueEvent('ANNOTATION_UPDATED', message.data);
    } else if (message.type === 'ANNOTATION_DELETED') {
      this.queueEvent('ANNOTATION_DELETED', message.data);
    } else if (message.type === 'REPLY_CREATED') {
      this.queueEvent('REPLY_CREATED', message.data);
    } else if (message.type === 'REPLY_UPDATED') {
      this.queueEvent('REPLY_UPDATED', message.data);
    } else if (message.type === 'REPLY_DELETED') {
      this.queueEvent('REPLY_DELETED', message.data);
    }
  }

  private handlePageMessage(message: any): void {
    if (!message) return;

    const data = message.data || message;

    if (message.eventType === 'typing') {
      this.userTyping$.next({
        userId: message.userId,
        annotationId: message.annotationId,
        isTyping: message.isTyping
      });
    }
  }

  private queueEvent(type: string, data: any): void {
    this.eventQueue$.next({
      type,
      data,
      timestamp: Date.now()
    });
  }

  sendAnnotationCreated(annotation: Annotation): void {
    this.webSocketService.sendAnnotationEvent(String(annotation.projectId), {
      type: 'ANNOTATION_CREATED',
      data: annotation,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendAnnotationUpdated(annotation: Annotation): void {
    this.queueEvent('ANNOTATION_UPDATED', annotation);
    this.webSocketService.sendAnnotationEvent(String(annotation.projectId), {
      type: 'ANNOTATION_UPDATED',
      data: annotation,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendAnnotationDeleted(annotationId: string, projectId: number, pageId: number): void {
    this.queueEvent('ANNOTATION_DELETED', annotationId);
    this.webSocketService.sendAnnotationEvent(String(projectId), {
      type: 'ANNOTATION_DELETED',
      data: annotationId,
      pageId,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendReplyCreated(
    annotationId: string,
    reply: AnnotationReply,
    projectId: number,
    pageId: number
  ): void {
    const data = { annotationId, reply };
    this.queueEvent('REPLY_CREATED', data);
    this.webSocketService.sendAnnotationEvent(String(projectId), {
      type: 'REPLY_CREATED',
      data,
      pageId,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendReplyUpdated(
    annotationId: string,
    reply: AnnotationReply,
    projectId: number,
    pageId: number
  ): void {
    const data = { annotationId, reply };
    this.queueEvent('REPLY_UPDATED', data);
    this.webSocketService.sendAnnotationEvent(String(projectId), {
      type: 'REPLY_UPDATED',
      data,
      pageId,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendReplyDeleted(
    annotationId: string,
    replyId: string,
    projectId: number,
    pageId: number
  ): void {
    const data = { annotationId, replyId };
    this.queueEvent('REPLY_DELETED', data);
    this.webSocketService.sendAnnotationEvent(String(projectId), {
      type: 'REPLY_DELETED',
      data,
      pageId,
      senderId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  sendTyping(annotationId: string | undefined, isTyping: boolean): void {
    const projectId = this.currentProjectId();
    const pageId = this.currentPageId();

    if (!projectId || !pageId) {
      return;
    }

    this.webSocketService.sendCollationEvent(String(pageId), {
      eventType: 'typing',
      annotationId,
      isTyping,
      userId: this.authService.currentUser()?.id,
      timestamp: Date.now()
    });
  }

  onAnnotationCreated(): Observable<Annotation> {
    return this.annotationCreated$.asObservable().pipe(share());
  }

  onAnnotationUpdated(): Observable<Annotation> {
    return this.annotationUpdated$.asObservable().pipe(share());
  }

  onAnnotationDeleted(): Observable<string> {
    return this.annotationDeleted$.asObservable().pipe(share());
  }

  onReplyCreated(): Observable<{ annotationId: string; reply: AnnotationReply }> {
    return this.replyCreated$.asObservable().pipe(share());
  }

  onReplyUpdated(): Observable<{ annotationId: string; reply: AnnotationReply }> {
    return this.replyUpdated$.asObservable().pipe(share());
  }

  onReplyDeleted(): Observable<{ annotationId: string; replyId: string }> {
    return this.replyDeleted$.asObservable().pipe(share());
  }

  onNotification(): Observable<AnnotationNotification> {
    return this.notification$.asObservable().pipe(share());
  }

  onUserTyping(annotationId?: string): Observable<{ userId: string; annotationId?: string; isTyping: boolean }> {
    return this.userTyping$.asObservable().pipe(
      filter((event) => !annotationId || event.annotationId === annotationId),
      share()
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.leaveAllRooms();

    this.annotationCreated$.complete();
    this.annotationUpdated$.complete();
    this.annotationDeleted$.complete();
    this.replyCreated$.complete();
    this.replyUpdated$.complete();
    this.replyDeleted$.complete();
    this.notification$.complete();
    this.userTyping$.complete();
    this.eventQueue$.complete();
  }
}
