import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

export interface IEvent<T = any> {
  type: string;
  payload: T;
  timestamp: Date;
  source?: string;
  correlationId?: string;
}

export type EventHandler<T = any> = (event: IEvent<T>) => void | Promise<void>;

@Injectable()
export class EventBus {
  private readonly eventSubject = new Subject<IEvent>();
  private readonly handlers = new Map<string, Set<EventHandler>>();

  publish<T = any>(
    type: string,
    payload: T,
    options?: { source?: string; correlationId?: string },
  ): void {
    const event: IEvent<T> = {
      type,
      payload,
      timestamp: new Date(),
      ...options,
    };
    this.eventSubject.next(event);
    this.dispatch(event);
  }

  subscribe<T = any>(type: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
    return () => {
      this.handlers.get(type)?.delete(handler as EventHandler);
    };
  }

  on<T = any>(type: string): Observable<IEvent<T>> {
    return this.eventSubject.asObservable().pipe(
      filter((event) => event.type === type),
      map((event) => event as IEvent<T>),
    );
  }

  async request<TResult = any, TPayload = any>(
    type: string,
    payload: TPayload,
    timeoutMs = 30000,
  ): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const responseType = `${type}:response:${correlationId}`;

      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Event request timeout after ${timeoutMs}ms: ${type}`));
      }, timeoutMs);

      const unsubscribe = this.subscribe(responseType, (event) => {
        clearTimeout(timeout);
        unsubscribe();
        if (event.payload.error) {
          reject(new Error(event.payload.error));
        } else {
          resolve(event.payload.result as TResult);
        }
      });

      this.publish(type, payload, { correlationId });
    });
  }

  private dispatch(event: IEvent): void {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) {
            result.catch((err) =>
              console.error(`Error in event handler for ${event.type}:`, err),
            );
          }
        } catch (err) {
          console.error(`Error in event handler for ${event.type}:`, err);
        }
      }
    }
  }
}

export const EventTypes = {
  FILE_UPLOADED: 'file:uploaded',
  FILE_PARSED: 'file:parsed',
  FILE_DESENSITIZED: 'file:desensitized',
  FILE_EMBEDDED: 'file:embedded',
  FILE_DELETED: 'file:deleted',
  DESENSITIZE_REQUEST: 'desensitize:request',
  EMBED_REQUEST: 'embed:request',
  QA_QUESTION: 'qa:question',
  QA_ANSWERED: 'qa:answered',
  AUDIT_LOG: 'audit:log',
  ERROR: 'system:error',
} as const;
