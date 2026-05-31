const { query, cachedQuery, invalidateTableCache } = require('./config');
const { v4: uuidv4 } = require('uuid');
const { Logger } = require('../common');

const logger = new Logger('AlertModel');

const AlertModel = {
  async create(alertData) {
    const {
      device_id,
      alert_type,
      severity,
      message
    } = alertData;

    const alert_id = `alert-${uuidv4().slice(0, 8)}`;

    const result = await query(
      `INSERT INTO alerts (alert_id, device_id, alert_type, severity, message, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING alert_id, device_id, alert_type, severity, status, triggered_at`,
      [alert_id, device_id, alert_type, severity, message]
    );
    
    invalidateTableCache('alerts');
    return result.rows[0];
  },

  async getAll(limit = 100) {
    const sql = `
      SELECT 
        alert_id, device_id, alert_type, severity, message, 
        status, triggered_at, resolved_at
      FROM alerts 
      ORDER BY triggered_at DESC 
      LIMIT $1
    `;
    
    const result = await cachedQuery(sql, [limit], {
      useCache: true,
      ttlMs: 5000
    });
    
    return result.rows;
  },

  async getActive() {
    const sql = `
      SELECT 
        alert_id, device_id, alert_type, severity, message, 
        status, triggered_at
      FROM alerts 
      WHERE status = 'active' 
      ORDER BY triggered_at DESC
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 3000
    });
    
    return result.rows;
  },

  async getByDevice(deviceId, limit = 50) {
    const sql = `
      SELECT 
        alert_id, device_id, alert_type, severity, message, 
        status, triggered_at, resolved_at
      FROM alerts 
      WHERE device_id = $1 
      ORDER BY triggered_at DESC 
      LIMIT $2
    `;
    
    const result = await cachedQuery(sql, [deviceId, limit], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows;
  },

  async getBySeverity(severity, limit = 50) {
    const sql = `
      SELECT 
        alert_id, device_id, alert_type, severity, message, 
        status, triggered_at, resolved_at
      FROM alerts 
      WHERE severity = $1 
      ORDER BY triggered_at DESC 
      LIMIT $2
    `;
    
    const result = await cachedQuery(sql, [severity, limit], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows;
  },

  async resolve(alertId) {
    const result = await query(
      `UPDATE alerts 
       SET status = 'resolved', resolved_at = NOW() 
       WHERE alert_id = $1 
       RETURNING alert_id, device_id, alert_type, status`,
      [alertId]
    );
    
    invalidateTableCache('alerts');
    return result.rows[0];
  },

  async resolveByDeviceAndType(deviceId, alertType) {
    const result = await query(
      `UPDATE alerts 
       SET status = 'resolved', resolved_at = NOW() 
       WHERE device_id = $1 
         AND alert_type = $2 
         AND status = 'active' 
       RETURNING alert_id, device_id, alert_type, status`,
      [deviceId, alertType]
    );
    
    invalidateTableCache('alerts');
    return result.rows;
  },

  async delete(alertId) {
    const result = await query(
      `DELETE FROM alerts 
       WHERE alert_id = $1 
       RETURNING alert_id`,
      [alertId]
    );
    
    invalidateTableCache('alerts');
    return result.rows[0];
  },

  async getCountBySeverity() {
    const sql = `
      SELECT severity, COUNT(*) as count
      FROM alerts
      WHERE status = 'active'
      GROUP BY severity
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 3000
    });
    
    return result.rows.reduce((acc, row) => {
      acc[row.severity] = parseInt(row.count);
      return acc;
    }, { critical: 0, warning: 0, info: 0 });
  },

  async checkActiveAlert(deviceId, alertType) {
    const sql = `
      SELECT 1 
      FROM alerts 
      WHERE device_id = $1 
        AND alert_type = $2 
        AND status = 'active' 
      LIMIT 1
    `;
    
    const result = await cachedQuery(sql, [deviceId, alertType], {
      useCache: true,
      ttlMs: 2000
    });
    
    return result.rows.length > 0;
  },

  async getStats() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved,
        COUNT(CASE WHEN severity = 'critical' AND status = 'active' THEN 1 END) as critical_active,
        COUNT(CASE WHEN severity = 'warning' AND status = 'active' THEN 1 END) as warning_active,
        COUNT(CASE WHEN severity = 'info' AND status = 'active' THEN 1 END) as info_active
      FROM alerts
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 5000
    });
    
    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      resolved: parseInt(row.resolved),
      by_severity: {
        critical: parseInt(row.critical_active),
        warning: parseInt(row.warning_active),
        info: parseInt(row.info_active)
      }
    };
  }
};

module.exports = AlertModel;
