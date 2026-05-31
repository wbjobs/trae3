const { query, cachedQuery, invalidateTableCache } = require('./config');
const { Logger } = require('../common');

const logger = new Logger('DeviceModel');

const DeviceModel = {
  async getAll() {
    const sql = `
      SELECT 
        device_id, device_type, name, location, ip_address, 
        mac_address, status, parent_device_id, created_at, updated_at
      FROM devices 
      ORDER BY created_at DESC
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows;
  },

  async getById(deviceId) {
    const sql = `
      SELECT 
        device_id, device_type, name, location, ip_address, 
        mac_address, status, parent_device_id, created_at, updated_at
      FROM devices 
      WHERE device_id = $1
    `;
    
    const result = await cachedQuery(sql, [deviceId], {
      useCache: true,
      ttlMs: 5000
    });
    
    return result.rows[0];
  },

  async getByType(deviceType) {
    const sql = `
      SELECT 
        device_id, device_type, name, location, status, parent_device_id
      FROM devices 
      WHERE device_type = $1 
      ORDER BY name
    `;
    
    const result = await cachedQuery(sql, [deviceType], {
      useCache: true,
      ttlMs: 15000
    });
    
    return result.rows;
  },

  async create(deviceData) {
    const { device_id, device_type, name, location, ip_address, mac_address, status, parent_device_id } = deviceData;
    const result = await query(
      `INSERT INTO devices (device_id, device_type, name, location, ip_address, mac_address, status, parent_device_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (device_id) DO UPDATE SET
         device_type = EXCLUDED.device_type,
         name = EXCLUDED.name,
         location = EXCLUDED.location,
         ip_address = EXCLUDED.ip_address,
         mac_address = EXCLUDED.mac_address,
         status = EXCLUDED.status,
         parent_device_id = EXCLUDED.parent_device_id,
         updated_at = NOW()
       RETURNING device_id, device_type, name, status, parent_device_id`,
      [device_id, device_type, name, location, ip_address, mac_address, status || 'offline', parent_device_id]
    );
    
    invalidateTableCache('devices');
    return result.rows[0];
  },

  async updateStatus(deviceId, status) {
    const result = await query(
      `UPDATE devices 
       SET status = $1, updated_at = NOW() 
       WHERE device_id = $2 
       RETURNING device_id, device_type, name, status, parent_device_id`,
      [status, deviceId]
    );
    
    invalidateTableCache('devices');
    return result.rows[0];
  },

  async delete(deviceId) {
    const result = await query(
      `DELETE FROM devices 
       WHERE device_id = $1 
       RETURNING device_id`,
      [deviceId]
    );
    
    invalidateTableCache('devices');
    return result.rows[0];
  },

  async getTopology() {
    const devicesSql = `
      SELECT 
        device_id, device_type, name, location, status, 
        parent_device_id, created_at, updated_at
      FROM devices
    `;
    
    const linksSql = `
      SELECT 
        id, source_device_id, target_device_id, link_type, 
        quality, status, created_at
      FROM topology_links
    `;
    
    const [devicesResult, linksResult] = await Promise.all([
      cachedQuery(devicesSql, [], { useCache: true, ttlMs: 5000 }),
      cachedQuery(linksSql, [], { useCache: true, ttlMs: 10000 })
    ]);
    
    return {
      devices: devicesResult.rows,
      links: linksResult.rows
    };
  },

  async getSummary() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'online' THEN 1 END) as online,
        COUNT(CASE WHEN status != 'online' THEN 1 END) as offline,
        COUNT(CASE WHEN device_type = 'ap' THEN 1 END) as ap_count,
        COUNT(CASE WHEN device_type = 'repeater' THEN 1 END) as repeater_count,
        COUNT(CASE WHEN device_type = 'endpoint' THEN 1 END) as endpoint_count
      FROM devices
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 5000
    });
    
    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      online: parseInt(row.online),
      offline: parseInt(row.offline),
      by_type: {
        ap: parseInt(row.ap_count),
        repeater: parseInt(row.repeater_count),
        endpoint: parseInt(row.endpoint_count)
      }
    };
  },

  async getOnlineCount() {
    const sql = "SELECT COUNT(*) as count FROM devices WHERE status = 'online'";
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 3000
    });
    
    return parseInt(result.rows[0].count);
  },

  async getOfflineCount() {
    const sql = "SELECT COUNT(*) as count FROM devices WHERE status != 'online'";
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 3000
    });
    
    return parseInt(result.rows[0].count);
  }
};

module.exports = DeviceModel;
