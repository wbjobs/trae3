import { Router, Request, Response } from 'express';
import { serviceContainer } from '../services/ServiceContainer';
import { createModuleLogger } from '../../shared/modules/logger';

const logger = createModuleLogger('GroupRoutes');
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query;
    const result = await serviceContainer.terminalManager.getGroupList({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword: keyword as string | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_groups', '获取分组列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/all', async (_req: Request, res: Response) => {
  try {
    const groups = await serviceContainer.terminalManager.getAllGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    logger.error('get_all_groups', '获取全部分组失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const group = await serviceContainer.terminalManager.getGroupById(req.params.id);
    if (!group) {
      res.json({ success: false, error: '分组不存在' });
      return;
    }
    res.json({ success: true, data: group });
  } catch (error) {
    logger.error('get_group', '获取分组失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const group = await serviceContainer.terminalManager.createGroup(name, description);
    res.json({ success: true, data: group, message: '分组创建成功' });
  } catch (error) {
    logger.error('create_group', '创建分组失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const group = await serviceContainer.terminalManager.updateGroup(req.params.id, { name, description });
    if (!group) {
      res.json({ success: false, error: '分组不存在' });
      return;
    }
    res.json({ success: true, data: group, message: '分组更新成功' });
  } catch (error) {
    logger.error('update_group', '更新分组失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.terminalManager.deleteGroup(req.params.id);
    if (!result) {
      res.json({ success: false, error: '分组不存在' });
      return;
    }
    res.json({ success: true, message: '分组删除成功' });
  } catch (error) {
    logger.error('delete_group', '删除分组失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
