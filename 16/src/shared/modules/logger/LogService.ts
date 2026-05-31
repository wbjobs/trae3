import { v4 as uuidv4 } from 'uuid';
import { createModuleLogger } from './index';
import { LogEntry, LogLevel, PaginatedResponse, PaginationParams } from '@shared/types';
import { LogEntity } from '@backend/database/entities/Log.entity';
import { Repository, LessThan, MoreThan, Between } from 'typeorm';

const logger = createModuleLogger('LogService');

export interface LogQueryParams extends PaginationParams {
  level?: LogLevel;
  module?: string;
  action?: string;
  startTime?: Date;
  endTime?: Date;
  keyword?: string;
}

export class LogService {
  private repository: Repository<LogEntity> | null = null;

  constructor() {
    logger.info('init', '日志服务初始化完成');
  }

  setRepository(repository: Repository<LogEntity>): void {
    this.repository = repository;
  }

  private getRepository(): Repository<LogEntity> {
    if (!this.repository) {
      throw new Error('日志数据库仓库未初始化');
    }
    return this.repository;
  }

  private entityToLog(entity: LogEntity): LogEntry {
    return {
      id: entity.id,
      level: entity.level,
      module: entity.module,
      action: entity.action,
      message: entity.message,
      details: entity.details,
      createdAt: entity.createdAt
    };
  }

  async createLog(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry> {
    const repo = this.getRepository();

    const log: LogEntry = {
      ...entry,
      id: uuidv4(),
      createdAt: new Date()
    };

    const entity = repo.create(log);
    await repo.save(entity);

    return this.entityToLog(entity);
  }

  async getLogs(params: LogQueryParams = { page: 1, pageSize: 50 }): Promise<PaginatedResponse<LogEntry>> {
    const repo = this.getRepository();
    const queryBuilder = repo.createQueryBuilder('log');

    if (params.level) {
      queryBuilder.andWhere('log.level = :level', { level: params.level });
    }

    if (params.module) {
      queryBuilder.andWhere('log.module = :module', { module: params.module });
    }

    if (params.action) {
      queryBuilder.andWhere('log.action = :action', { action: params.action });
    }

    if (params.startTime && params.endTime) {
      queryBuilder.andWhere('log.createdAt BETWEEN :start AND :end', {
        start: params.startTime,
        end: params.endTime
      });
    } else if (params.startTime) {
      queryBuilder.andWhere('log.createdAt > :start', { start: params.startTime });
    } else if (params.endTime) {
      queryBuilder.andWhere('log.createdAt < :end', { end: params.endTime });
    }

    if (params.keyword) {
      queryBuilder.andWhere('(log.message LIKE :keyword OR log.details LIKE :keyword)', {
        keyword: `%${params.keyword}%`
      });
    }

    const [entities, total] = await queryBuilder
      .orderBy('log.createdAt', 'DESC')
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getManyAndCount();

    return {
      items: entities.map(e => this.entityToLog(e)),
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getLogsByLevel(level: LogLevel, params: PaginationParams = { page: 1, pageSize: 50 }): Promise<PaginatedResponse<LogEntry>> {
    return this.getLogs({ ...params, level });
  }

  async getLogsByModule(module: string, params: PaginationParams = { page: 1, pageSize: 50 }): Promise<PaginatedResponse<LogEntry>> {
    return this.getLogs({ ...params, module });
  }

  async getLogById(id: string): Promise<LogEntry | null> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { id } });
    return entity ? this.entityToLog(entity) : null;
  }

  async deleteLogsBefore(date: Date): Promise<number> {
    const repo = this.getRepository();
    const result = await repo.delete({ createdAt: LessThan(date) });
    logger.info('delete_old_logs', '删除旧日志完成', { count: result.affected || 0, before: date });
    return result.affected || 0;
  }

  async getLogStats(days: number = 7): Promise<{
    total: number;
    byLevel: Record<LogLevel, number>;
    byModule: Record<string, number>;
    daily: { date: string; count: number }[];
  }> {
    const repo = this.getRepository();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const queryBuilder = repo.createQueryBuilder('log')
      .where('log.createdAt > :start', { start: startDate });

    const total = await queryBuilder.getCount();

    const byLevelRaw = await repo
      .createQueryBuilder('log')
      .select('log.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt > :start', { start: startDate })
      .groupBy('log.level')
      .getRawMany();

    const byLevel: Record<string, number> = {};
    for (const level of Object.values(LogLevel)) {
      byLevel[level] = 0;
    }
    for (const item of byLevelRaw) {
      byLevel[item.level] = Number(item.count);
    }

    const byModuleRaw = await repo
      .createQueryBuilder('log')
      .select('log.module', 'module')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt > :start', { start: startDate })
      .groupBy('log.module')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    const byModule: Record<string, number> = {};
    for (const item of byModuleRaw) {
      byModule[item.module] = Number(item.count);
    }

    const dailyRaw = await repo
      .createQueryBuilder('log')
      .select("DATE(log.createdAt)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt > :start', { start: startDate })
      .groupBy("DATE(log.createdAt)")
      .orderBy('date', 'ASC')
      .getRawMany();

    const daily: { date: string; count: number }[] = dailyRaw.map(item => ({
      date: item.date,
      count: Number(item.count)
    }));

    return {
      total,
      byLevel: byLevel as Record<LogLevel, number>,
      byModule,
      daily
    };
  }

  async clearAllLogs(): Promise<number> {
    const repo = this.getRepository();
    const result = await repo.delete({});
    logger.info('clear_all_logs', '清空所有日志完成', { count: result.affected || 0 });
    return result.affected || 0;
  }

  async exportLogs(params: LogQueryParams): Promise<LogEntry[]> {
    const allParams: LogQueryParams = { ...params, page: 1, pageSize: 10000 };
    const result = await this.getLogs(allParams);
    return result.items;
  }
}

export const createLogService = (): LogService => {
  return new LogService();
};

export default LogService;
