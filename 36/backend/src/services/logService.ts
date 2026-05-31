import * as fs from 'fs';
import * as path from 'path';
import { getDataSource } from '../database';
import { LogEntry, BuildLog } from '../entities/LogEntry';
import { Logger } from '../utils/logger';
import { generateId } from '@shared/utils';
import type { PaginationParams, PaginatedResponse } from '@shared/types';
import { config } from '../config';

const logger = new Logger('LogService');

export class LogService {
  async getLogs(
    params: PaginationParams & {
      projectId?: string;
      buildId?: string;
      level?: string;
    }
  ): Promise<PaginatedResponse<LogEntry>> {
    const repo = getDataSource().getRepository(LogEntry);
    const queryBuilder = repo.createQueryBuilder('log');

    if (params.projectId) {
      queryBuilder.andWhere('log.projectId = :projectId', { projectId: params.projectId });
    }

    if (params.buildId) {
      queryBuilder.andWhere('log.buildId = :buildId', { buildId: params.buildId });
    }

    if (params.level) {
      queryBuilder.andWhere('log.level = :level', { level: params.level });
    }

    if (params.sortBy) {
      const order = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
      queryBuilder.orderBy(`log.${params.sortBy}`, order);
    } else {
      queryBuilder.orderBy('log.timestamp', 'DESC');
    }

    const total = await queryBuilder.getCount();
    const items = await queryBuilder
      .skip((params.page - 1) * params.pageSize)
      .take(params.pageSize)
      .getMany();

    return {
      items,
      total,
      page: params.page,
      pageSize: params.pageSize,
      totalPages: Math.ceil(total / params.pageSize)
    };
  }

  async getById(id: string): Promise<LogEntry | null> {
    const repo = getDataSource().getRepository(LogEntry);
    return repo.findOneBy({ id });
  }

  async addLog(
    level: LogEntry['level'],
    source: string,
    message: string,
    projectId?: string,
    buildId?: string,
    metadata?: Record<string, unknown>
  ): Promise<LogEntry> {
    const entry = new LogEntry();
    entry.id = generateId();
    entry.timestamp = Date.now();
    entry.level = level;
    entry.source = source;
    entry.message = message;
    entry.projectId = projectId || null;
    entry.buildId = buildId || null;
    entry.metadata = metadata || null;

    const repo = getDataSource().getRepository(LogEntry);
    const saved = await repo.save(entry);

    logger.info(`日志记录: ${level} - ${source} - ${message.substring(0, 50)}...`);
    return saved;
  }

  async saveBuildLog(
    buildId: string,
    projectId: string,
    content: string
  ): Promise<BuildLog> {
    const buildLog = new BuildLog();
    buildLog.buildId = buildId;
    buildLog.projectId = projectId;
    buildLog.content = content;
    buildLog.createdAt = Date.now();

    const repo = getDataSource().getRepository(BuildLog);
    const saved = await repo.save(buildLog);

    logger.info(`编译日志已保存: ${buildId}`);
    return saved;
  }

  async getBuildLog(buildId: string): Promise<string | null> {
    const repo = getDataSource().getRepository(BuildLog);
    const buildLog = await repo.findOneBy({ buildId });
    return buildLog ? buildLog.content : null;
  }

