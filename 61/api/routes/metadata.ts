import { Router, type Request, type Response } from 'express';
import {
  getMetadataSnapshot,
  getMetadataVersion,
  flushMetadataVersion,
  getMetadataVersions,
  getMetadataVersionDetail,
  diffMetadataVersions,
  rollbackToVersion,
} from '../services/metadata.js';
import { requirePermission } from '../middleware/permission.js';

const router = Router();

router.get('/snapshot', (req: Request, res: Response): void => {
  const snapshot = getMetadataSnapshot();
  res.json({ success: true, data: snapshot });
});

router.get('/version', (req: Request, res: Response): void => {
  const version = getMetadataVersion();
  res.json({ success: true, data: { version } });
});

router.post('/sync', requirePermission('metadata:write'), (req: Request, res: Response): void => {
  const version = flushMetadataVersion();
  res.json({ success: true, data: { version } });
});

router.get('/versions', (req: Request, res: Response): void => {
  const limit = parseInt(req.query.limit as string, 10) || 20;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const versions = getMetadataVersions(limit, offset);
  res.json({ success: true, data: versions });
});

router.get('/versions/:version', (req: Request, res: Response): void => {
  const version = parseInt(req.params.version, 10);
  if (isNaN(version)) {
    res.status(400).json({ success: false, error: 'Invalid version number' });
    return;
  }
  const detail = getMetadataVersionDetail(version);
  if (!detail) {
    res.status(404).json({ success: false, error: 'Version not found' });
    return;
  }
  res.json({ success: true, data: detail });
});

router.get('/diff', (req: Request, res: Response): void => {
  const v1 = parseInt(req.query.v1 as string, 10);
  const v2 = parseInt(req.query.v2 as string, 10);
  if (isNaN(v1) || isNaN(v2)) {
    res.status(400).json({ success: false, error: 'v1 and v2 are required' });
    return;
  }
  const diff = diffMetadataVersions(v1, v2);
  res.json({ success: true, data: diff });
});

router.post('/rollback/:version', requirePermission('metadata:write'), (req: Request, res: Response): void => {
  const version = parseInt(req.params.version, 10);
  if (isNaN(version)) {
    res.status(400).json({ success: false, error: 'Invalid version number' });
    return;
  }
  const result = rollbackToVersion(version);
  if (!result) {
    res.status(404).json({ success: false, error: 'Version not found' });
    return;
  }
  res.json({ success: true, data: result });
});

export default router;
