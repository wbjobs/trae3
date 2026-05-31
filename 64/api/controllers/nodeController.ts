import { Router, type Request, type Response } from 'express';
import { nodeMonitorService } from '../services/nodeMonitor.js';
import type { Node, NodeMetrics, NodeStatus } from '../../shared/types.js';

export const getNodeList = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = 1, pageSize = 10, status } = req.query;

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);
    const statusFilter = status as NodeStatus | undefined;

    const { total, items } = await nodeMonitorService.getNodeList(
      pageNum,
      pageSizeNum
    );

    let filteredItems = items;
    if (statusFilter) {
      filteredItems = items.filter(node => node.status === statusFilter);
    }

    res.status(200).json({
      success: true,
      data: {
        total: statusFilter ? filteredItems.length : total,
        items: filteredItems,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '获取节点列表成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取节点列表失败',
    });
  }
};

export const getNodeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const node = await nodeMonitorService.getNodeById(id);

    if (!node) {
      res.status(404).json({
        success: false,
        error: '节点不存在',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: node,
      message: '获取节点详情成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取节点详情失败',
    });
  }
};

export const getNodeMetrics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { startTime, endTime, page = 1, pageSize = 100 } = req.query;

    const node = await nodeMonitorService.getNodeById(id);
    if (!node) {
      res.status(404).json({
        success: false,
        error: '节点不存在',
      });
      return;
    }

    const pageNum = parseInt(page as string, 10);
    const pageSizeNum = parseInt(pageSize as string, 10);

    const startDate = startTime ? new Date(startTime as string) : undefined;
    const endDate = endTime ? new Date(endTime as string) : undefined;

    const metrics: NodeMetrics[] = await nodeMonitorService.getNodeMetrics(
      id,
      startDate,
      endDate
    );

    const total = metrics.length;
    const start = (pageNum - 1) * pageSizeNum;
    const items = metrics.slice(start, start + pageSizeNum);

    res.status(200).json({
      success: true,
      data: {
        total,
        items,
        page: pageNum,
        pageSize: pageSizeNum,
      },
      message: '获取节点监控历史数据成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '获取节点监控历史数据失败',
    });
  }
};

export const registerNode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, ipAddress } = req.body;

    if (!name || !ipAddress) {
      res.status(400).json({
        success: false,
        error: '节点名称和IP地址不能为空',
      });
      return;
    }

    const node: Node = await nodeMonitorService.registerNode({ name, ipAddress });

    res.status(201).json({
      success: true,
      data: node,
      message: '节点注册成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '节点注册失败',
    });
  }
};

export const unregisterNode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await nodeMonitorService.unregisterNode(id);

    if (!result) {
      res.status(404).json({
        success: false,
        error: '节点不存在',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { deleted: true },
      message: '节点注销成功',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : '节点注销失败',
    });
  }
};

const router = Router();

router.get('/', getNodeList);
router.get('/:id', getNodeById);
router.get('/:id/metrics', getNodeMetrics);
router.post('/', registerNode);
router.delete('/:id', unregisterNode);

export default router;
