import { Router, Request, Response } from 'express';
import { serviceContainer } from '../services/ServiceContainer';
import { createModuleLogger } from '../../shared/modules/logger';
import { TaskStatus } from '@shared/types';

const logger = createModuleLogger('TaskRoutes');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, status } = req.query;
    const result = await serviceContainer.taskManager.getTaskList({
      page: Number(page),
      pageSize: Number(pageSize),
      status: status as TaskStatus | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_tasks', '获取任务列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/running', async (_req: Request, res: Response) => {
  try {
    const tasks = serviceContainer.taskManager.getRunningTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('get_running_tasks', '获取运行中任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/queued', async (_req: Request, res: Response) => {
  try {
    const tasks = serviceContainer.taskManager.getQueuedTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    logger.error('get_queued_tasks', '获取排队任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const task = await serviceContainer.taskManager.getTaskById(req.params.id);
    if (!task) {
      res.json({ success: false, error: '任务不存在' });
      return;
    }
    res.json({ success: true, data: task });
  } catch (error) {
    logger.error('get_task', '获取任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/progress', async (req: Request, res: Response) => {
  try {
    const progress = await serviceContainer.taskManager.getTaskProgress(req.params.id);
    res.json({ success: true, data: progress });
  } catch (error) {
    logger.error('get_task_progress', '获取任务进度失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/progress/:terminalId', async (req: Request, res: Response) => {
  try {
    const progress = await serviceContainer.taskManager.getTerminalProgress(
      req.params.id,
      req.params.terminalId
    );
    if (!progress) {
      res.json({ success: false, error: '进度不存在' });
      return;
    }
    res.json({ success: true, data: progress });
  } catch (error) {
    logger.error('get_terminal_progress', '获取终端进度失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, firmwareId, terminalIds } = req.body;
    const task = await serviceContainer.taskManager.createTask({
      name,
      firmwareId,
      terminalIds
    });
    res.json({ success: true, data: task, message: '任务创建成功' });
  } catch (error) {
    logger.error('create_task', '创建任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    const { firmware, terminals } = req.body;
    const result = await serviceContainer.taskManager.startTask(req.params.id, firmware, terminals);
    if (!result) {
      res.json({ success: false, error: '任务启动失败，可能已加入队列' });
      return;
    }
    res.json({ success: true, message: '任务启动成功' });
  } catch (error) {
    logger.error('start_task', '启动任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.taskManager.cancelTask(req.params.id);
    if (!result) {
      res.json({ success: false, error: '任务取消失败' });
      return;
    }
    res.json({ success: true, message: '任务已取消' });
  } catch (error) {
    logger.error('cancel_task', '取消任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.taskManager.deleteTask(req.params.id);
    if (!result) {
      res.json({ success: false, error: '任务不存在或正在运行' });
      return;
    }
    res.json({ success: true, message: '任务删除成功' });
  } catch (error) {
    logger.error('delete_task', '删除任务失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/settings/concurrent', async (_req: Request, res: Response) => {
  try {
    const max = serviceContainer.taskManager.getMaxConcurrentTasks();
    res.json({ success: true, data: { maxConcurrentTasks: max } });
  } catch (error) {
    logger.error('get_concurrent_settings', '获取并发设置失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.put('/settings/concurrent', async (req: Request, res: Response) => {
  try {
    const { max } = req.body;
    serviceContainer.taskManager.setMaxConcurrentTasks(Number(max));
    res.json({ success: true, message: '并发设置已更新' });
  } catch (error) {
    logger.error('set_concurrent_settings', '更新并发设置失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
