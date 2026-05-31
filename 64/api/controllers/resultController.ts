import { Router, type Request, type Response } from 'express';
import { resultProcessor } from '../services/resultProcessor.js';
import { taskService } from '../services/taskScheduler.js';
import type { CalculationResult } from '../../shared/types.js';

export const getResultList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, pageSize = 20, taskId, startDate, endDate } = req.query;

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const taskIdFilter = taskId as string | undefined;
    const startDateFilter = startDate ? new Date(startDate as string) : undefined;
    const endDateFilter = endDate ? new Date(endDate as string) : undefined;

    const { total, items } = await resultProcessor.getResultList(
      {
        taskId: taskIdFilter,
        startDate: startDateFilter,
        endDate: endDateFilter,
      },
      pageNum,
      pageSizeNum
    );

    res.status(200).json({
      success: true,
      data: {
        total,
        items,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '获取结果列表成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取结果列表失败',
    });
  }
};

export const getResultById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await resultProcessor.getResultById(id);

    if (!result) {
      res.status(404).json({
        success: false,
        error: '结果不存在',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
      message: '获取结果详情成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取结果详情失败',
    });
  }
};

export const getResultsByTaskId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;
    const { page = 1, pageSize = 20 } = req.query;

    const task = await taskService.getTaskById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: '任务不存在',
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);

    const results: CalculationResult[] = await resultProcessor.getResultsByTaskId(taskId);

    const total = results.length;
    const start = (pageNum - 1) * pageSizeNum;
    const items = results.slice(start, start + pageSizeNum);

    res.status(200).json({
      success: true,
      data: {
        total,
        items,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '根据任务ID获取结果成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '根据任务ID获取结果失败',
    });
  }
};

export const downloadResult = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const result = await resultProcessor.getResultById(id);
    if (!result) {
      res.status(404).json({
        success: false,
        error: '结果不存在',
      });
      return;
    }

    const formatType = format === 'csv' ? 'csv' : 'json';
    const buffer = await resultProcessor.exportResults([id], formatType);

    const filename = `result-${id}.${formatType}`;
    const contentType = formatType === 'json' ? 'application/json' : 'text/csv';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '下载结果数据失败',
    });
  }
};

export const generateResultReport = async (req: Request, res: Response): Promise<void> => {
  try {
    const { taskId } = req.params;

    const task = await taskService.getTaskById(taskId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: '任务不存在',
      });
      return;
    }

    const report = await resultProcessor.generateResultReport(taskId);

    res.status(200).json({
      success: true,
      data: report,
      message: '生成结果报告成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '生成结果报告失败',
    });
  }
};

const router = Router();

router.get('/', getResultList);
router.get('/:id', getResultById);
router.get('/task/:taskId', getResultsByTaskId);
router.get('/:id/download', downloadResult);
router.get('/task/:taskId/report', generateResultReport);

export default router;
