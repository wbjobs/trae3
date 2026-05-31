import { Router, Request, Response } from 'express';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { serviceContainer } from '../services/ServiceContainer';
import { createModuleLogger } from '../../shared/modules/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = createModuleLogger('FirmwareRoutes');
const router = Router();

const uploadDir = path.join(process.cwd(), 'temp', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ storage });

router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, pageSize = 20, model, keyword } = req.query;
    const result = await serviceContainer.firmwareManager.getFirmwareList({
      page: Number(page),
      pageSize: Number(pageSize),
      model: model as string | undefined,
      keyword: keyword as string | undefined
    });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('get_firmwares', '获取固件列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const firmware = await serviceContainer.firmwareManager.getFirmwareById(req.params.id);
    if (!firmware) {
      res.json({ success: false, error: '固件不存在' });
      return;
    }
    res.json({ success: true, data: firmware });
  } catch (error) {
    logger.error('get_firmware', '获取固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.post('/', upload.single('firmware'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.json({ success: false, error: '请选择固件文件' });
      return;
    }

    const { name, version, model, description, uploadedBy } = req.body;

    const firmware = await serviceContainer.firmwareManager.uploadFirmware({
      name,
      version,
      model,
      description,
      uploadedBy: uploadedBy || 'admin',
      sourcePath: req.file.path
    });

    await fs.promises.unlink(req.file.path).catch(() => {});

    res.json({ success: true, data: firmware, message: '固件上传成功' });
  } catch (error) {
    if (req.file) {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }
    logger.error('upload_firmware', '上传固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.firmwareManager.deleteFirmware(req.params.id);
    if (!result) {
      res.json({ success: false, error: '固件不存在' });
      return;
    }
    res.json({ success: true, message: '固件删除成功' });
  } catch (error) {
    logger.error('delete_firmware', '删除固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/validate', async (req: Request, res: Response) => {
  try {
    const result = await serviceContainer.firmwareManager.validateFirmwareIntegrity(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('validate_firmware', '校验固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/model/:model/versions', async (req: Request, res: Response) => {
  try {
    const versions = await serviceContainer.firmwareManager.getFirmwareVersions(req.params.model);
    res.json({ success: true, data: versions });
  } catch (error) {
    logger.error('get_versions', '获取版本列表失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/model/:model/latest', async (req: Request, res: Response) => {
  try {
    const latest = await serviceContainer.firmwareManager.getLatestFirmware(req.params.model);
    if (!latest) {
      res.json({ success: false, error: '未找到该型号的固件' });
      return;
    }
    res.json({ success: true, data: latest });
  } catch (error) {
    logger.error('get_latest', '获取最新固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/model/:model/check-update', async (req: Request, res: Response) => {
  try {
    const { currentVersion } = req.query;
    const update = await serviceContainer.firmwareManager.checkUpdateAvailable(
      req.params.model,
      currentVersion as string
    );
    res.json({ success: true, data: { hasUpdate: !!update, firmware: update } });
  } catch (error) {
    logger.error('check_update', '检查更新失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const firmware = await serviceContainer.firmwareManager.getFirmwareById(req.params.id);
    if (!firmware) {
      res.json({ success: false, error: '固件不存在' });
      return;
    }

    if (!fs.existsSync(firmware.filePath)) {
      res.json({ success: false, error: '固件文件不存在' });
      return;
    }

    res.download(firmware.filePath, firmware.name + path.extname(firmware.filePath));
  } catch (error) {
    logger.error('download_firmware', '下载固件失败', { error: (error as Error).message });
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
