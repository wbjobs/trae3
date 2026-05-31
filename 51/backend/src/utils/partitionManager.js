const { runQuery, allQuery, getQuery } = require('../database');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

class PartitionManager {
  constructor() {
    this.knownTables = new Set();
    this.archivePath = process.env.ARCHIVE_PATH || './database/archive';
    this.retentionDays = parseInt(process.env.LOG_RETENTION_DAYS) || 90;
  }

  async initialize() {
    await this.discoverExistingTables();
    await this.ensureTodayTable();
    logger.info(`分区管理器初始化完成, 已知分区: ${this.knownTables.size}`);
  }

  async discoverExistingTables() {
    const tables = await allQuery(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name LIKE 'logs_%' 
      ORDER BY name
    `);
    tables.forEach(t => this.knownTables.add(t.name));
  }

  async ensureTodayTable() {
    const today = new Date().toISOString().split('T')[0];
    const tableName = `logs_${today}`;
    if (!this.knownTables.has(tableName)) {
      await this.ensureLogTable(today);
    }
  }

  async ensureLogTable(dateStr) {
    const tableName = `logs_${dateStr}`;
    if (this.knownTables.has(tableName)) return;

    await runQuery(`CREATE TABLE IF NOT EXISTS ${tableName} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      terminal_id TEXT,
      level TEXT NOT NULL CHECK(level IN ('debug','info','warning','error','critical')),
      module TEXT,
      message TEXT NOT NULL,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_terminal ON ${tableName}(terminal_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_level ON ${tableName}(level)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_timestamp ON ${tableName}(timestamp)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_${tableName}_term_ts ON ${tableName}(terminal_id, timestamp DESC)`);

    this.knownTables.add(tableName);
    logger.info(`创建日志分区表: ${tableName}`);
  }

  async ensureTablesForRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const dates = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dates.push(dateStr);
      await this.ensureLogTable(dateStr);
    }

    return dates;
  }

  getTableNamesForRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const tables = [];

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const tableName = `logs_${dateStr}`;
      if (this.knownTables.has(tableName)) {
        tables.push(tableName);
      }
    }

    return tables;
  }

  async queryLogs({ startDate, endDate, conditions = [], params = [], orderBy = 'timestamp DESC', limit = 50, offset = 0 }) {
    const effectiveStart = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const effectiveEnd = endDate || new Date().toISOString().split('T')[0];

    const tables = this.getTableNamesForRange(effectiveStart, effectiveEnd);

    if (tables.length === 0) {
      return { data: [], pagination: { page: 1, pageSize: limit, total: 0, totalPages: 0 } };
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const unionParts = tables.map(table => {
      return `SELECT l.*, t.name as terminal_name, t.vehicle_number 
              FROM ${table} l 
              LEFT JOIN terminals t ON l.terminal_id = t.id 
              ${whereClause}`;
    });

    const unionSql = unionParts.join(' UNION ALL ');
    const countSql = `SELECT COUNT(*) as total FROM (${unionSql})`;
    const dataSql = `SELECT * FROM (${unionSql}) ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

    const countResult = await getQuery(countSql, params);
    const rows = await allQuery(dataSql, [...params, limit, offset]);

    return {
      data: rows.map(row => ({
        ...row,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
      })),
      pagination: {
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit),
      },
    };
  }

  async getLevelStats({ startDate, endDate }) {
    const tables = this.getTableNamesForRange(
      startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate || new Date().toISOString().split('T')[0]
    );

    if (tables.length === 0) return [];

    const unionParts = tables.map(table => `SELECT level, COUNT(*) as count FROM ${table} GROUP BY level`);
    const sql = `SELECT level, SUM(count) as count FROM (${unionParts.join(' UNION ALL ')}) GROUP BY level`;
    return allQuery(sql);
  }

  async getModules({ startDate, endDate }) {
    const tables = this.getTableNamesForRange(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate || new Date().toISOString().split('T')[0]
    );

    if (tables.length === 0) return [];

    const unionParts = tables.map(table => `SELECT DISTINCT module FROM ${table} WHERE module IS NOT NULL`);
    const sql = `SELECT DISTINCT module FROM (${unionParts.join(' UNION ALL ')}) ORDER BY module`;
    const rows = await allQuery(sql);
    return rows.map(r => r.module);
  }

  async cleanup(retentionDays) {
    const days = retentionDays || this.retentionDays;
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    let deletedCount = 0;
    const toDelete = [];

    for (const tableName of this.knownTables) {
      const dateStr = tableName.replace('logs_', '');
      if (dateStr < cutoffStr) {
        toDelete.push(tableName);
      }
    }

    for (const tableName of toDelete) {
      try {
        const count = await getQuery(`SELECT COUNT(*) as cnt FROM ${tableName}`);
        deletedCount += count.cnt;
        await runQuery(`DROP TABLE IF EXISTS ${tableName}`);
        this.knownTables.delete(tableName);
        logger.info(`删除过期分区: ${tableName}, ${count.cnt} 条记录`);
      } catch (error) {
        logger.error(`删除分区 ${tableName} 失败:`, error.message);
      }
    }

    return { deletedTables: toDelete.length, deletedRecords: deletedCount };
  }

  async getTimelineData(terminalId, startDate, endDate) {
    const tables = this.getTableNamesForRange(
      startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate || new Date().toISOString().split('T')[0]
    );

    if (tables.length === 0) return [];

    const conditions = terminalId ? [`terminal_id = ?`] : [];
    const params = terminalId ? [terminalId] : [];

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const unionParts = tables.map(table => {
      return `SELECT terminal_id, level, module, message, timestamp, metadata FROM ${table} ${whereClause}`;
    });

    const sql = `${unionParts.join(' UNION ALL ')} ORDER BY timestamp ASC`;
    const rows = await allQuery(sql, params);

    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
    }));
  }

  getPartitionInfo() {
    const partitions = [];
    for (const tableName of this.knownTables) {
      const dateStr = tableName.replace('logs_', '');
      partitions.push({ tableName, date: dateStr });
    }
    return partitions.sort((a, b) => a.date.localeCompare(b.date));
  }
}

module.exports = { PartitionManager };