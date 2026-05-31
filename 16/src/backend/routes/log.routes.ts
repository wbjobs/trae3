import { Router, Request, Response } from 'express';
import { serviceContainer } from '../services/ServiceContainer';
import { createModuleLogger } from '../../shared/modules/logger';
import { LogLevel } from '@shared/types';

const logger = createModuleLogger('LogRoutes');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      level,
      module,
      action,
      startTime,
      endTime,
      keyword
    } = req.query;

    const result = await serviceContainer.logService.getLogs({
      page: Number(page),
      pageSize: Number(pageSize),
      level: level as LogLevel | undefined,
      module: module as string | undefined,
      action: action as string | undefined,
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
      keyword: keyword as string | undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_logs', '获取日志列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const log = await serviceContainer.logService.getLogById(req.params.id);
    if (!log) {
      res.json({ success: false, error: '日志不存在' });
      return;
    }
    res.json({ success: true, data: log });
  } catch (error) {
    logger.error('get_log', '获取日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/level/:level', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 50 } = req.query;
    const result = await serviceContainer.logService.getLogsByLevel(
      req.params.level as LogLevel,
      { page: Number(page), pageSize: Number(pageSize) }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_logs_by_level', '按级别获取日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/module/:module', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 50 } = req.query;
    const result = await serviceContainer.logService.getLogsByModule(
      req.params.module,
      { page: Number(page), pageSize: Number(pageSize) }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_logs_by_module', '按模块获取日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const { days = 7 } = req.query;
    const stats = await serviceContainer.logService.getLogStats(Number(days));
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('get_log_stats', '获取日志统计失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/clean', async (req: Request, res: Response) => {
  try {
    const { beforeDays } = req.body;
    const beforeDate = new Date();
    beforeDate.setDate(beforeDate.getDate() - Number(beforeDays || 30));

    const count = await serviceContainer.logService.deleteLogsBefore(beforeDate);
    res.json({ success: true, data: { deletedCount: count }, message: `删除了 ${count} 条日志` });
  } catch (error) {
    logger.error('clean_logs', '清理日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/all', async (_req: Request, res: Response) => {
  try {
    const count = await serviceContainer.logService.clearAllLogs();
    res.json({ success: true, data: { deletedCount: count }, message: '已清空所有日志' });
  } catch (error) {
    logger.error('clear_all_logs', '清空日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/export', async (req: Request, res: Response) => {
  try {
    const { level, module, startTime, endTime, keyword } = req.query;

    const logs = await serviceContainer.logService.exportLogs({
      page: 1,
      pageSize: 10000,
      level: level as LogLevel | undefined,
      module: module as string | undefined,
      startTime: startTime ? new Date(startTime as string) : undefined,
      endTime: endTime ? new Date(endTime as string) : undefined,
      keyword: keyword as string | undefined
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="logs-${Date.now()}.json"`);
    res.json({ success: true, data: logs });
  } catch (error) {
    logger.error('export_logs', '导出日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { level, module, action, message, details } = req.body;
    const log = await serviceContainer.logService.createLog({
      level,
      module,
      action,
      message,
      details
    });
    res.json({ success: true, data: log });
  } catch (error) {
    logger.error('create_log', '创建日志失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
