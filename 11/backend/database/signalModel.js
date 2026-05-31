const { query, cachedQuery, invalidateTableCache } = require('./config');
const { Logger } = require('../common');

const logger = new Logger('SignalModel');

const SignalModel = {
  async insert(data) {
    const {
      time,
      device_id,
      signal_strength,
      snr,
      channel,
      bandwidth,
      connected_clients,
      cpu_usage,
      memory_usage,
      temperature
    } = data;

    const result = await query(
      `INSERT INTO signal_data (
        time, device_id, signal_strength, snr, channel, bandwidth,
        connected_clients, cpu_usage, memory_usage, temperature
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING time, device_id, signal_strength, snr, status`,
      [
        time || new Date(),
        device_id,
        signal_strength,
        snr,
        channel,
        bandwidth,
        connected_clients,
        cpu_usage,
        memory_usage,
        temperature
      ]
    );
    
    invalidateTableCache('signal_data');
    return result.rows[0];
  },

  async bulkInsert(dataList) {
    if (!dataList || dataList.length === 0) return [];

    const values = [];
    const placeholders = [];

    dataList.forEach((data, index) => {
      const offset = index * 10;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10})`);
      values.push(
        data.time || new Date(),
        data.device_id,
        data.signal_strength,
        data.snr,
        data.channel,
        data.bandwidth,
        data.connected_clients,
        data.cpu_usage,
        data.memory_usage,
        data.temperature
      );
    });

    const queryStr = `
      INSERT INTO signal_data (
        time, device_id, signal_strength, snr, channel, bandwidth,
        connected_clients, cpu_usage, memory_usage, temperature
      ) VALUES ${placeholders.join(', ')}
      RETURNING time, device_id, signal_strength, status
    `;

    const result = await query(queryStr, values);
    
    invalidateTableCache('signal_data');
    return result.rows;
  },

  async getLatestByDevice(deviceId, limit = 1) {
    const sql = `
      SELECT 
        time, device_id, signal_strength, snr, channel, bandwidth,
        connected_clients, cpu_usage, memory_usage, temperature, status
      FROM signal_data 
      WHERE device_id = $1 
      ORDER BY time DESC 
      LIMIT $2
    `;
    
    const result = await cachedQuery(sql, [deviceId, limit], {
      useCache: true,
      ttlMs: 5000
    });
    
    return result.rows;
  },

  async getByTimeRange(deviceId, startTime, endTime, limit = 1000) {
    const sql = `
      SELECT 
        time, device_id, signal_strength, snr, channel, bandwidth,
        connected_clients, cpu_usage, memory_usage, temperature, status
      FROM signal_data 
      WHERE device_id = $1 
        AND time >= $2 
        AND time <= $3 
      ORDER BY time ASC
      LIMIT $4
    `;
    
    const result = await cachedQuery(sql, [deviceId, startTime, endTime, limit], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows;
  },

  async getLatestAllDevices() {
    const sql = `
      SELECT DISTINCT ON (device_id)
        time, device_id, signal_strength, snr, channel, bandwidth,
        connected_clients, cpu_usage, memory_usage, temperature, status
      FROM signal_data
      ORDER BY device_id, time DESC
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 3000
    });
    
    return result.rows;
  },

  async getAggregated(deviceId, startTime, endTime, interval = '5m') {
    const sql = `
      SELECT
        time_bucket($1, time) as bucket,
        AVG(signal_strength) as avg_signal,
        MIN(signal_strength) as min_signal,
        MAX(signal_strength) as max_signal,
        AVG(snr) as avg_snr,
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory,
        AVG(temperature) as avg_temp,
        COUNT(*) as sample_count
      FROM signal_data
      WHERE device_id = $2 
        AND time >= $3 
        AND time <= $4
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    
    const result = await cachedQuery(sql, [interval, deviceId, startTime, endTime], {
      useCache: true,
      ttlMs: 30000
    });
    
    return result.rows;
  },

  async getDeviceStats(deviceId, startTime, endTime) {
    const sql = `
      SELECT
        COUNT(*) as total_samples,
        AVG(signal_strength) as avg_signal,
        MIN(signal_strength) as min_signal,
        MAX(signal_strength) as max_signal,
        AVG(snr) as avg_snr,
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory,
        AVG(temperature) as avg_temp
      FROM signal_data
      WHERE device_id = $1 
        AND time >= $2 
        AND time <= $3
    `;
    
    const result = await cachedQuery(sql, [deviceId, startTime, endTime], {
      useCache: true,
      ttlMs: 60000
    });
    
    return result.rows[0];
  }
};

module.exports = SignalModel;
