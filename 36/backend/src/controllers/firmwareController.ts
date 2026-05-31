import { Request, Response } from 'express';
import { firmwareService } from '../services/firmwareService';
import { versionService } from '../services/versionService';
import { Logger } from '../utils/logger';
import * as fs from 'fs';

const logger = new Logger('FirmwareController');

export class FirmwareController {
  async uploadFirmware(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '未上传文件' });
      }

      const { projectId, projectName, version, uploader } = req.body;

      if (!projectId || !projectName || !version) {
        return res.status(400).json({ error: '缺少必要参数: projectId, projectName, version' });
      }

      const result = await firmwareService.uploadFirmware(
        req.file,
        projectId,
        projectName,
        version,
        uploader || 'system'
      );

      res.json({
        success: true,
        data: result.archive,
        message: '固件上传成功'
      });
    } catch (error) {
      logger.error('固件上传失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getFirmwareList(req: Request, res: Response) {
    try {
      const {
        page = 1,
        pageSize = 20,
        sortBy,
        sortOrder,
        projectId,
        version
      } = req.query;

      const result = await firmwareService.getFirmwareList({
        page: Number(page),
        pageSize: Number(pageSize),
        sortBy: sortBy as string,
        sortOrder: sortOrder as 'asc' | 'desc',
        projectId: projectId as string,
        version: version as string
      });

      res.json(result);
    } catch (error) {
      logger.error('获取固件列表失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getFirmwareById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const archive = await firmwareService.getById(id);

      if (!archive) {
        return res.status(404).json({ error: '固件不存在' });
      }

      res.json(archive);
    } catch (error) {
      logger.error('获取固件信息失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async downloadFirmware(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const archive = await firmwareService.getById(id);

      if (!archive) {
        return res.status(404).json({ error: '固件不存在' });
      }

      if (!fs.existsSync(archive.filePath)) {
        return res.status(404).json({ error: '文件不存在' });
      }

      const filename = `${archive.projectName}_v${archive.version}${archive.filePath.substring(archive.filePath.lastIndexOf('.'))}`;
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('X-Firmware-MD5', archive.md5);
      res.setHeader('X-Firmware-Size', archive.fileSize.toString());

      const fileStream = fs.createReadStream(archive.filePath);
      fileStream.pipe(res);
    } catch (error) {
      logger.error('下载固件失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async deleteFirmware(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const success = await firmwareService.deleteFirmware(id);

      if (!success) {
        return res.status(404).json({ error: '固件不存在' });
      }

      res.json({ success: true, message: '固件已删除' });
    } catch (error) {
      logger.error('删除固件失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async validateFirmware(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await versionService.validateFirmware(id);
      res.json(result);
    } catch (error) {
      logger.error('校验固件失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async compareVersions(req: Request, res: Response) {
    try {
      const { leftId, rightId } = req.params;
      const result = await firmwareService.compareVersions(leftId, rightId);

      if (!result) {
        return res.status(404).json({ error: '一个或多个固件不存在' });
      }

      res.json(result);
    } catch (error) {
      logger.error('对比版本失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getVersionInfo(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const info = await firmwareService.getVersionInfo(id);

      if (!info) {
        return res.status(404).json({ error: '固件不存在' });
      }

      res.json(info);
    } catch (error) {
      logger.error('获取版本信息失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async updateTags(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { tags } = req.body;

      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: 'tags 必须是数组' });
      }

      const archive = await firmwareService.updateTags(id, tags);

      if (!archive) {
        return res.status(404).json({ error: '固件不存在' });
      }

      res.json(archive);
    } catch (error) {
      logger.error('更新标签失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async searchFirmware(req: Request, res: Response) {
    try {
      const { q } = req.query;

      if (!q) {
        return res.status(400).json({ error: '缺少搜索参数 q' });
      }

      const results = await firmwareService.search(q as string);
      res.json(results);
    } catch (error) {
      logger.error('搜索固件失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getProjectVersions(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const versions = await firmwareService.getProjectVersions(projectId);
      res.json(versions);
    } catch (error) {
      logger.error('获取工程版本失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }

  async getStats(_req: Request, res: Response) {
    try {
      const stats = await firmwareService.getStats();
      res.json(stats);
    } catch (error) {
      logger.error('获取统计信息失败', error as Error);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

export const firmwareController = new FirmwareController();
