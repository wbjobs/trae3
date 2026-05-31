import { Router, type Request, type Response } from 'express';
import { getBaseDb } from '../db/base-db.js';
import { getFlowDb } from '../db/flow-db.js';

const router = Router();

router.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const baseDb = await getBaseDb();
    const flowDb = await getFlowDb();

    const totalResult = baseDb.exec('SELECT COUNT(*) FROM samples');
    const pendingResult = baseDb.exec("SELECT COUNT(*) FROM samples WHERE status = 'pending'");
    const approvedResult = baseDb.exec("SELECT COUNT(*) FROM samples WHERE status = 'approved'");
    const rejectedResult = baseDb.exec("SELECT COUNT(*) FROM samples WHERE status = 'rejected'");

    const total = (totalResult[0]?.values[0]?.[0] as number) || 0;
    const pendingCount = (pendingResult[0]?.values[0]?.[0] as number) || 0;
    const approvedCount = (approvedResult[0]?.values[0]?.[0] as number) || 0;
    const rejectedCount = (rejectedResult[0]?.values[0]?.[0] as number) || 0;

    const recentFlowResult = flowDb.exec(
      'SELECT fr.sample_id, fr.action, fr.operator, fr.created_at FROM flow_records fr ORDER BY fr.created_at DESC LIMIT 5'
    );

    const recentActivities = [];
    if (recentFlowResult[0]?.values) {
      for (const row of recentFlowResult[0].values) {
        const [sampleId, action, operator, timestamp] = row as [string, string, string, string];
        const sampleResult = baseDb.exec('SELECT sample_no FROM samples WHERE id = ?', [sampleId]);
        const sampleNo = (sampleResult[0]?.values[0]?.[0] as string) || sampleId;
        recentActivities.push({ sampleNo, action, operator, timestamp });
      }
    }

    res.json({
      success: true,
      data: { totalSamples: total, pendingCount, approvedCount, rejectedCount, recentActivities },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
