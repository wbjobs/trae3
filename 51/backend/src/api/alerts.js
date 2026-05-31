const express = require('express');
const { allQuery, runQuery, getQuery } = require('../database');

const createAlertRouter = ({ db, alertEngine }) => {
  const router = express.Router();

  router.get('/rules', (req, res) => {
    res.json(alertEngine.getRules());
  });

  router.get('/rules/:id', (req, res) => {
    const rule = alertEngine.getRule(req.params.id);
    if (!rule) return res.status(404).json({ error: '规则不存在' });
    res.json(rule);
  });

  router.post('/rules', (req, res) => {
    try {
      const { name, type, keywords, levels, modules, terminalIds, enabled, cooldown } = req.body;
      if (!name) return res.status(400).json({ error: '规则名称不能为空' });
      if (type === 'keyword' && (!keywords || keywords.length === 0)) {
        return res.status(400).json({ error: '关键词规则必须指定关键词' });
      }

      const rule = alertEngine.addRule({
        name,
        type: type || 'keyword',
        keywords: keywords || [],
        levels: levels || [],
        modules: modules || [],
        terminalIds: terminalIds || [],
        enabled: enabled !== false,
        cooldown: cooldown || 60,
      });

      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/rules/:id', (req, res) => {
    try {
      const rule = alertEngine.updateRule(req.params.id, req.body);
      if (!rule) return res.status(404).json({ error: '规则不存在' });
      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/rules/:id', (req, res) => {
    const success = alertEngine.removeRule(req.params.id);
    if (!success) return res.status(404).json({ error: '规则不存在' });
    res.json({ success: true });
  });

  router.get('/', async (req, res) => {
    try {
      const { page = 1, pageSize = 50, resolved, level } = req.query;
      const offset = (page - 1) * pageSize;

      const conditions = [];
      const params = [];

      if (resolved !== undefined) {
        conditions.push('resolved = ?');
        params.push(parseInt(resolved));
      }
      if (level) {
        conditions.push('level = ?');
        params.push(level);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const alerts = await allQuery(`
        SELECT * FROM alerts
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(pageSize), parseInt(offset)]);

      const countResult = await getQuery(`
        SELECT COUNT(*) as total FROM alerts ${whereClause}
      `, params);

      res.json({
        data: alerts,
        pagination: {
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          total: countResult.total,
          totalPages: Math.ceil(countResult.total / pageSize),
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/:id/resolve', async (req, res) => {
    try {
      await runQuery(`
        UPDATE alerts SET resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/statistics', async (req, res) => {
    try {
      const stats = await getQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved,
          SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_count,
          SUM(CASE WHEN level = 'critical' AND resolved = 0 THEN 1 ELSE 0 END) as critical_unresolved,
          SUM(CASE WHEN level = 'error' AND resolved = 0 THEN 1 ELSE 0 END) as error_unresolved
        FROM alerts
      `);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = { createAlertRouter };