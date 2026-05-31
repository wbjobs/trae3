const { query, cachedQuery, invalidateTableCache } = require('./config');
const { v4: uuidv4 } = require('uuid');
const { Logger } = require('../common');

const logger = new Logger('StrategyModel');

const StrategyModel = {
  async getAll() {
    const sql = `
      SELECT 
        strategy_id, name, description, trigger_condition, 
        actions, enabled, created_at, updated_at
      FROM strategies 
      ORDER BY created_at DESC
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 30000
    });
    
    return result.rows;
  },

  async getEnabled() {
    const sql = `
      SELECT 
        strategy_id, name, description, trigger_condition, 
        actions, enabled
      FROM strategies 
      WHERE enabled = TRUE
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 15000
    });
    
    return result.rows;
  },

  async getById(strategyId) {
    const sql = `
      SELECT 
        strategy_id, name, description, trigger_condition, 
        actions, enabled, created_at, updated_at
      FROM strategies 
      WHERE strategy_id = $1
    `;
    
    const result = await cachedQuery(sql, [strategyId], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows[0];
  },

  async create(strategyData) {
    const { name, description, trigger_condition, actions } = strategyData;
    const strategy_id = `str-${uuidv4().slice(0, 8)}`;

    const result = await query(
      `INSERT INTO strategies (strategy_id, name, description, trigger_condition, actions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING strategy_id, name, enabled`,
      [strategy_id, name, description, trigger_condition, actions]
    );
    
    invalidateTableCache('strategies');
    return result.rows[0];
  },

  async update(strategyId, strategyData) {
    const { name, description, trigger_condition, actions, enabled } = strategyData;

    const result = await query(
      `UPDATE strategies
       SET name = $1, description = $2, trigger_condition = $3, actions = $4, enabled = $5, updated_at = NOW()
       WHERE strategy_id = $6
       RETURNING strategy_id, name, enabled`,
      [name, description, trigger_condition, actions, enabled, strategyId]
    );
    
    invalidateTableCache('strategies');
    return result.rows[0];
  },

  async toggleEnabled(strategyId, enabled) {
    const result = await query(
      `UPDATE strategies 
       SET enabled = $1, updated_at = NOW() 
       WHERE strategy_id = $2 
       RETURNING strategy_id, name, enabled`,
      [enabled, strategyId]
    );
    
    invalidateTableCache('strategies');
    return result.rows[0];
  },

  async delete(strategyId) {
    const result = await query(
      `DELETE FROM strategies 
       WHERE strategy_id = $1 
       RETURNING strategy_id`,
      [strategyId]
    );
    
    invalidateTableCache('strategies');
    return result.rows[0];
  },

  async logExecution(strategyId, triggerData, executionResult, status = 'success') {
    const execution_id = `exec-${uuidv4().slice(0, 8)}`;

    const result = await query(
      `INSERT INTO strategy_executions (execution_id, strategy_id, trigger_data, execution_result, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING execution_id, strategy_id, status`,
      [execution_id, strategyId, triggerData, executionResult, status]
    );
    
    return result.rows[0];
  },

  async getExecutions(strategyId, limit = 50) {
    const sql = `
      SELECT 
        execution_id, strategy_id, trigger_data, execution_result, 
        status, executed_at
      FROM strategy_executions 
      WHERE strategy_id = $1 
      ORDER BY executed_at DESC 
      LIMIT $2
    `;
    
    const result = await cachedQuery(sql, [strategyId, limit], {
      useCache: true,
      ttlMs: 10000
    });
    
    return result.rows;
  },

  async getStats() {
    const sql = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN enabled = TRUE THEN 1 END) as enabled,
        COUNT(CASE WHEN enabled = FALSE THEN 1 END) as disabled
      FROM strategies
    `;
    
    const result = await cachedQuery(sql, [], {
      useCache: true,
      ttlMs: 30000
    });
    
    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      enabled: parseInt(row.enabled),
      disabled: parseInt(row.disabled)
    };
  }
};

module.exports = StrategyModel;
