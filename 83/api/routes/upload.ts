import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from './auth.js';
import { storageModule } from '../modules/storage.module.js';
import { validationModule } from '../modules/validation.module.js';
import { ApiResponse, FileValidationResult, UploadSession } from '../../shared/types.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.post('/init', authenticateToken, (req: AuthRequest, res: Response) => {
  const { fileName, totalSize, checksum } = req.body;

  if (!fileName || !totalSize) {
    res.status(400).json({ success: false, message: '文件名和文件大小不能为空' });
    return;
  }

  const session = storageModule.createUploadSession(fileName, totalSize, checksum);

  const response: ApiResponse<UploadSession & { chunkSize: number }> = {
    success: true,
    data: {
      ...session,
      chunkSize: storageModule.getChunkSize(),
    },
  };

  res.json(response);
});

router.post('/chunk', authenticateToken, upload.single('chunk'), (req: AuthRequest, res: Response) => {
  const { sessionId, chunkIndex } = req.body;

  if (!sessionId || chunkIndex === undefined || !req.file) {
    res.status(400).json({ success: false, message: '缺少必要参数' });
    return;
  }

  const result = storageModule.uploadChunk(sessionId, parseInt(chunkIndex), req.file.buffer);

  if (!result.success) {
    res.status(400).json({ success: false, message: '分片上传失败' });
    return;
  }

  res.json({
    success: true,
    data: result,
    message: `分片 ${chunkIndex} 上传成功`,
  });
});

router.post('/complete', authenticateToken, async (req: AuthRequest, res: Response) => {
  const { sessionId, rubbingId } = req.body;

  if (!sessionId) {
    res.status(400).json({ success: false, message: '会话ID不能为空' });
    return;
  }

  const result = await storageModule.completeUpload(sessionId, rubbingId);

  if (!result) {
    res.status(400).json({ success: false, message: '完成上传失败' });
    return;
  }

  res.json({
    success: true,
    data: {
      fileInfo: result.fileInfo,
      rubbingId: result.rubbingId,
    },
    message: '上传完成',
  });
});

router.post('/validate', authenticateToken, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '请选择文件' });
    return;
  }

  const result = await validationModule.validateFile(
    req.file.buffer,
    req.file.originalname,
    req.file.size
  );

  const response: ApiResponse<FileValidationResult> = {
    success: result.valid,
    data: result,
    message: result.valid ? '文件校验通过' : '文件校验不通过',
  };

  res.json(response);
});

router.get('/progress/:sessionId', authenticateToken, (req: AuthRequest, res: Response) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    res.status(400).json({ success: false, message: '会话ID不能为空' });
    return;
  }

  const progress = storageModule.getUploadProgress(sessionId);

  res.json({ success: true, data: progress });
});

export default router;
