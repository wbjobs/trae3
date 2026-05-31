const express = require('express');
const { validateArchive, validateSearch } = require('../validators/archiveValidator');
const { generateArchiveNumber, validateArchiveRules, getKeywordsFromContent, CATEGORY_CODES } = require('../rules/catalogRules');
const { getQuery, allQuery, runQuery } = require('../config/database');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const validation = validateArchive(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const rulesValidation = validateArchiveRules(req.body);
    if (!rulesValidation.valid) {
      return res.status(400).json({ success: false, errors: rulesValidation.errors });
    }

    const {
      title, archiveNumber, category, retentionPeriod, description,
      creator, creationDate, department, keywords
    } = req.body;

    const existing = await getQuery(
      'SELECT id FROM archives WHERE archive_number = ?',
      [archiveNumber]
    );

    if (existing) {
      return res.status(400).json({ success: false, errors: ['档案编号已存在'] });
    }

    const autoKeywords = getKeywordsFromContent(title, description || '');
    const allKeywords = [...new Set([...(keywords || []), ...autoKeywords])];

    const result = await runQuery(`
      INSERT INTO archives (
        archive_number, title, category, retention_period, description,
        creator, creation_date, department, keywords
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      archiveNumber, title, category, retentionPeriod, description,
      creator, creationDate, department, JSON.stringify(allKeywords)
    ]);

    await runQuery(
      'INSERT INTO operation_logs (archive_id, operation, operator, details) VALUES (?, ?, ?, ?)',
      [result.lastID, '创建档案', creator, `创建档案: ${title}`]
    );

    res.json({
      success: true,
      data: {
        id: result.lastID,
        archiveNumber
      }
    });
  } catch (error) {
    console.error('创建档案错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

router.get('/number/generate', async (req, res) => {
  try {
    const { category } = req.query;
    const year = new Date().getFullYear();

    const categoryCode = CATEGORY_CODES[category] || 'QT';
    const prefix = `${categoryCode}-${year}-`;

    const result = await getQuery(
      "SELECT archive_number FROM archives WHERE archive_number LIKE ? ORDER BY archive_number DESC LIMIT 1",
      [`${prefix}%`]
    );

    let sequence = 1;
    if (result && result.archive_number) {
      const parts = result.archive_number.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    const archiveNumber = generateArchiveNumber(category, year, sequence);

    res.json({
      success: true,
      data: { archiveNumber }
    });
  } catch (error) {
    console.error('生成编号错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

router.get('/', async (req, res) => {
  try {
    const validation = validateSearch(req.query);
    if (!validation.valid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const { keyword, category, startDate, endDate, page, pageSize } = validation.data;

    let whereClauses = [];
    let params = [];

    if (keyword) {
      whereClauses.push('(title LIKE ? OR archive_number LIKE ? OR description LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    if (startDate) {
      whereClauses.push('creation_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push('creation_date <= ?');
      params.push(endDate);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM archives ${whereSQL}`,
      params
    );

    const offset = (page - 1) * pageSize;
    const archives = await allQuery(
      `SELECT * FROM archives ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const processedArchives = archives.map(archive => ({
      id: archive.id,
      archiveNumber: archive.archive_number,
      title: archive.title,
      category: archive.category,
      retentionPeriod: archive.retention_period,
      description: archive.description,
      creator: archive.creator,
      creationDate: archive.creation_date,
      department: archive.department,
      keywords: JSON.parse(archive.keywords || '[]'),
      fileName: archive.file_name,
      fileOriginalName: archive.file_original_name,
      fileSize: archive.file_size,
      fileType: archive.file_type,
      filePath: archive.file_path,
      reviewStatus: archive.review_status,
      reviewer: archive.reviewer,
      reviewComment: archive.review_comment,
      reviewedAt: archive.reviewed_at,
      status: archive.status,
      createdAt: archive.created_at
    }));

    res.json({
      success: true,
      data: {
        list: processedArchives,
        total: countResult.total,
        page,
        pageSize,
        totalPages: Math.ceil(countResult.total / pageSize)
      }
    });
  } catch (error) {
    console.error('查询错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [req.params.id]);

    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    res.json({
      success: true,
      data: {
        id: archive.id,
        archiveNumber: archive.archive_number,
        title: archive.title,
        category: archive.category,
        retentionPeriod: archive.retention_period,
        description: archive.description,
        creator: archive.creator,
        creationDate: archive.creation_date,
        department: archive.department,
        keywords: JSON.parse(archive.keywords || '[]'),
        fileName: archive.file_name,
        fileOriginalName: archive.file_original_name,
        fileSize: archive.file_size,
        fileType: archive.file_type,
        filePath: archive.file_path,
        reviewStatus: archive.review_status,
        reviewer: archive.reviewer,
        reviewComment: archive.review_comment,
        reviewedAt: archive.reviewed_at,
        status: archive.status,
        createdAt: archive.created_at
      }
    });
  } catch (error) {
    console.error('查询错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const validation = validateArchive(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, errors: validation.errors });
    }

    const archive = await getQuery('SELECT id FROM archives WHERE id = ?', [req.params.id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    const {
      title, archiveNumber, category, retentionPeriod, description,
      creator, creationDate, department, keywords
    } = req.body;

    const existing = await getQuery(
      'SELECT id FROM archives WHERE archive_number = ? AND id != ?',
      [archiveNumber, req.params.id]
    );

    if (existing) {
      return res.status(400).json({ success: false, errors: ['档案编号已存在'] });
    }

    await runQuery(`
      UPDATE archives SET
        title = ?, category = ?, retention_period = ?, description = ?,
        creator = ?, creation_date = ?, department = ?, keywords = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      title, category, retentionPeriod, description,
      creator, creationDate, department, JSON.stringify(keywords || []),
      req.params.id
    ]);

    res.json({ success: true, message: '更新成功' });
  } catch (error) {
    console.error('更新错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [req.params.id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    await runQuery('DELETE FROM archives WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('删除错误:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

module.exports = router;
