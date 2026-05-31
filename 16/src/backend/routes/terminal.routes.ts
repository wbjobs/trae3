import { Router, Request, Response } from 'express';
import { serviceContainer } from '../services/ServiceContainer';
import { createModuleLogger } from '../../shared/modules/logger';
import { TerminalStatus, ApiResponse, TerminalCreateOptions, TerminalUpdateOptions } from '@shared/types';

const logger = createModuleLogger('TerminalRoutes');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, groupId, status, keyword } = req.query;
    const result = await serviceContainer.terminalManager.getTerminalList({
      page: Number(page),
      pageSize: Number(pageSize),
      groupId: groupId as string | undefined,
      status: status as TerminalStatus | undefined,
      keyword: keyword as string | undefined
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_terminals', '获取终端列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const terminal = await serviceContainer.terminalManager.getTerminalById(req.params.id);
    if (!terminal) {
      res.json({ success: false, error: '终端不存在' });
      return;
    }
    res.json({ success: true, data: terminal });
  } catch (error) {
    logger.error('get_terminal', '获取终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const options: TerminalCreateOptions = req.body;
    const terminal = await serviceContainer.terminalManager.createTerminal(options);
    res.json({ success: true, data: terminal, message: '终端创建成功' });
  } catch (error) {
    logger.error('create_terminal', '创建终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const options: TerminalUpdateOptions = req.body;
    const terminal = await serviceContainer.terminalManager.updateTerminal(req.params.id, options);
    if (!terminal) {
      res.json({ success: false, error: '终端不存在' });
      return;
    }
    res.json({ success: true, data: terminal, message: '终端更新成功' });
  } catch (error) {
    logger.error('update_terminal', '更新终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.terminalManager.deleteTerminal(req.params.id);
    if (!result) {
      res.json({ success: false, error: '终端不存在' });
      return;
    }
    res.json({ success: true, message: '终端删除成功' });
  } catch (error) {
    logger.error('delete_terminal', '删除终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/stats/count-by-status', async (_req: Request, res: Response) => {
  try {
    const stats = await serviceContainer.terminalManager.getTerminalCountByStatus();
    res.json({ success: true, data: stats });
  } catch (error) {
    logger.error('get_stats', '获取统计数据失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const terminal = await serviceContainer.terminalManager.updateTerminalStatus(req.params.id, status);
    if (!terminal) {
      res.json({ success: false, error: '终端不存在' });
      return;
    }
    res.json({ success: true, data: terminal });
  } catch (error) {
    logger.error('update_status', '更新终端状态失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/discover/scan', async (req: Request, res: Response) => {
  try {
    const { network, netmask } = req.body;
    const results = await serviceContainer.terminalDiscoverer.scanNetwork(network, netmask);
    res.json({ success: true, data: results });
  } catch (error) {
    logger.error('scan_network', '网络扫描失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/discover/networks', async (_req: Request, res: Response) => {
  try {
    const networks = serviceContainer.terminalDiscoverer.getLocalNetworks();
    res.json({ success: true, data: networks });
  } catch (error) {
    logger.error('get_networks', '获取网络列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/batch-add', async (req: Request, res: Response) => {
  try {
    const { terminals } = req.body;
    const results = [];
    const errors = [];

    for (const term of terminals) {
      try {
        const created = await serviceContainer.terminalManager.createTerminal(term);
        results.push(created);
      } catch (error) {
        errors.push({ terminal: term, error: (error as Error).message });
      }
    }

    res.json({
      success: true,
      data: { created: results, errors },
      message: `成功创建 ${results.length} 个终端，失败 ${errors.length} 个`
    });
  } catch (error) {
    logger.error('batch_add', '批量添加终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/batch-move', async (req: Request, res: Response) => {
  try {
    const { terminalIds, groupId } = req.body;
    await serviceContainer.terminalManager.moveTerminalsToGroup(terminalIds, groupId);
    res.json({ success: true, message: '批量移动终端成功' });
  } catch (error) {
    logger.error('batch_move', '批量移动终端失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
