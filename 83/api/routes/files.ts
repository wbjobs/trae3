import { Router, Request, Response } from 'express';
import { authenticateToken, verifyToken, AuthRequest } from './auth.js';
import { storageModule } from '../modules/storage.module.js';
import { ApiResponse, FileInfo } from '../../shared/types.js';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const fileId = req.params.id;
  const fileInfo = storageModule.getFileInfo(fileId);

  if (!fileInfo) {
    res.status(404).json({ success: false, message: '文件不存在' });
    return;
  }

  const response: ApiResponse<FileInfo> = {
    success: true,
    data: fileInfo,
  };

  res.json(response);
});

const authenticateOptional = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const tokenFromQuery = req.query.token as string;
  const token = authHeader?.replace('Bearer ', '') || tokenFromQuery;

  if (!token) {
    res.status(401).json({ success: false, message: '未提供认证信息' });
    return;
  }

  try {
    const decoded = verifyToken(token);
    (req as AuthRequest).user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ success: false, message: '认证失败' });
  }
};

router.get('/:id/preview', authenticateOptional, (req: Request, res: Response) => {
  const fileId = req.params.id;
  const type = req.query.type === 'preview' ? 'preview' : 'thumb';

  const thumbnailPath = storageModule.getThumbnailPath(fileId, type);

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    res.sendFile(path.resolve(thumbnailPath));
    return;
  }

  const filePath = storageModule.getFilePath(fileId);
  if (filePath && fs.existsSync(filePath)) {
    res.sendFile(path.resolve(filePath));
    return;
  }

  res.status(404).json({ success: false, message: '文件不存在' });
});

router.get('/:id/download', authenticateOptional, (req: Request, res: Response) => {
  const fileId = req.params.id;
  const fileInfo = storageModule.getFileInfo(fileId);

  if (!fileInfo) {
    res.status(404).json({ success: false, message: '文件不存在' });
    return;
  }

  const filePath = storageModule.getFilePath(fileId);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ success: false, message: '文件不存在' });
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileInfo.originalName)}"`);
  res.setHeader('Content-Type', fileInfo.mimeType);
  res.sendFile(path.resolve(filePath));
});

router.get('/rubbing/:rubbingId', authenticateToken, (req: AuthRequest, res: Response) => {
  const rubbingId = req.params.rubbingId;
  const fileInfo = storageModule.getFileByRubbingId(rubbingId);

  if (!fileInfo) {
    res.status(404).json({ success: false, message: '文件不存在' });
    return;
  }

  const response: ApiResponse<FileInfo> = {
    success: true,
    data: fileInfo,
  };

  res.json(response);
});

router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  const fileId = req.params.id;
  const success = storageModule.deleteFile(fileId);

  if (!success) {
    res.status(404).json({ success: false, message: '删除失败，文件不存在' });
    return;
  }

  res.json({ success: true, message: '删除成功' });
});

export default router;
