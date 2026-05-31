import { Router, type Request, type Response } from 'express';
import { nodeMonitorService } from '../services/nodeMonitor.js';
import { taskService } from '../services/taskScheduler.js';
import { generateMockDashboardStats } from '../services/mockData.js';
import type { DashboardStats, Task, Node } from '../../shared/types.js';

export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { items: nodes } = await nodeMonitorService.getNodeList(1, 1000);
    const { items: tasks } = await taskService.getTaskList(1, 1000);

    const stats: DashboardStats = generateMockDashboardStats(nodes as Node[], tasks as Task[]);

    res.status(200).json({
      success: true,
      data: stats,
      message: '获取仪表盘统计数据成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取仪表盘统计数据失败',
    });
  }
};

export const getAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, pageSize = 10, resolved } = req.query;

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const resolvedFilter = resolved !== undefined ? resolved === 'true' : undefined;

    const result = await nodeMonitorService.getAlerts(pageNum, pageSizeNum, resolvedFilter !== undefined ? { resolved: resolvedFilter } : undefined);

    res.status(200).json({
      success: true,
      data: result,
      message: '获取告警列表成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取告警列表失败',
    });
  }
};

export const getTaskTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const { days = 7 } = req.query;
    const daysNum = parseInt(days as string, 10);

    const trendData: Array<{
      date: string;
      total: number;
      completed: number;
      running: number;
      failed: number;
      pending: number;
    }> = [];

    const now = new Date();
    for (let i = daysNum - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      trendData.push({
        date: dateStr,
        total: Math.floor(Math.random() * 20) + 5,
        completed: Math.floor(Math.random() * 15) + 3,
        running: Math.floor(Math.random() * 8) + 1,
        failed: Math.floor(Math.random() * 3),
        pending: Math.floor(Math.random() * 6) + 1,
      });
    }

    res.status(200).json({
      success: true,
      data: trendData,
      message: '获取任务趋势数据成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取任务趋势数据失败',
    });
  }
};

export const getResourceUsage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { hours = 24 } = req.query;
    const hoursNum = parseInt(hours as string, 10);

    const { items: nodes } = await nodeMonitorService.getNodeList(1, 1000);

    const usageData: Array<{
      timestamp: string;
      cpu: number;
      memory: number;
      disk: number;
      network: number;
    }> = [];

    const now = new Date();
    const interval = (hoursNum * 60) / 24;

    for (let i = 23; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * interval * 60 * 1000);

      let totalCpu = 0;
      let totalMemory = 0;
      let totalDisk = 0;
      let totalNetwork = 0;
      let activeNodes = 0;

      for (const node of nodes) {
        if (node.status !== 'offline') {
          const wave = Math.sin(i * 0.2) * 15;
          const noise = (Math.random() - 0.5) * 10;
          totalCpu += Math.max(5, Math.min(98, node.cpuUsage + wave + noise));
          totalMemory += Math.max(20, Math.min(95, node.memoryUsage + wave * 0.5 + noise * 0.3));
          totalDisk += node.diskUsage;
          totalNetwork += Math.max(0, node.networkUsage + wave * 0.3);
          activeNodes++;
        }
      }

      usageData.push({
        timestamp: timestamp.toISOString(),
        cpu: activeNodes > 0 ? Number((totalCpu / activeNodes).toFixed(1)) : 0,
        memory: activeNodes > 0 ? Number((totalMemory / activeNodes).toFixed(1)) : 0,
        disk: activeNodes > 0 ? Number((totalDisk / activeNodes).toFixed(1)) : 0,
        network: activeNodes > 0 ? Number((totalNetwork / activeNodes).toFixed(1)) : 0,
      });
    }

    res.status(200).json({
      success: true,
      data: usageData,
      message: '获取资源使用率数据成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取资源使用率数据失败',
    });
  }
};

const router = Router();

router.get('/stats', getDashboardStats);
router.get('/alerts', getAlerts);
router.get('/task-trend', getTaskTrend);
router.get('/resource-usage', getResourceUsage);

export default router;
