const express = require('express');
const { allQuery, runQuery, getQuery } = require('../database');
const { VALID_LEVEL_NAMES } = require('../utils/logFilter');

const VALID_QUERY_LEVELS = new Set(VALID_LEVEL_NAMES);

const createTerminalRouter = ({ db, partitionManager }) => {
  const router = express.Router();

  router.get('/statistics/summary', async (req, res) => {
    try {
      const summary = await getQuery(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online,
          SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline
        FROM terminals
      `);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const { status, page = 1, pageSize = 100 } = req.query;
      const offset = (page - 1) * pageSize;

      let whereClause = '';
      const params = [];

      if (status) {
        whereClause = 'WHERE status = ?';
        params.push(status);
      }

      const terminals = await allQuery(`
        SELECT * FROM terminals
        ${whereClause}
        ORDER BY last_online DESC
        LIMIT ? OFFSET ?
      `, [...params, parseInt(pageSize), parseInt(offset)]);

      const countResult = await getQuery(`
        SELECT COUNT(*) as total FROM terminals
        ${whereClause}
      `, params);

      res.json({
        data: terminals,
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

  router.post('/', async (req, res) => {
    try {
      const { id, name, vehicle_number } = req.body;

      if (!id) {
        return res.status(400).json({ error: '终端ID不能为空' });
      }

      await runQuery(`
        INSERT INTO terminals (id, name, vehicle_number, created_at, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = ?,
          vehicle_number = ?,
          updated_at = CURRENT_TIMESTAMP
      `, [id, name, vehicle_number, name, vehicle_number]);

      const terminal = await getQuery('SELECT * FROM terminals WHERE id = ?', [id]);
      res.json(terminal);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const terminal = await getQuery('SELECT * FROM terminals WHERE id = ?', [id]);

      if (!terminal) {
        return res.status(404).json({ error: '终端不存在' });
      }

      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const tables = partitionManager.getTableNamesForRange(weekAgo, today);
      let logStats = { total_logs: 0, error_count: 0, warning_count: 0, critical_count: 0, last_log_time: null };

      if (tables.length > 0) {
        const unionParts = tables.map(t => `SELECT level, timestamp FROM ${t} WHERE terminal_id = ?`);
        const statsSql = `
          SELECT
            COUNT(*) as total_logs,
            SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as error_count,
            SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warning_count,
            SUM(CASE WHEN level = 'critical' THEN 1 ELSE 0 END) as critical_count,
            MAX(timestamp) as last_log_time
          FROM (${unionParts.join(' UNION ALL ')})
        `;
        const params = tables.map(() => id);
        logStats = await getQuery(statsSql, params) || logStats;
      }

      res.json({
        ...terminal,
        stats: logStats,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, vehicle_number } = req.body;

      const result = await runQuery(`
        UPDATE terminals
        SET name = ?, vehicle_number = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [name, vehicle_number, id]);

      if (result.changes === 0) {
        return res.status(404).json({ error: '终端不存在' });
      }

      const terminal = await getQuery('SELECT * FROM terminals WHERE id = ?', [id]);
      res.json(terminal);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      await runQuery('DELETE FROM logs WHERE terminal_id = ?', [id]);
      const result = await runQuery('DELETE FROM terminals WHERE id = ?', [id]);

      if (result.changes === 0) {
        return res.status(404).json({ error: '终端不存在' });
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/:id/logs', async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, pageSize = 50, level, module, keyword, startTime, endTime } = req.query;

      const conditions = ['l.terminal_id = ?'];
      const params = [id];

      if (level && VALID_QUERY_LEVELS.has(level)) {
        conditions.push('l.level = ?');
        params.push(level);
      }
      if (module) {
        conditions.push('l.module = ?');
        params.push(module);
      }
      if (keyword) {
        conditions.push('l.message LIKE ?');
        params.push(`%${keyword}%`);
      }

      const startDate = startTime ? new Date(startTime).toISOString().split('T')[0] : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = endTime ? new Date(endTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

      if (startTime) {
        conditions.push('l.timestamp >= ?');
        params.push(startTime);
      }
      if (endTime) {
        conditions.push('l.timestamp <= ?');
        params.push(endTime);
      }

      const offset = (page - 1) * pageSize;

      const result = await partitionManager.queryLogs({
        startDate,
        endDate,
        conditions,
        params,
        limit: parseInt(pageSize),
        offset,
      });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = { createTerminalRouter };