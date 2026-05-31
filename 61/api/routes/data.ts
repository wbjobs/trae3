import { Router, type Request, type Response } from 'express';
import { querySensorData, getSensorStats } from '../services/storage.js';
import { requirePermission } from '../middleware/permission.js';

const router = Router();

router.get('/query', (req: Request, res: Response): void => {
  const { sensorIds, startTime, endTime, limit } = req.query;

  if (!sensorIds) {
    res.status(400).json({ success: false, error: 'sensorIds is required' });
    return;
  }

  const ids = (sensorIds as string).split(',').filter(Boolean);
  if (ids.length === 0) {
    res.status(400).json({ success: false, error: 'At least one sensorId is required' });
    return;
  }

  const data = querySensorData(
    ids,
    startTime as string | undefined,
    endTime as string | undefined,
    limit ? parseInt(limit as string, 10) : 1000
  );

  res.json({ success: true, data });
});

router.get('/export', requirePermission('data:export'), (req: Request, res: Response): void => {
  const { sensorIds, startTime, endTime, format } = req.query;

  if (!sensorIds) {
    res.status(400).json({ success: false, error: 'sensorIds is required' });
    return;
  }

  const ids = (sensorIds as string).split(',').filter(Boolean);
  const data = querySensorData(
    ids,
    startTime as string | undefined,
    endTime as string | undefined,
    10000
  );

  if (format === 'csv') {
    const header = 'id,sensorId,value,quality,timestamp';
    const rows = data.map((d) => `${d.id},${d.sensorId},${d.value},${d.quality},${d.timestamp}`);
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sensor_data.csv');
    res.send(csv);
  } else {
    res.json({ success: true, data });
  }
});

router.get('/stats', (req: Request, res: Response): void => {
  const { sensorId, period } = req.query;

  if (!sensorId) {
    res.status(400).json({ success: false, error: 'sensorId is required' });
    return;
  }

  const stats = getSensorStats(sensorId as string, (period as string) || '24h');
  res.json({ success: true, data: stats });
});

export default router;
