import { Inject, NestInterceptor, ExecutionContext, CallHandler, Injectable } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from './audit-log.service';

export const AuditLog = (action: string) => {
  @Injectable()
  class AuditLogInterceptor implements NestInterceptor {
    constructor(@Inject(AuditLogService) private readonly auditLogService: AuditLogService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      return next.handle().pipe(
        tap(() => {
          this.auditLogService.log({
            action,
            userId: user?.id,
            username: user?.username,
            resource: request.route?.path || request.url,
            resourceId: request.params?.id,
            ip: request.ip,
          });
        }),
      );
    }
  }

  return AuditLogInterceptor;
};
