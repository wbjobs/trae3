import { Router, type Request, type Response } from 'express';
import { taskService } from '../services/taskScheduler.js';
import type { Task, TaskShard, CreateTaskRequest, TaskStatus } from '../../shared/types.js';

export const getTaskList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, pageSize = 10, status, userId } = req.query;

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const statusFilter = status as TaskStatus | undefined;
    const userIdFilter = userId as string | undefined;

    const { total, items } = await taskService.getTaskList(
      pageNum,
      pageSizeNum,
      { status: statusFilter, userId: userIdFilter }
    );

    let filteredItems = items;
    if (statusFilter) {
      filteredItems = items.filter(task => task.status === statusFilter);
    }

    res.status(200).json({
      success: true,
      data: {
        total: statusFilter ? filteredItems.length : total,
        items: filteredItems,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '获取任务列表成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取任务列表失败',
    });
  }
};

export const createTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const request: CreateTaskRequest = req.body;
    const userId = req.headers['x-user-id'] as string || 'user-1';

    const task: Task = await taskService.createTask(request, userId);

    res.status(201).json({
      success: true,
      data: task,
      message: '任务创建成功',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '任务创建失败',
    });
  }
};

export const getTaskById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await taskService.getTaskById(id);

    if (!task) {
      res.status(404).json({
        success: false,
        error: '任务不存在',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: task,
      message: '获取任务详情成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取任务详情失败',
    });
  }
};

export const cancelTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string || 'user-1';

    const result = await taskService.cancelTask(id, userId);

    if (!result) {
      res.status(400).json({
        success: false,
        error: '任务取消失败，任务可能已完成或不存在',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { cancelled: true },
      message: '任务取消成功',
    });
  } catch (error) {
    res.status(403).json({
      success: false,
      error: error instanceof Error ? error.message : '任务取消失败',
    });
  }
};

export const getTaskShards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const task = await taskService.getTaskById(id);
    if (!task) {
      res.status(404).json({
        success: false,
        error: '任务不存在',
      });
      return;
    }

    const shards: TaskShard[] = await taskService.getTaskShards(id);

    res.status(200).json({
      success: true,
      data: {
        total: shards.length,
        items: shards,
      },
      message: '获取任务分片列表成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取任务分片列表失败',
    });
  }
};

export const getTaskLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { page = 1, pageSize = 50, level } = req.query;

    const task = await taskService.getTaskById(id);
    if (!task) {
      res.status(404).json({
        success: false,
        error: '任务不存在',
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const levelFilter = level as string | undefined;

    const logLevels: Array<'info' | 'warning' | 'error'> = ['info', 'warning', 'error'];
    const logMessages = [
      '任务已创建，等待调度',
      '任务参数验证通过',
      '开始分配计算资源',
      '任务分片已创建',
      '分片已分配到计算节点',
      '开始执行计算',
      '计算进度更新',
      '分片计算完成',
      '结果数据校验中',
      '任务执行完成',
    ];

    const logs: Array<{
      id: string;
      timestamp: string;
      level: 'info' | 'warning' | 'error';
      message: string;
      shardId?: string;
    }> = [];

    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const logLevel = logLevels[Math.floor(Math.random() * logLevels.length)];
      if (levelFilter && logLevel !== levelFilter) continue;

      logs.push({
        id: `log-${id}-${i}`,
        timestamp: new Date(now.getTime() - i * 60000).toISOString(),
        level: logLevel,
        message: logMessages[Math.floor(Math.random() * logMessages.length)],
        shardId: Math.random() > 0.5 ? `shard-${id}-${Math.floor(Math.random() * 8)}` : undefined,
      });
    }

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = logs.length;
    const start = (pageNum - 1) * pageSizeNum;
    const items = logs.slice(start, start + pageSizeNum);

    res.status(200).json({
      success: true,
      data: {
        total,
        items,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '获取任务日志成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取任务日志失败',
    });
  }
};

const router = Router();

router.get('/', getTaskList);
router.post('/', createTask);
router.get('/:id', getTaskById);
router.put('/:id/cancel', cancelTask);
router.get('/:id/shards', getTaskShards);
router.get('/:id/logs', getTaskLogs);

export default router;
