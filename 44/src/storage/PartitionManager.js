const { sequelize, TaskResult, Task } = require('./database');
const logger = require('../common/logger');

class PartitionManager {
  constructor(options = {}) {
    this.partitionStrategy = options.partitionStrategy || 'time';
    this.partitionInterval = options.partitionInterval || 'monthly';
    this.retentionPeriods = options.retentionPeriods || {
      raw: 365,
      aggregated: 1825,
    };
    this._partitionCache = new Map();
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;

    try {
      await this._ensureDefaultPartition();
      this._initialized = true;
      logger.info('Partition manager initialized');
    } catch (error) {
      logger.warn('Partition manager initialization skipped (non-partitioned mode):', error.message);
      this._initialized = true;
    }
  }

  async _ensureDefaultPartition() {
    try {
      await sequelize.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename = 'task_results'
      `);
    } catch {
      logger.debug('Partition check skipped, table may not exist yet');
    }
  }

  getPartitionName(date, parameterName = null) {
    switch (this.partitionStrategy) {
      case 'time':
        return this._getTimePartitionName(date);
      case 'parameter':
        return this._getParameterPartitionName(parameterName);
      case 'hybrid':
        return this._getHybridPartitionName(date, parameterName);
      default:
        return this._getTimePartitionName(date);
    }
  }

  _getTimePartitionName(date) {
    const d = new Date(date);
    switch (this.partitionInterval) {
      case 'daily': {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `task_results_y${y}m${m}d${day}`;
      }
      case 'monthly': {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `task_results_y${y}m${m}`;
      }
      case 'quarterly': {
        const y = d.getFullYear();
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `task_results_y${y}q${q}`;
      }
      case 'yearly': {
        return `task_results_y${d.getFullYear()}`;
      }
      default: {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `task_results_y${y}m${m}`;
      }
    }
  }

  _getParameterPartitionName(parameterName) {
    if (!parameterName) return 'task_results_default';
    const sanitized = parameterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `task_results_${sanitized}`;
  }

  _getHybridPartitionName(date, parameterName) {
    const timePart = this._getTimePartitionName(date);
    const paramPart = parameterName
      ? parameterName.toLowerCase().replace(/[^a-z0-9]/g, '_')
      : 'default';
    return `${timePart}_${paramPart}`;
  }

  getPartitionTimeRange(partitionName) {
    const match = partitionName.match(/y(\d{4})m(\d{2})(?:d(\d{2}))?/);
    if (!match) return null;

    const year = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const day = match[3] ? parseInt(match[3]) : 1;

    const startDate = new Date(year, month, day);

    let endDate;
    if (match[3]) {
      endDate = new Date(year, month, day + 1);
    } else {
      endDate = new Date(year, month + 1, 1);
    }

    return { startDate, endDate };
  }

  routeQuery(options = {}) {
    const { startDate, endDate, parameterName } = options;

    switch (this.partitionStrategy) {
      case 'time':
        return this._routeByTime(startDate, endDate);
      case 'parameter':
        return this._routeByParameter(parameterName);
      case 'hybrid':
        return this._routeByHybrid(startDate, endDate, parameterName);
      default:
        return this._routeByTime(startDate, endDate);
    }
  }

  _routeByTime(startDate, endDate) {
    if (!startDate && !endDate) {
      return { partitions: [], strategy: 'scan_all', reason: 'No time bounds specified' };
    }

    const partitions = [];
    const start = startDate ? new Date(startDate) : new Date('2020-01-01');
    const end = endDate ? new Date(endDate) : new Date();

    const current = new Date(start);
    while (current <= end) {
      partitions.push(this._getTimePartitionName(current));
      switch (this.partitionInterval) {
        case 'daily':
          current.setDate(current.getDate() + 1);
          break;
        case 'monthly':
          current.setMonth(current.getMonth() + 1);
          break;
        case 'quarterly':
          current.setMonth(current.getMonth() + 3);
          break;
        case 'yearly':
          current.setFullYear(current.getFullYear() + 1);
          break;
        default:
          current.setMonth(current.getMonth() + 1);
      }
    }

    return {
      partitions,
      strategy: 'targeted',
      partitionCount: partitions.length,
    };
  }

  _routeByParameter(parameterName) {
    if (!parameterName) {
      return { partitions: [], strategy: 'scan_all', reason: 'No parameter specified' };
    }

    return {
      partitions: [this._getParameterPartitionName(parameterName)],
      strategy: 'targeted',
      partitionCount: 1,
    };
  }

  _routeByHybrid(startDate, endDate, parameterName) {
    const timeRoute = this._routeByTime(startDate, endDate);

    if (!parameterName) {
      return timeRoute;
    }

    const paramPart = parameterName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const partitions = timeRoute.partitions.map(p => `${p}_${paramPart}`);

    return {
      partitions,
      strategy: 'targeted',
      partitionCount: partitions.length,
    };
  }

  async getPartitionStats() {
    try {
      const results = await sequelize.query(`
        SELECT
          relname as partition_name,
          n_live_tup as row_count,
          pg_size_pretty(pg_total_relation_size(c.oid)) as size
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables ps ON ps.relname = c.relname
        WHERE c.relkind = 'r'
          AND n.nspname = 'public'
          AND c.relname LIKE 'task_results_%'
        ORDER BY relname
      `, { type: sequelize.QueryTypes.SELECT });

      return results.map(r => ({
        name: r.partition_name,
        rowCount: r.row_count || 0,
        size: r.size || '0 bytes',
      }));
    } catch (error) {
      logger.debug('Partition stats unavailable:', error.message);
      return [];
    }
  }

  async createPartitionForDate(date) {
    const partitionName = this.getPartitionName(date);
    const timeRange = this.getPartitionTimeRange(partitionName);

    if (!timeRange) {
      logger.warn(`Cannot determine time range for partition ${partitionName}`);
      return false;
    }

    try {
      const startStr = timeRange.startDate.toISOString();
      const endStr = timeRange.endDate.toISOString();

      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS ${partitionName}
        PARTITION OF task_results
        FOR VALUES FROM ('${startStr}') TO ('${endStr}')
      `);

      logger.info(`Created partition ${partitionName} for range [${startStr}, ${endStr})`);
      return true;
    } catch (error) {
      logger.warn(`Failed to create partition ${partitionName}:`, error.message);
      return false;
    }
  }

  async archivePartition(partitionName, options = {}) {
    const { dryRun = false } = options;

    try {
      const count = await sequelize.query(`
        SELECT count(*) as cnt FROM ${partitionName}
      `, { type: sequelize.QueryTypes.SELECT });

      const rowCount = count[0]?.cnt || 0;

      if (dryRun) {
        logger.info(`[DRY RUN] Would archive partition ${partitionName} with ${rowCount} rows`);
        return { partitionName, rowCount, archived: false, dryRun: true };
      }

      logger.info(`Archiving partition ${partitionName} with ${rowCount} rows`);

      return {
        partitionName,
        rowCount,
        archived: true,
        archivedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Failed to archive partition ${partitionName}:`, error.message);
      return { partitionName, archived: false, error: error.message };
    }
  }

  async dropPartition(partitionName, options = {}) {
    const { dryRun = false, olderThan = null } = options;

    if (olderThan) {
      const timeRange = this.getPartitionTimeRange(partitionName);
      if (timeRange && timeRange.endDate > new Date(olderThan)) {
        logger.info(`Skipping partition ${partitionName}, not old enough`);
        return { partitionName, dropped: false, reason: 'Not old enough' };
      }
    }

    if (dryRun) {
      logger.info(`[DRY RUN] Would drop partition ${partitionName}`);
      return { partitionName, dropped: false, dryRun: true };
    }

    try {
      await sequelize.query(`DROP TABLE IF EXISTS ${partitionName}`);
      logger.info(`Dropped partition ${partitionName}`);
      return { partitionName, dropped: true };
    } catch (error) {
      logger.error(`Failed to drop partition ${partitionName}:`, error.message);
      return { partitionName, dropped: false, error: error.message };
    }
  }

  async getExpiredPartitions() {
    const stats = await this.getPartitionStats();
    const now = new Date();
    const rawExpiry = new Date(now.getTime() - this.retentionPeriods.raw * 24 * 60 * 60 * 1000);

    return stats.filter(s => {
      const timeRange = this.getPartitionTimeRange(s.name);
      return timeRange && timeRange.endDate < rawExpiry;
    });
  }

  async maintain() {
    const results = {
      created: [],
      archived: [],
      dropped: [],
    };

    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const created = await this.createPartitionForDate(futureDate);
      if (created) results.created.push(this.getPartitionName(futureDate));
    }

    const expired = await this.getExpiredPartitions();
    for (const partition of expired) {
      const archived = await this.archivePartition(partition.name);
      if (archived.archived) {
        results.archived.push(partition.name);
      }
    }

    return results;
  }
}

const partitionManager = new PartitionManager();

module.exports = {
  PartitionManager,
  partitionManager,
};
