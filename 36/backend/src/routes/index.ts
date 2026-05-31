import { Router } from 'express';
import multer from 'multer';
import * as path from 'path';
import { config } from '../config';
import { firmwareController } from '../controllers/firmwareController';
import { versionController } from '../controllers/versionController';
import { logController } from '../controllers/logController';
import { authMiddleware } from '../middleware/auth';
import { generateId, ensureDir } from '@shared/utils';

const router = Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(config.storagePath, 'temp');
    ensureDir(uploadDir);
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${generateId()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (config.allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}。允许的类型: ${config.allowedExtensions.join(', ')}`));
    }
  }
});

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

router.use('/api', authMiddleware);

router.get('/api/firmware', firmwareController.getFirmwareList);
router.get('/api/firmware/search', firmwareController.searchFirmware);
router.get('/api/firmware/stats', firmwareController.getStats);
router.get('/api/firmware/:id', firmwareController.getFirmwareById);
router.get('/api/firmware/:id/download', firmwareController.downloadFirmware);
router.get('/api/firmware/:id/version-info', firmwareController.getVersionInfo);
router.post('/api/firmware/:id/validate', firmwareController.validateFirmware);
router.put('/api/firmware/:id/tags', firmwareController.updateTags);
router.delete('/api/firmware/:id', firmwareController.deleteFirmware);
router.get('/api/firmware/compare/:leftId/:rightId', firmwareController.compareVersions);
router.get('/api/firmware/project/:projectId/versions', firmwareController.getProjectVersions);
router.post('/api/firmware/upload', upload.single('file'), firmwareController.uploadFirmware);

router.get('/api/version/validate', versionController.validateVersionFormat);
router.get('/api/version/exists', versionController.checkVersionExists);
router.get('/api/version/next/:projectId', versionController.getNextVersion);
router.get('/api/version/compare', versionController.compareVersions);
router.get('/api/version/integrity/:id', versionController.verifyIntegrity);
router.post('/api/version/batch-validate', versionController.batchValidate);
router.get('/api/version/tree/:projectId', versionController.getVersionTree);
router.post('/api/version/rollback/:projectId', versionController.rollbackVersion);

router.get('/api/logs', logController.getLogs);
router.get('/api/logs/stats', logController.getLogStats);
router.get('/api/logs/:id', logController.getLogById);
router.post('/api/logs', logController.addLog);
router.delete('/api/logs', logController.deleteLogs);
router.get('/api/logs/export', logController.exportLogs);
router.post('/api/logs/clear-old', logController.clearOldLogs);
router.get('/api/logs/project/:projectId', logController.getProjectLogs);
router.get('/api/logs/build/:buildId', logController.getBuildLog);
router.get('/api/logs/build/:buildId/entries', logController.getBuildLogs);
router.post('/api/logs/build', logController.uploadBuildLog);

export default router;
