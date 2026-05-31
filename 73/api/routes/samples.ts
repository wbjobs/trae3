import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import * as sampleRepo from '../repositories/sample.repository.js';
import * as flowControl from '../modules/flow-control/flow-control.service.js';
import * as fileStorage from '../modules/file-storage/file-storage.service.js';
import * as validation from '../modules/data-validation/validation.service.js';

const router = Router();

const upload = multer({
  dest: path.resolve(process.cwd(), 'uploads/tmp'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation_ = validation.validateSample(req.body);
    if (!validation_.valid) {
      res.status(400).json({ success: false, errors: validation_.errors });
      return;
    }

    const sample = await sampleRepo.create({
      name: req.body.name,
      type: req.body.type,
      source: req.body.source,
      specification: req.body.specification,
      quantity: Number(req.body.quantity),
      unit: req.body.unit,
      description: req.body.description,
      createdBy: req.body.createdBy || 'u002',
    });

    await flowControl.submitSample(sample.id, sample.createdBy);

    res.status(201).json({
      success: true,
      data: {
        id: sample.id,
        sampleNo: sample.sampleNo,
        status: sample.status,
        createdAt: sample.createdAt,
      },
    });
  } catch (error) {
    console.error('Create sample error:', error);
    res.status(500).json({ success: false, error: 'Failed to create sample' });
  }
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 10;
    const keyword = req.query.keyword as string | undefined;
    const status = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const result = await sampleRepo.findPaginated({ page, pageSize, keyword, status, startDate, endDate });

    res.json({
      success: true,
      data: {
        total: result.total,
        page,
        pageSize,
        items: result.items,
      },
    });
  } catch (error) {
    console.error('Fetch samples error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch samples' });
  }
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const detail = await sampleRepo.getDetailWithRelations(req.params.id);
    if (!detail) {
      res.status(404).json({ success: false, error: 'Sample not found' });
      return;
    }

    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('Fetch sample error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch sample' });
  }
});

router.post('/:id/attachments', upload.array('files', 5), async (req: Request, res: Response): Promise<void> => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ success: false, error: 'No files uploaded' });
      return;
    }

    const sample = await sampleRepo.findById(req.params.id);
    if (!sample) {
      res.status(404).json({ success: false, error: 'Sample not found' });
      return;
    }

    const attachments = [];
    for (const file of files) {
      const attachment = await fileStorage.saveAttachment(req.params.id, file);
      attachments.push(attachment);
    }

    res.status(201).json({ success: true, data: attachments });
  } catch (error) {
    console.error('Upload attachments error:', error);
    res.status(500).json({ success: false, error: 'Failed to upload attachments' });
  }
});

router.get('/:id/flow-records', async (req: Request, res: Response): Promise<void> => {
  try {
    const records = await flowControl.getFlowRecords(req.params.id);
    res.json({ success: true, data: records });
  } catch (error) {
    console.error('Fetch flow records error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch flow records' });
  }
});

export default router;
