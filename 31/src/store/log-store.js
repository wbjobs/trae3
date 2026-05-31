const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const config = require('../../config');

class LogStore {
  constructor(options = {}) {
    this.dbPath = options.dbPath || config.database.dbPath;
    this.db = null;
    this._writeBuffer = [];
    this._bufferSize = options.bufferSize || 100;
    this._flushInterval = options.flushInterval || 3000;
    this._flushTimer = null;
    this._dirty = false;
    this._persistTimer = null;
    this._flushing = false;
    this._flushErrors = 0;
    this._totalWritten = 0;
    this._errorHandler = options.onError || null;
  }

  async init() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }

    this.db.run('PRAGMA journal_mode = MEMORY');
    this.db.run('PRAGMA synchronous = OFF');

    this._createTables();
    this._startFlush();
    this._startPersist();

    return this;
  }

  _createTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        timestamp INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        terminal_type TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        level TEXT NOT NULL,
        level_value INTEGER NOT NULL,
        detail TEXT,
        tags TEXT,
        schema_version TEXT DEFAULT '1.0.0'
      );
    `);

    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs(trace_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_terminal_id ON logs(terminal_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level_value)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_source_type ON logs(source_type)');

    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_trace_time ON logs(trace_id, timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_terminal_time ON logs(terminal_id, timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_source_time ON logs(source_type, timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_level_time ON logs(level_value, timestamp)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_source_level ON logs(source_type, level_value)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_source_category ON logs(source_type, category)');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS terminals (
        terminal_id TEXT PRIMARY KEY,
        terminal_type TEXT NOT NULL,
        session_id TEXT,
        hardware_id TEXT,
        firmware_version TEXT,
        connected_at INTEGER,
        last_activity INTEGER,
        status TEXT DEFAULT 'offline',
        log_count INTEGER DEFAULT 0,
        metadata TEXT
      );
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_terminals_type ON terminals(terminal_type)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_terminals_status ON terminals(status)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_terminals_type_status ON terminals(terminal_type, status)');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS trace_links (
        link_id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        link_type TEXT,
        linked_sources TEXT,
        span_chain TEXT,
        linked_at INTEGER NOT NULL,
        correlation_id TEXT
      );
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_trace_links_trace_id ON trace_links(trace_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_trace_links_correlation ON trace_links(correlation_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_trace_links_time ON trace_links(linked_at)');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS log_aggregates (
        time_bucket INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        terminal_id TEXT NOT NULL,
        level_value INTEGER NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (time_bucket, source_type, terminal_id, level_value)
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS search_terms (
        term TEXT PRIMARY KEY,
        log_ids TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        last_updated INTEGER NOT NULL
      );
    `);
  }

  _startFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => this._flushBuffer(), this._flushInterval);
  }

  _startPersist() {
    if (this._persistTimer) return;
    this._persistTimer = setInterval(() => this._persist(), 10000);
  }

  _persist() {
    if (!this._dirty || !this.db) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this._dirty = false;
    } catch (_) {}
  }

  async insertLog(log) {
    const row = this._logToRow(log);
    this._writeBuffer.push(row);
    if (this._writeBuffer.length >= this._bufferSize) {
      await this._flushBuffer();
    }
  }

  async insertBatch(logs) {
    for (const log of logs) {
      this._writeBuffer.push(this._logToRow(log));
    }
    if (this._writeBuffer.length >= this._bufferSize) {
      await this._flushBuffer();
    }
  }

  async _flushBuffer() {
    if (this._writeBuffer.length === 0) return;
    if (this._flushing) return;
    this._flushing = true;

    const batch = this._writeBuffer.splice(0);
    let written = 0;
    const failed = [];

    for (const row of batch) {
      try {
        this.db.run(
          `INSERT OR IGNORE INTO logs
            (id, trace_id, span_id, parent_span_id, timestamp, received_at,
             source_type, terminal_id, terminal_type, category, action, level,
             level_value, detail, tags, schema_version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id, row.traceId, row.spanId, row.parentSpanId, row.timestamp,
            row.receivedAt, row.sourceType, row.terminalId, row.terminalType,
            row.category, row.action, row.level, row.levelValue, row.detail,
            row.tags, row.schemaVersion,
          ]
        );
        written++;
      } catch (err) {
        this._flushErrors++;
        failed.push(row);
        if (this._errorHandler) {
          this._errorHandler(err, row);
        }
      }
    }

    if (written > 0) {
      this._dirty = true;
      this._totalWritten += written;
      const successRows = batch.filter(r => !failed.includes(r));
      try {
        this._updateAggregates(successRows);
        this._updateSearchIndex(successRows);
      } catch (_) {}
    }

    if (failed.length > 0 && failed.length < batch.length) {
      this._writeBuffer.unshift(...failed);
    }

    this._flushing = false;
  }

  _logToRow(log) {
    return {
      id: log.id,
      traceId: log.traceId,
      spanId: log.spanId,
      parentSpanId: log.parentSpanId || null,
      timestamp: log.timestamp,
      receivedAt: log.receivedAt || Date.now(),
      sourceType: log.source?.type || log.source || 'unknown',
      terminalId: log.source?.terminalId || 'unknown',
      terminalType: log.source?.terminalType || 'unknown',
      category: log.category,
      action: log.action,
      level: log.level,
      levelValue: log.levelValue || 0,
      detail: JSON.stringify(log.detail || {}),
      tags: JSON.stringify(log.tags || []),
      schemaVersion: log.schemaVersion || '1.0.0',
    };
  }

  queryByTraceId(traceId) {
    this._flushBuffer();
    const results = this._query(
      'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC',
      [traceId]
    );
    return results.map(r => this._rowToLog(r));
  }

  queryByTerminalId(terminalId, limit = 100) {
    this._flushBuffer();
    const results = this._query(
      'SELECT * FROM logs WHERE terminal_id = ? ORDER BY timestamp DESC LIMIT ?',
      [terminalId, limit]
    );
    return results.map(r => this._rowToLog(r));
  }

  queryByTimeRange(startTime, endTime, options = {}) {
    this._flushBuffer();
    let sql = 'SELECT * FROM logs WHERE timestamp >= ? AND timestamp <= ?';
    const params = [startTime, endTime];

    if (options.sourceType) {
      sql += ' AND source_type = ?';
      params.push(options.sourceType);
    }
    if (options.level) {
      sql += ' AND level_value >= ?';
      params.push(options.level);
    }
    if (options.terminalId) {
      sql += ' AND terminal_id = ?';
      params.push(options.terminalId);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(options.limit || 500);

    const results = this._query(sql, params);
    return results.map(r => this._rowToLog(r));
  }

  queryTraceLinks(traceId) {
    this._flushBuffer();
    return this._query(
      'SELECT * FROM trace_links WHERE trace_id = ? ORDER BY linked_at DESC',
      [traceId]
    );
  }

  getLogStats() {
    this._flushBuffer();
    const totalResult = this._query('SELECT COUNT(*) as count FROM logs');
    const total = totalResult.length > 0 ? totalResult[0].count : 0;

    const bySource = this._query('SELECT source_type, COUNT(*) as count FROM logs GROUP BY source_type');
    const byLevel = this._query('SELECT level, COUNT(*) as count FROM logs GROUP BY level');
    const byTerminal = this._query('SELECT terminal_id, terminal_type, COUNT(*) as count FROM logs GROUP BY terminal_id ORDER BY count DESC LIMIT 20');

    return { total, bySource, byLevel, byTerminal };
  }

  upsertTerminal(meta) {
    this.db.run(
      `INSERT OR REPLACE INTO terminals
        (terminal_id, terminal_type, session_id, hardware_id, firmware_version,
         connected_at, last_activity, status, log_count, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        meta.terminalId, meta.terminalType, meta.sessionId || null,
        meta.hardwareId || null, meta.firmwareVersion || null,
        meta.connectedAt || Date.now(), meta.lastActivity || Date.now(),
        meta.status || 'online', meta.logCount || 0, JSON.stringify(meta),
      ]
    );
    this._dirty = true;
  }

  insertTraceLink(link) {
    this.db.run(
      `INSERT OR IGNORE INTO trace_links
        (link_id, trace_id, link_type, linked_sources, span_chain, linked_at, correlation_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        link.linkId, link.traceId, link.linkType || 'auto',
        JSON.stringify(link.linkedSources || []),
        JSON.stringify(link.spanChain || []),
        link.linkedAt || Date.now(), link.correlationId || null,
      ]
    );
    this._dirty = true;
  }

  _updateAggregates(rows) {
    const bucketSize = 60000;
    const aggregates = new Map();

    for (const row of rows) {
      const timeBucket = Math.floor(row.timestamp / bucketSize) * bucketSize;
      const key = `${timeBucket}:${row.sourceType}:${row.terminalId}:${row.levelValue}`;
      aggregates.set(key, (aggregates.get(key) || 0) + 1);
    }

    for (const [key, count] of aggregates) {
      const parts = key.split(':');
      const timeBucket = parseInt(parts[0], 10);
      const sourceType = parts[1];
      const terminalId = parts[2];
      const levelValue = parseInt(parts[3], 10);
      try {
        this.db.run(
          `INSERT INTO log_aggregates (time_bucket, source_type, terminal_id, level_value, count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(time_bucket, source_type, terminal_id, level_value)
           DO UPDATE SET count = count + ?`,
          [timeBucket, sourceType, terminalId, levelValue, count, count]
        );
        this._dirty = true;
      } catch (_) {}
    }
  }

  _updateSearchIndex(rows) {
    const terms = new Map();
    for (const row of rows) {
      const id = row.id;
      const searchFields = [
        row.category,
        row.action,
        row.level,
        row.sourceType,
        row.category + ':' + row.action,
      ];
      for (const field of searchFields) {
        if (!field) continue;
        const lower = field.toLowerCase();
        if (!terms.has(lower)) terms.set(lower, { ids: new Set(), count: 0 });
        terms.get(lower).ids.add(id);
        terms.get(lower).count++;
      }
    }

    const now = Date.now();
    for (const [term, data] of terms) {
      try {
        this.db.run(
          `INSERT INTO search_terms (term, log_ids, count, last_updated)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(term)
           DO UPDATE SET
             log_ids = log_ids || '|' || ?,
             count = count + ?,
             last_updated = ?`,
          [term, [...data.ids].join('|'), data.count, now, [...data.ids].join('|'), data.count, now]
        );
        this._dirty = true;
      } catch (_) {}
    }
  }

  searchLogs(keyword, options = {}) {
    this._flushBuffer();
    const lowerKw = keyword.toLowerCase();
    const searchResults = this._query(
      'SELECT log_ids, count FROM search_terms WHERE term LIKE ? ORDER BY count DESC LIMIT ?',
      [`%${lowerKw}%`, options.limit || 50]
    );

    const allIds = new Set();
    for (const r of searchResults) {
      if (r && r.log_ids) {
        r.log_ids.split('|').forEach(id => allIds.add(id));
      }
    }

    if (allIds.size === 0) {
      return this.queryByTimeRange(options.startTime || 0, options.endTime || Date.now(), {
        ...options,
        keyword,
      });
    }

    const idsList = [...allIds].slice(0, options.limit || 500);
    const placeholders = idsList.map(() => '?').join(',');
    const results = this._query(
      `SELECT * FROM logs WHERE id IN (${placeholders}) ORDER BY timestamp DESC`,
      idsList
    );

    return results.map(r => this._rowToLog(r));
  }

  getAggregatedStats(timeRange = 3600000) {
    this._flushBuffer();
    const endTime = Date.now();
    const startTime = endTime - timeRange;
    const bucketSize = 60000;
    const startBucket = Math.floor(startTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;

    const results = this._query(
      `SELECT time_bucket, source_type, terminal_id, level_value, count
       FROM log_aggregates
       WHERE time_bucket >= ? AND time_bucket <= ?
       ORDER BY time_bucket DESC`,
      [startBucket, endBucket]
    );

    return results;
  }

  queryByTraceId(traceId, options = {}) {
    this._flushBuffer();
    const sql = options.explain
      ? 'EXPLAIN QUERY PLAN SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC'
      : 'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC';
    const results = this._query(sql, [traceId]);
    if (options.explain) return results;
    return results.map(r => this._rowToLog(r));
  }

  queryByTerminalId(terminalId, limit = 100, options = {}) {
    this._flushBuffer();
    const startTime = options.startTime ? options.startTime : 0;
    const endTime = options.endTime ? options.endTime : Date.now();
    const results = this._query(
      'SELECT * FROM logs WHERE terminal_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC LIMIT ?',
      [terminalId, startTime, endTime, limit]
    );
    return results.map(r => this._rowToLog(r));
  }

  queryByTimeRange(startTime, endTime, options = {}) {
    this._flushBuffer();
    const params = [startTime, endTime];
    let whereClauses = ['timestamp >= ?', 'timestamp <= ?'];
    let selectFields = 'l.*';

    if (options.sourceType) {
      whereClauses.push('source_type = ?');
      params.push(options.sourceType);
    }
    if (options.level) {
      whereClauses.push('level_value >= ?');
      params.push(options.level);
    }
    if (options.terminalId) {
      whereClauses.push('terminal_id = ?');
      params.push(options.terminalId);
    }
    if (options.category) {
      whereClauses.push('category = ?');
      params.push(options.category);
    }
    if (options.traceId) {
      whereClauses.push('trace_id = ?');
      params.push(options.traceId);
    }
    if (options.keyword) {
      whereClauses.push(`(
        LOWER(action) LIKE ? OR LOWER(category) LIKE ? OR
        LOWER(detail) LIKE ? OR LOWER(tags) LIKE ?
      )`);
      const kw = `%${options.keyword.toLowerCase()}%`;
      params.push(kw, kw, kw, kw);
    }

    const useAggregate = options.aggregate
      && !options.keyword && !options.traceId && !options.category;

    let sql;
    if (useAggregate) {
      sql = `SELECT source_type, terminal_id, level_value, SUM(count) as total_count
             FROM log_aggregates
             WHERE time_bucket >= ? AND time_bucket <= ?
             ${whereClauses.slice(2).map(c => 'AND ' + c).join(' ')}
             GROUP BY source_type, terminal_id, level_value
             ORDER BY total_count DESC
             LIMIT ?`;
      params.push(options.limit || 500);
    } else {
      sql = `SELECT ${selectFields} FROM logs l
             WHERE ${whereClauses.join(' AND ')}
             ORDER BY timestamp DESC
             LIMIT ?`;
      params.push(options.limit || 500);
    }

    const results = this._query(sql, params);
    if (useAggregate) return results;
    return results.map(r => this._rowToLog(r));
  }

  queryTraceLinks(traceId) {
    this._flushBuffer();
    return this._query(
      'SELECT * FROM trace_links WHERE trace_id = ? ORDER BY linked_at DESC',
      [traceId]
    );
  }

  _query(sql, params = []) {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (_) {
      return [];
    }
  }

  _rowToLog(row) {
    return {
      id: row.id,
      traceId: row.trace_id,
      spanId: row.span_id,
      parentSpanId: row.parent_span_id,
      timestamp: row.timestamp,
      receivedAt: row.received_at,
      source: {
        type: row.source_type,
        terminalId: row.terminal_id,
        terminalType: row.terminal_type,
      },
      category: row.category,
      action: row.action,
      level: row.level,
      levelValue: row.level_value,
      detail: JSON.parse(row.detail || '{}'),
      tags: JSON.parse(row.tags || '[]'),
      schemaVersion: row.schema_version,
    };
  }

  close() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._persistTimer) {
      clearInterval(this._persistTimer);
      this._persistTimer = null;
    }
    this._flushBuffer();
    this._persist();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

module.exports = LogStore;
