import { Injectable } from '@nestjs/common';

interface AuditLogEntry {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: Record<string, any> | null;
  ip: string | null;
  timestamp: Date;
}

interface LogInput {
  action: string;
  userId?: string;
  username?: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
}

interface LogFilter {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class AuditLogService {
  private logs: AuditLogEntry[] = [];

  log(input: LogInput): AuditLogEntry {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      userId: input.userId || null,
      username: input.username || null,
      action: input.action,
      resource: input.resource || null,
      resourceId: input.resourceId || null,
      details: input.details || null,
      ip: input.ip || null,
      timestamp: new Date(),
    };
    this.logs.push(entry);
    return entry;
  }

  query(filter: LogFilter = {}): AuditLogEntry[] {
    return this.logs.filter((entry) => {
      if (filter.userId && entry.userId !== filter.userId) return false;
      if (filter.action && entry.action !== filter.action) return false;
      if (filter.resource && entry.resource !== filter.resource) return false;
      if (filter.startDate && entry.timestamp < filter.startDate) return false;
      if (filter.endDate && entry.timestamp > filter.endDate) return false;
      return true;
    });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}
