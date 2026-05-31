import express from 'express';
import dataStore from '../data/store.js';

const router = express.Router();

router.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 10;
  const keyword = req.query.keyword as string;
  const fileType = req.query.fileType ? (req.query.fileType as string).split(',') : undefined;
  const status = req.query.status ? (req.query.status as string).split(',') : undefined;
  const coordinateSystem = req.query.coordinateSystem ? (req.query.coordinateSystem as string).split(',') : undefined;
  const scale = req.query.scale ? (req.query.scale as string).split(',') : undefined;
  
  const filtered = dataStore.searchArchives({
    keyword,
    fileType,
    status,
    coordinateSystem,
    scale
  });
  
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  
  res.json({
    success: true,
    data: {
      list: filtered.slice(start, end),
      total: filtered.length,
      page,
      pageSize
    }
  });
});

router.get('/statistics', (req, res) => {
  const stats = dataStore.getStatistics();
  
  res.json({
    success: true,
    data: stats
  });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const archive = dataStore.getArchiveById(id);
  
  if (!archive) {
    return res.status(404).json({
      success: false,
      message: '档案不存在'
    });
  }
  
  res.json({
    success: true,
    data: archive
  });
});

router.get('/:id/download', (req, res) => {
  const { id } = req.params;
  const archive = dataStore.getArchiveById(id);
  
  if (!archive) {
    return res.status(404).json({
      success: false,
      message: '档案不存在'
    });
  }
  
  if (archive.status !== 'APPROVED') {
    return res.status(400).json({
      success: false,
      message: '档案未通过质检，无法下载'
    });
  }
  
  res.json({
    success: true,
    data: {
      downloadUrl: archive.filePath || `/api/download/${archive.fileName}`,
      filePath: archive.filePath,
      fileName: archive.fileName
    }
  });
});

router.get('/:id/history', (req, res) => {
  const { id } = req.params;
  const records = dataStore.getQualityRecordsByArchiveId(id);
  
  res.json({
    success: true,
    data: records
  });
});

export default router;
