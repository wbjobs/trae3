const express = require('express');
const { allQuery, runQuery, getQuery } = require('../database');
const { VALID_LEVEL_NAMES } = require('../utils/logFilter');

const VALID_QUERY_LEVELS = new Set(VALID_LEVEL_NAMES);

const createLogRouter = ({ db, logFilter, partitionManager }) => {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const {
        page = 1,
        pageSize = 50,
        level,
        terminalId,
        module,
        keyword,
        startTime,
        endTime,
      } = req.query;

      const conditions = [];
      const params = [];

      if (level && VALID_QUERY_LEVELS.has(level)) {
        conditions.push('l.level = ?');
        params.push(level);
      }
      if (terminalId) {
        conditions.push('l.terminal_id = ?');
        params.push(terminalId);
      }
      if (module) {
        conditions.push('l.module = ?');
        params.push(module);
      }
      if (keyword) {
        conditions.push('l.message LIKE ?');
        params.push(`%${keyword}%`);
      }

      const startDate = startTime ? new Date(startTime).toISOString().split('T')[0] : undefined;
      const endDate = endTime ? new Date(endTime).toISOString().split('T')[0] : undefined;

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

  router.get('/statistics', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      let whereClause = '';
      const params = [];

      if (startDate) {
        whereClause += 'WHERE date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        whereClause += whereClause ? ' AND date <= ?' : 'WHERE date <= ?';
        params.push(endDate);
      }

      const stats = await allQuery(`
        SELECT * FROM log_statistics
        ${whereClause}
        ORDER BY date DESC
        LIMIT 30
      `, params);

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/levels', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const levels = await partitionManager.getLevelStats({ startDate, endDate });
      res.json(levels);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/modules', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const modules = await partitionManager.getModules({ startDate, endDate });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/filter-config', (req, res) => {
    res.json(logFilter.getConfig());
  });

  router.put('/filter-config', (req, res) => {
    try {
      const { globalLevel, terminalOverrides, moduleFilters, keywordFilters } = req.body;

      if (globalLevel !== undefined) {
        if (!logFilter.setGlobalLevel(globalLevel)) {
          return res.status(400).json({ error: `无效的日志级别: ${globalLevel}` });
        }
      }

      if (terminalOverrides !== undefined) {
        logFilter.clearTerminalOverrides();
        if (typeof terminalOverrides === 'object' && terminalOverrides !== null) {
          Object.entries(terminalOverrides).forEach(([terminalId, level]) => {
            logFilter.setTerminalLevel(terminalId, level);
          });
        }
      }

      if (moduleFilters !== undefined) {
        logFilter.setModuleFilters(moduleFilters);
      }

      if (keywordFilters !== undefined) {
        logFilter.setKeywordFilters(keywordFilters);
      }

      res.json(logFilter.getConfig());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/timeline', async (req, res) => {
    try {
      const { terminalId, startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ error: '必须指定startDate和endDate' });
      }

      const timeline = await partitionManager.getTimelineData(
        terminalId || null,
        startDate,
        endDate
      );

      res.json(timeline);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/clear', async (req, res) => {
    try {
      const { olderThanDays } = req.body;
      const days = olderThanDays || 90;
      const result = await partitionManager.cleanup(days);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

module.exports = { createLogRouter };