import { Request, Response } from 'express';
import { logService } from '../services/logService';
import { Logger } from '../utils/logger';

const logger = new Logger('LogController');

export class LogController {
  async getLogs(req: Request, res: Response) {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy,
        sortOrder,
        projectId,
        buildId,
        level
      } = req.query;

      const result = await logService.getLogs({
        page: Number(page),
        pageSize: Number(pageSize),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        projectId: projectId as string,
        buildId: buildId as string,
        level: level as string
      });

      res.json(result);
    } catch (error) {
      logger.error('获取日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getLogById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const log = await logService.getById(id);

      if (!log) {
        return res.status(404).json({ error: '日志不存在' });
      }

      res.json(log);
    } catch (error) {
      logger.error('获取日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async addLog(req: Request, res: Response) {
    try {
      const { level, source, message, projectId, buildId, metadata } = req.body;

      if (!level || !source || !message) {
        return res.status(400).json({ error: '缺少必要参数: level, source, message' });
      }

      const log = await logService.addLog(
        level,
        source,
        message,
        projectId,
        buildId,
        metadata
      );

      res.json(log);
    } catch (error) {
      logger.error('添加日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async uploadBuildLog(req: Request, res: Response) {
    try {
      const { buildId, projectId, content } = req.body;

      if (!buildId || !content) {
        return res.status(400).json({ error: '缺少必要参数: buildId, content' });
      }

      const buildLog = await logService.saveBuildLog(
        buildId,
        projectId || '',
        content
      );

      res.json({
        success: true,
        data: buildLog,
        message: '编译日志已保存'
      });
    } catch (error) {
      logger.error('保存编译日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getBuildLog(req: Request, res: Response) {
    try {
      const { buildId } = req.params;
      const content = await logService.getBuildLog(buildId);

      if (!content) {
        return res.status(404).json({ error: '编译日志不存在' });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(content);
    } catch (error) {
      logger.error('获取编译日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async deleteLogs(req: Request, res: Response) {
    try {
      const { olderThan, projectId } = req.query;

      if (!olderThan && !projectId) {
        return res.status(400).json({ error: '至少需要一个参数: olderThan 或 projectId' });
      }

      const result = await logService.deleteLogs({
        olderThan: olderThan ? Number(olderThan) : undefined,
        projectId: projectId as string
      });

      res.json({
        success: true,
        ...result,
        message: `已删除 ${result.deleted} 条日志`
      });
    } catch (error) {
      logger.error('删除日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async exportLogs(req: Request, res: Response) {
    try {
      const { projectId, buildId, level, startDate, endDate } = req.query;

      const exportPath = await logService.exportLogs({
        projectId: projectId as string,
        buildId: buildId as string,
        level: level as string,
        startDate: startDate ? Number(startDate) : undefined,
        endDate: endDate ? Number(endDate) : undefined
      });

      const filename = exportPath.split('/').pop() || 'logs.csv';
      res.download(exportPath, filename, (err) => {
        if (err) {
          logger.error('导出日志失败', err as Error);
          res.status(500).json({ error: '导出失败' });
        }
      });
    } catch (error) {
      logger.error('导出日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getLogStats(_req: Request, res: Response) {
    try {
      const stats = await logService.getLogStats();
      res.json(stats);
    } catch (error) {
      logger.error('获取日志统计失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getProjectLogs(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { limit = 100 } = req.query;

      const logs = await logService.getProjectLogs(projectId, Number(limit));
      res.json(logs);
    } catch (error) {
      logger.error('获取工程日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getBuildLogs(req: Request, res: Response) {
    try {
      const { buildId } = req.params;
      const { limit = 100 } = req.query;

      const logs = await logService.getBuildLogs(buildId, Number(limit));
      res.json(logs);
    } catch (error) {
      logger.error('获取编译日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async clearOldLogs(req: Request, res: Response) {
    try {
      const { days = 30 } = req.body;

      const result = await logService.clearOldLogs(Number(days));

      res.json({
        success: true,
        ...result,
        message: `已清理 ${days} 天前的日志，共删除 ${result.deleted} 条`
      });
    } catch (error) {
      logger.error('清理旧日志失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export const logController = new LogController();