  async deleteLogs(params: { olderThan?: number; projectId?: string }): Promise<{ deleted: number }> {
    const logRepo = getDataSource().getRepository(LogEntry);
    const buildLogRepo = getDataSource().getRepository(BuildLog);

    let deletedCount = 0;

    if (params.olderThan) {
      const logResult = await logRepo
        .createQueryBuilder()
        .delete()
        .where('timestamp < :olderThan', { olderThan: params.olderThan })
        .execute();
      deletedCount += logResult.affected || 0;

      const buildLogResult = await buildLogRepo
        .createQueryBuilder()
        .delete()
        .where('createdAt < :olderThan', { olderThan: params.olderThan })
        .execute();
      deletedCount += buildLogResult.affected || 0;
    }

    if (params.projectId) {
      const logResult = await logRepo
        .createQueryBuilder()
        .delete()
        .where('projectId = :projectId', { projectId: params.projectId })
        .execute();
      deletedCount += logResult.affected || 0;

      const buildLogResult = await buildLogRepo
        .createQueryBuilder()
        .delete()
        .where('projectId = :projectId', { projectId: params.projectId })
        .execute();
      deletedCount += buildLogResult.affected || 0;
    }

    logger.info(`已删除 ${deletedCount} 条日志记录`);
    return { deleted: deletedCount };
  }

  async exportLogs(
    params: { projectId?: string; buildId?: string; level?: string; startDate?: number; endDate?: number }
  ): Promise<string> {
    const repo = getDataSource().getRepository(LogEntry);
    const queryBuilder = repo.createQueryBuilder('log');

    if (params.projectId) {
      queryBuilder.andWhere('log.projectId = :projectId', { projectId: params.projectId });
    }

    if (params.buildId) {
      queryBuilder.andWhere('log.buildId = :buildId', { buildId: params.buildId });
    }

    if (params.level) {
      queryBuilder.andWhere('log.level = :level', { level: params.level });
    }

    if (params.startDate) {
      queryBuilder.andWhere('log.timestamp >= :startDate', { startDate: params.startDate });
    }

    if (params.endDate) {
      queryBuilder.andWhere('log.timestamp <= :endDate', { endDate: params.endDate });
    }

    const logs = await queryBuilder.orderBy('log.timestamp', 'ASC').getMany();

    const csvContent = this.formatLogsAsCSV(logs);
    const exportPath = path.join(config.storagePath, 'exports', `logs_${Date.now()}.csv`);

    const exportDir = path.dirname(exportPath);
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    fs.writeFileSync(exportPath, csvContent, 'utf-8');
    logger.info(`日志已导出: ${exportPath}`);

    return exportPath;
  }

  private formatLogsAsCSV(logs: LogEntry[]): string {
    const headers = ['时间', '级别', '来源', '工程ID', '编译ID', '消息', '元数据'];
    const rows = logs.map(log => [
      new Date(log.timestamp).toISOString(),
      log.level,
      log.source,
      log.projectId || '',
      log.buildId || '',
      `"${log.message.replace(/"/g, '""')}"`,
      log.metadata ? JSON.stringify(log.metadata) : ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  async getLogStats() {
    const repo = getDataSource().getRepository(LogEntry);

    const total = await repo.count();

    const errorCount = await repo.count({ where: { level: 'error' } });
    const warningCount = await repo.count({ where: { level: 'warn' } });
    const infoCount = await repo.count({ where: { level: 'info' } });
    const debugCount = await repo.count({ where: { level: 'debug' } });

    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = await repo
      .createQueryBuilder()
      .where('timestamp > :last24h', { last24h })
      .getCount();

    return {
      total,
      byLevel: {
        error: errorCount,
        warning: warningCount,
        info: infoCount,
        debug: debugCount
      },
      recent24h: recentCount
    };
  }

  async getProjectLogs(projectId: string, limit: number = 100): Promise<LogEntry[]> {
    const repo = getDataSource().getRepository(LogEntry);
    return repo.find({
      where: { projectId },
      order: { timestamp: 'DESC' },
      take: limit
    });
  }

  async getBuildLogs(buildId: string, limit: number = 100): Promise<LogEntry[]> {
    const repo = getDataSource().getRepository(LogEntry);
    return repo.find({
      where: { buildId },
      order: { timestamp: 'DESC' },
      take: limit
    });
  }

  async clearOldLogs(days: number = 30): Promise<{ deleted: number }> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return this.deleteLogs({ olderThan: cutoff });
  }
}

export const logService = new LogService();
