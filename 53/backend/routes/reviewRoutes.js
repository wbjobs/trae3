const express = require('express');
const { getQuery, runQuery, allQuery } = require('../config/database');

const router = express.Router();

const REVIEW_STATUSES = ['待审核', '审核通过', '审核驳回', '已归档'];
const REVIEW_ACTIONS = ['submit', 'approve', 'reject', 'archive'];

router.get('/', async (req, res) => {
  try {
    const { status, page = 1, pageSize = 20, keyword } = req.query;
    const offset = (page - 1) * pageSize;

    let whereClauses = [];
    let params = [];

    if (status && status !== 'all') {
      whereClauses.push('review_status = ?');
      params.push(status);
    }

    if (keyword) {
      whereClauses.push('(title LIKE ? OR archive_number LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const archives = await allQuery(`
      SELECT * FROM archives ${whereSQL} ORDER BY created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(pageSize), offset]);

    const countResult = await getQuery(
      `SELECT COUNT(*) as total FROM archives ${whereSQL}`,
      params
    );

    const processedArchives = archives.map(archive => ({
      id: archive.id,
      archiveNumber: archive.archive_number,
      title: archive.title,
      category: archive.category,
      retentionPeriod: archive.retention_period,
      creator: archive.creator,
      creationDate: archive.creation_date,
      department: archive.department,
      reviewStatus: archive.review_status,
      reviewer: archive.reviewer,
      reviewComment: archive.review_comment,
      reviewedAt: archive.reviewed_at,
      createdAt: archive.created_at
    }));

    res.json({
      success: true,
      data: {
        list: processedArchives,
        total: countResult.total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('查询待审核列表错误:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.post('/:id/submit', async (req, res) => {
  try {
    const { id } = req.params;
    const { operator = '系统' } = req.body;

    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    if (archive.review_status !== '待审核') {
      return res.status(400).json({ success: false, error: '当前状态不支持提交审核' });
    }

    await runQuery(`
      UPDATE archives SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, ['待审核', id]);

    await runQuery(`
      INSERT INTO review_logs (archive_id, reviewer, action, comment) VALUES (?, ?, ?, ?)
    `, [id, operator, 'submit', '提交审核']);

    res.json({ success: true, message: '提交审核成功' });
  } catch (error) {
    console.error('提交审核错误:', error);
    res.status(500).json({ success: false, error: '提交失败' });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewer = '审核员', comment = '' } = req.body;

    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    if (!['待审核', '审核驳回'].includes(archive.review_status)) {
      return res.status(400).json({ success: false, error: '当前状态不支持审核通过' });
    }

    await runQuery(`
      UPDATE archives SET 
        review_status = ?, 
        reviewer = ?, 
        review_comment = ?, 
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, ['审核通过', reviewer, comment, id]);

    await runQuery(`
      INSERT INTO review_logs (archive_id, reviewer, action, comment) VALUES (?, ?, ?, ?)
    `, [id, reviewer, 'approve', comment || '审核通过']);

    res.json({ success: true, message: '审核通过' });
  } catch (error) {
    console.error('审核通过错误:', error);
    res.status(500).json({ success: false, error: '审核失败' });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { reviewer = '审核员', comment = '' } = req.body;

    if (!comment) {
      return res.status(400).json({ success: false, error: '驳回原因不能为空' });
    }

    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    if (archive.review_status !== '待审核') {
      return res.status(400).json({ success: false, error: '当前状态不支持驳回' });
    }

    await runQuery(`
      UPDATE archives SET 
        review_status = ?, 
        reviewer = ?, 
        review_comment = ?, 
        reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, ['审核驳回', reviewer, comment, id]);

    await runQuery(`
      INSERT INTO review_logs (archive_id, reviewer, action, comment) VALUES (?, ?, ?, ?)
    `, [id, reviewer, 'reject', comment]);

    res.json({ success: true, message: '审核驳回' });
  } catch (error) {
    console.error('审核驳回错误:', error);
    res.status(500).json({ success: false, error: '审核失败' });
  }
});

router.post('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const { operator = '系统' } = req.body;

    const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [id]);
    if (!archive) {
      return res.status(404).json({ success: false, error: '档案不存在' });
    }

    if (archive.review_status !== '审核通过') {
      return res.status(400).json({ success: false, error: '请先通过审核再归档' });
    }

    await runQuery(`
      UPDATE archives SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, ['已归档', id]);

    await runQuery(`
      INSERT INTO review_logs (archive_id, reviewer, action, comment) VALUES (?, ?, ?, ?)
    `, [id, operator, 'archive', '档案已归档']);

    res.json({ success: true, message: '归档成功' });
  } catch (error) {
    console.error('归档错误:', error);
    res.status(500).json({ success: false, error: '归档失败' });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const { id } = req.params;

    const logs = await allQuery(`
      SELECT * FROM review_logs WHERE archive_id = ? ORDER BY created_at DESC
    `, [id]);

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('查询审核日志错误:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await allQuery(`
      SELECT review_status as status, COUNT(*) as count 
      FROM archives 
      GROUP BY review_status
    `);

    const result = {
      '待审核': 0,
      '审核通过': 0,
      '审核驳回': 0,
      '已归档': 0
    };

    stats.forEach(item => {
      result[item.status] = item.count;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('查询统计错误:', error);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

router.post('/batch/approve', async (req, res) => {
  try {
    const { ids, reviewer = '审核员', comment = '批量审核通过' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要审核的档案' });
    }

    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const archive = await getQuery('SELECT * FROM archives WHERE id = ?', [id]);
        if (!archive) {
          failCount++;
          continue;
        }

        if (!['待审核', '审核驳回'].includes(archive.review_status)) {
          failCount++;
          continue;
        }

        await runQuery(`
          UPDATE archives SET 
            review_status = ?, 
            reviewer = ?, 
            review_comment = ?, 
            reviewed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, ['审核通过', reviewer, comment, id]);

        await runQuery(`
          INSERT INTO review_logs (archive_id, reviewer, action, comment) VALUES (?, ?, ?, ?)
        `, [id, reviewer, 'approve', comment]);

        successCount++;
      } catch {
        failCount++;
      }
    }

    res.json({
      success: true,
      data: { successCount, failCount, total: ids.length },
      message: `批量审核完成：成功${successCount}条，失败${failCount}条`
    });
  } catch (error) {
    console.error('批量审核错误:', error);
    res.status(500).json({ success: false, error: '批量审核失败' });
  }
});

module.exports = router;
