import { Router, type Request, type Response } from 'express';
import * as sampleRepo from '../repositories/sample.repository.js';
import * as flowControl from '../modules/flow-control/flow-control.service.js';
import * as validation from '../modules/data-validation/validation.service.js';

const router = Router();

router.get('/pending', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const result = await sampleRepo.findPaginated({ page, pageSize, status: 'pending' });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Fetch pending approvals error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending approvals' });
  }
});

router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const status = req.query.status as string || 'approved';
    const result = await sampleRepo.findPaginated({ page, pageSize, status });
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Fetch approval history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch approval history' });
  }
});

router.get('/pending/count', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await sampleRepo.findPaginated({ page: 1, pageSize: 1, status: 'pending' });
    res.json({ success: true, data: { count: result.total } });
  } catch (error) {
    console.error('Fetch pending count error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch pending count' });
  }
});

router.post('/:id/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation_ = validation.validateApproval(req.body);
    if (!validation_.valid) {
      res.status(400).json({ success: false, errors: validation_.errors });
      return;
    }

    const sample = await sampleRepo.findById(req.params.id);
    if (!sample) {
      res.status(404).json({ success: false, error: 'Sample not found' });
      return;
    }

    if (sample.status !== 'pending') {
      res.status(400).json({ success: false, error: 'Sample is not pending approval' });
      return;
    }

    const operator = req.body.operator || 'u003';

    if (req.body.action === 'approve') {
      await flowControl.approveSample(sample.id, operator, req.body.comment);
    } else {
      await flowControl.rejectSample(sample.id, operator, req.body.comment);
    }

    res.json({ success: true, data: { id: sample.id, status: req.body.action === 'approve' ? 'approved' : 'rejected' } });
  } catch (error) {
    console.error('Process approval error:', error);
    res.status(500).json({ success: false, error: 'Failed to process approval' });
  }
});

export default router;
