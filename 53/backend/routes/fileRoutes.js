const express = require('express');
const { upload, uploadTemp, moveFileToCategory, getFilePath, deleteFile, filesDir } = require('../utils/fileStorage');
const { getQuery, runQuery } = require('../config/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

router.post('/:archiveId', uploadTemp.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未上传文件' });
    }

    const archive = await getQuery('SELECT id, category FROM archives WHERE id = ?', [req.params.archiveId]);
    if (!archive) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    const relativePath = moveFileToCategory(req.file.filename, archive.category);

    await runQuery(`
      UPDATE archives SET
        file_name = ?,
        file_original_name = ?,
        file_size = ?,
        file_type = ?,
        file_path = ?
      WHERE id = ?
    `, [
      req.file.filename,
      req.file.originalname,
      req.file.size,
      req.file.mimetype,
      relativePath,
      req.params.archiveId
    ]);

    res.json({
      success: true,
      data: {
        fileName: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        relativePath
      }
    });
  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ success: false, error: '上传失败' });
  }
});

router.get('/:archiveId/download', async (req, res) => {
  try {
    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [req.params.archiveId]);
    if (!archive || !archive.file_path) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const filePath = getFilePath(archive.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    res.download(filePath, archive.file_original_name);
  } catch (error) {
    console.error('下载错误:', error);
    res.status(500).json({ success: false, error: '下载失败' });
  }
});

router.get('/:archiveId/preview', async (req, res) => {
  try {
    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [req.params.archiveId]);
    if (!archive || !archive.file_path) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const filePath = getFilePath(archive.file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: '文件不存在' });
    }

    const ext = path.extname(archive.file_original_name).toLowerCase();
    const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
    const isPdf = ext === '.pdf';
    const isText = ['.txt'].includes(ext);

    if (isImage || isPdf) {
      res.sendFile(filePath);
    } else if (isText) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.type('text/plain').send(content);
    } else {
      res.json({
        success: false,
        error: '该文件类型不支持预览，请下载后查看'
      });
    }
  } catch (error) {
    console.error('预览错误:', error);
    res.status(500).json({ success: false, error: '预览失败' });
  }
});

router.delete('/:archiveId', async (req, res) => {
  try {
    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [req.params.archiveId]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    if (archive.file_path) {
      deleteFile(archive.file_path);
    }

    await runQuery(`
      UPDATE archives SET
        file_name = NULL,
        file_original_name = NULL,
        file_size = NULL,
        file_type = NULL,
        file_path = NULL
      WHERE id = ?
    `, [req.params.archiveId]);

    res.json({ success: true, message: '文件删除成功' });
  } catch (error) {
    console.error('删除错误:', error);
    res.status(500).json({ success: false, error: '删除失败' });
  }
});

module.exports = router;
