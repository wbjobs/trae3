import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

export const TIMEOUT_KEY = 'route_timeout';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  private readonly defaultTimeout = parseInt(process.env.API_TIMEOUT_MS || '120000');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const routeTimeout = this.reflector.get<number>(TIMEOUT_KEY, context.getHandler());
    const timeoutMs = routeTimeout ?? this.defaultTimeout;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException(`Request timeout after ${timeoutMs}ms`),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}

export function SetTimeout(ms: number): MethodDecorator {
  return (target: any, key: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(TIMEOUT_KEY, ms, descriptor.value);
    return descriptor;
  };
}
