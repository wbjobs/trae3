import express from 'express';
import type { QualityRecord, QualityResult } from '../../shared/types.js';
import dataStore from '../data/store.js';
import ProcessControlService, { BatchQualityResult, QualityReport } from '../services/processControl.js';

const router = express.Router();

router.get('/pending', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  
  const pending = ProcessControlService.getPendingArchives();
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  res.json({
    success: true,
    data: {
      list: pending.slice(start, end),
      total: pending.length,
      page,
      pageSize
    }
  });
});

router.get('/checked', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  
  const checked = ProcessControlService.getCheckedArchives();
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  res.json({
    success: true,
    data: {
      list: checked.slice(start, end),
      total: checked.length,
      page,
      pageSize
    }
  });
});

router.post('/:id/check', (req, res) => {
  const { id } = req.params;
  const { result, comments, issues, inspector } = req.body;
  
  if (!result || !inspector) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数：result, inspector'
    });
  }

  const archive = dataStore.getArchiveById(id);
  if (!archive) {
    return res.status(404).json({
      success: false,
      message: '档案不存在'
    });
  }

  const checkResult = ProcessControlService.submitQualityCheck(
    id,
    result as QualityResult,
    inspector,
    issues || [],
    comments || ''
  );

  if (!checkResult) {
    return res.status(400).json({
      success: false,
      message: '档案状态不允许质检操作'
    });
  }

  res.json({
    success: true,
    data: checkResult
  });
});

router.post('/batch/check', async (req, res) => {
  const { archiveIds, result, inspector, comments } = req.body;
  
  if (!archiveIds || !Array.isArray(archiveIds) || archiveIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: '请选择要审核的档案'
    });
  }

  if (!result || !inspector) {
    return res.status(400).json({
      success: false,
      message: '缺少必要参数：result, inspector'
    });
  }

  const batchResult = await ProcessControlService.batchQualityCheck(
    archiveIds,
    result as QualityResult,
    inspector,
    comments || ''
  );

  res.json({
    success: true,
    data: batchResult
  });
});

router.get('/report/generate', (req, res) => {
  const { inspector, format } = req.query;
  
  const report = ProcessControlService.generateQualityReport(
    undefined,
    inspector as string
  );

  if (format === 'html') {
    const html = ProcessControlService.generateReportHtml(report);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    return;
  }

  res.json({
    success: true,
    data: report
  });
});

router.get('/report/download', (req, res) => {
  const { inspector, format } = req.query;
  
  const report = ProcessControlService.generateQualityReport(
    undefined,
    inspector as string
  );

  const html = ProcessControlService.generateReportHtml(report);
  
  if (format === 'html') {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="quality-report-${report.reportId}.html"`);
    res.send(Buffer.from(html, 'utf-8'));
    return;
  }

  res.json({
    success: true,
    data: {
      reportId: report.reportId,
      htmlContent: html
    }
  });
});

router.get('/:id/records', (req, res) => {
  const { id } = req.params;
  const records = dataStore.getQualityRecordsByArchiveId(id);
  
  res.json({
    success: true,
    data: records
  });
});

router.get('/records', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  
  const records: QualityRecord[] = [];
  for (const archive of dataStore.getArchives()) {
    records.push(...dataStore.getQualityRecordsByArchiveId(archive.id));
  }
  
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  res.json({
    success: true,
    data: {
      list: records.slice(start, end),
      total: records.length,
      page,
      pageSize
    }
  });
});

export default router;
