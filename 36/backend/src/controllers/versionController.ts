import { Request, Response } from 'express';
import { versionService } from '../services/versionService';
import { Logger } from '../utils/logger';

const logger = new Logger('VersionController');

export class VersionController {
  async validateVersionFormat(req: Request, res: Response) {
    try {
      const { version } = req.query;

      if (!version) {
        return res.status(400).json({ error: '缺少版本号参数' });
      }

      const result = await versionService.validateVersionFormat(version as string);
      res.json(result);
    } catch (error) {
      logger.error('验证版本格式失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async checkVersionExists(req: Request, res: Response) {
    try {
      const { projectId, version } = req.query;

      if (!projectId || !version) {
        return res.status(400).json({ error: '缺少必要参数: projectId, version' });
      }

      const exists = await versionService.checkVersionExists(
        projectId as string,
        version as string
      );

      res.json({ exists, projectId, version });
    } catch (error) {
      logger.error('检查版本存在失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getNextVersion(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { increment = 'patch' } = req.query;

      if (!projectId) {
        return res.status(400).json({ error: '缺少工程ID' });
      }

      const version = await versionService.getNextVersion(
        projectId,
        increment as 'major' | 'minor' | 'patch'
      );

      res.json({ version });
    } catch (error) {
      logger.error('获取下一个版本失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async compareVersions(req: Request, res: Response) {
    try {
      const { v1, v2 } = req.query;

      if (!v1 || !v2) {
        return res.status(400).json({ error: '缺少必要参数: v1, v2' });
      }

      const result = await versionService.compareVersions(v1 as string, v2 as string);
      res.json(result);
    } catch (error) {
      logger.error('比较版本失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async verifyIntegrity(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await versionService.verifyIntegrity(id);

      if (!result.valid && result.details.error === '固件不存在') {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('验证完整性失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async batchValidate(req: Request, res: Response) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'ids 必须是非空数组' });
      }

      const results = await versionService.batchValidate(ids);
      res.json({ results });
    } catch (error) {
      logger.error('批量校验失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getVersionTree(req: Request, res: Response) {
    try {
      const { projectId } = req.params;

      if (!projectId) {
        return res.status(400).json({ error: '缺少工程ID' });
      }

      const tree = await versionService.getVersionTree(projectId);
      res.json(tree);
    } catch (error) {
      logger.error('获取版本树失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async rollbackVersion(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const { targetVersion, reason } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: '缺少工程ID' });
      }

      if (!targetVersion) {
        return res.status(400).json({ error: '缺少目标版本号' });
      }

      const result = await versionService.rollbackVersion(projectId, targetVersion, reason);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      logger.error('版本回滚失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export const versionController = new VersionController();
