const { StrategyModel, AlertModel, SignalModel } = require('../database');
const { Logger, OPERATORS, WS_MESSAGE_TYPES } = require('../common');
const axios = require('axios');

const logger = new Logger('StrategyEngine');

class StrategyEngine {
  constructor() {
    this.gatewayUrl = `http://localhost:${process.env.GATEWAY_PORT || 3000}`;
    this.deviceSignalCache = new Map();
    this.conditionState = new Map();
    this.debounceTimers = new Map();
    this.lastTriggerTime = new Map();
    this.minTriggerInterval = 60000;
  }

  parseCondition(condition) {
    if (typeof condition === 'string') {
      try {
        return JSON.parse(condition);
      } catch (err) {
        logger.error('Parse condition error:', err.message);
        return null;
      }
    }
    return condition;
  }

  evaluateSingleCondition(condition, signalData) {
    if (!condition || !signalData) return false;

    const { metric, operator, threshold, value } = condition;
    const currentValue = signalData[metric];

    if (currentValue === null || currentValue === undefined) {
      logger.debug(`Metric ${metric} has no value`);
      return false;
    }

    switch (operator) {
      case OPERATORS.GT:
        return currentValue > threshold;
      case OPERATORS.LT:
        return currentValue < threshold;
      case OPERATORS.GTE:
        return currentValue >= threshold;
      case OPERATORS.LTE:
        return currentValue <= threshold;
      case OPERATORS.EQ:
        return currentValue === value;
      case OPERATORS.NEQ:
        return currentValue !== value;
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  }

  evaluateCompositeCondition(condition, signalData) {
    if (!condition) return false;

    if (condition.type === 'composite') {
      const results = condition.conditions.map(c => this.evaluateCompositeCondition(c, signalData));
      
      if (condition.logic === 'AND') {
        return results.every(r => r);
      } else if (condition.logic === 'OR') {
        return results.some(r => r);
      }
      return false;
    }

    if (condition.conditions && !condition.type) {
      const results = condition.conditions.map(c => this.evaluateCompositeCondition(c, signalData));
      const logic = condition.logic || 'AND';
      return logic === 'AND' ? results.every(r => r) : results.some(r => r);
    }

    return this.evaluateSingleCondition(condition, signalData);
  }

  checkDurationCondition(strategyId, deviceId, condition, isCurrentlyTrue) {
    const stateKey = `${strategyId}:${deviceId}`;
    const now = Date.now();
    const duration = (condition.duration || 0) * 1000;

    let state = this.conditionState.get(stateKey);
    
    if (!state) {
      state = {
        firstTriggerTime: null,
        lastTrueTime: null,
        isSustained: false
      };
    }

    if (isCurrentlyTrue) {
      if (!state.firstTriggerTime) {
        state.firstTriggerTime = now;
        logger.debug(`Condition first triggered for ${deviceId}, duration required: ${duration}ms`);
      }
      
      state.lastTrueTime = now;
      
      if (duration > 0) {
        const elapsed = now - state.firstTriggerTime;
        state.isSustained = elapsed >= duration;
        
        if (state.isSustained && !state.lastNotified) {
          logger.info(`Condition sustained for ${deviceId}, elapsed: ${elapsed}ms`);
          state.lastNotified = now;
        }
      } else {
        state.isSustained = true;
      }
    } else {
      if (state.firstTriggerTime) {
        logger.debug(`Condition reset for ${deviceId}`);
      }
      state.firstTriggerTime = null;
      state.isSustained = false;
      state.lastNotified = null;
    }

    this.conditionState.set(stateKey, state);
    return state.isSustained;
  }

  checkDebounce(strategyId, deviceId) {
    const key = `${strategyId}:${deviceId}`;
    const now = Date.now();
    const lastTrigger = this.lastTriggerTime.get(key) || 0;
    
    if (now - lastTrigger < this.minTriggerInterval) {
      logger.debug(`Debounce active for ${key}, next allowed in ${this.minTriggerInterval - (now - lastTrigger)}ms`);
      return false;
    }
    
    this.lastTriggerTime.set(key, now);
    return true;
  }

  checkDebounceWithConfig(strategyId, deviceId, debounceConfig) {
    if (!debounceConfig || !debounceConfig.enabled) {
      return this.checkDebounce(strategyId, deviceId);
    }

    const key = `${strategyId}:${deviceId}`;
    const now = Date.now();
    const interval = (debounceConfig.interval || 60) * 1000;
    const lastTrigger = this.lastTriggerTime.get(key) || 0;
    
    if (now - lastTrigger < interval) {
      logger.debug(`Custom debounce active for ${key}, interval: ${interval}ms`);
      return false;
    }
    
    this.lastTriggerTime.set(key, now);
    return true;
  }

  async executeActions(strategy, deviceId, signalData) {
    const results = [];
    const actions = Array.isArray(strategy.actions) ? strategy.actions : [];

    for (const action of actions) {
      const result = await this.executeAction(action, strategy, deviceId, signalData);
      results.push(result);
    }

    return results;
  }

  async executeAction(action, strategy, deviceId, signalData) {
    switch (action.type) {
      case 'alert':
        return this.createAlert(action, strategy, deviceId, signalData);
      case 'webhook':
        return this.triggerWebhook(action, strategy, deviceId, signalData);
      case 'log':
        return this.logAction(action, strategy, deviceId, signalData);
      case 'command':
        return this.executeCommand(action, strategy, deviceId, signalData);
      default:
        logger.warn(`Unknown action type: ${action.type}`);
        return { type: action.type, status: 'unknown_action' };
    }
  }

  async createAlert(action, strategy, deviceId, signalData) {
    try {
      const hasActiveAlert = await AlertModel.checkActiveAlert(deviceId, strategy.strategy_id);

      if (hasActiveAlert) {
        logger.debug(`Active alert already exists for ${deviceId}, strategy: ${strategy.strategy_id}`);
        return { type: 'alert', status: 'already_active', deviceId };
      }

      const alert = await AlertModel.create({
        device_id: deviceId,
        alert_type: strategy.strategy_id,
        severity: action.severity || 'warning',
        message: action.message || `策略触发: ${strategy.name}`
      });

      await StrategyModel.logExecution(
        strategy.strategy_id,
        { deviceId, signalData },
        { alertId: alert.alert_id },
        'success'
      );

      logger.info(`Alert created for ${deviceId}: ${alert.alert_id}`);
      
      return { type: 'alert', status: 'created', alertId: alert.alert_id, deviceId };
    } catch (err) {
      logger.error('Create alert error:', err.message);
      
      await StrategyModel.logExecution(
        strategy.strategy_id,
        { deviceId, signalData },
        { error: err.message },
        'failed'
      );
      
      return { type: 'alert', status: 'error', error: err.message };
    }
  }

  async triggerWebhook(action, strategy, deviceId, signalData) {
    try {
      if (!action.url) {
        return { type: 'webhook', status: 'no_url' };
      }

      const payload = {
        strategy: strategy.name,
        strategyId: strategy.strategy_id,
        deviceId,
        signalData,
        timestamp: new Date().toISOString(),
        severity: action.severity || 'warning'
      };

      const headers = action.headers || { 'Content-Type': 'application/json' };
      const timeout = action.timeout || 5000;

      await axios.post(action.url, payload, { headers, timeout });
      
      logger.info(`Webhook triggered for ${deviceId}: ${action.url}`);
      return { type: 'webhook', status: 'success', url: action.url };
    } catch (err) {
      logger.error('Webhook error:', err.message);
      return { type: 'webhook', status: 'error', error: err.message, url: action.url };
    }
  }

  async logAction(action, strategy, deviceId, signalData) {
    const logData = {
      strategy: strategy.name,
      strategyId: strategy.strategy_id,
      deviceId,
      signalData,
      message: action.message || 'Strategy triggered',
      timestamp: new Date().toISOString()
    };
    
    logger.info(`[Strategy Log] ${strategy.name}:`, JSON.stringify(logData));
    return { type: 'log', status: 'success', data: logData };
  }

  async executeCommand(action, strategy, deviceId, signalData) {
    logger.info(`Command execution for ${deviceId}: ${action.command}`);
    return { type: 'command', status: 'executed', command: action.command };
  }

  async processSignalData(signalData) {
    const results = [];
    const strategies = await StrategyModel.getEnabled();

    for (const strategy of strategies) {
      const result = await this.evaluateStrategy(strategy, signalData);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  async evaluateStrategy(strategy, signalData) {
    try {
      const condition = this.parseCondition(strategy.trigger_condition);
      if (!condition) {
        return null;
      }

      const isConditionTrue = this.evaluateCompositeCondition(condition, signalData);
      
      if (!isConditionTrue) {
        return null;
      }

      const isSustained = this.checkDurationCondition(
        strategy.strategy_id,
        signalData.device_id,
        condition,
        true
      );

      if (!isSustained) {
        return null;
      }

      const canTrigger = this.checkDebounceWithConfig(
        strategy.strategy_id,
        signalData.device_id,
        strategy.debounce
      );

      if (!canTrigger) {
        return null;
      }

      logger.info(`Strategy ${strategy.name} triggered for ${signalData.device_id}`);
      
      const actionResults = await this.executeActions(strategy, signalData.device_id, signalData);

      return {
        strategyId: strategy.strategy_id,
        strategyName: strategy.name,
        deviceId: signalData.device_id,
        triggered: true,
        actions: actionResults
      };
    } catch (err) {
      logger.error('Evaluate strategy error:', err.message);
      return null;
    }
  }

  async processBatchSignalData(signalDataList) {
    const allResults = [];

    for (const signalData of signalDataList) {
      this.deviceSignalCache.set(signalData.device_id, {
        ...signalData,
        lastUpdate: new Date()
      });

      const results = await this.processSignalData(signalData);
      if (results.length > 0) {
        allResults.push(...results);
      }
    }

    return allResults;
  }

  getConditionState(strategyId, deviceId) {
    const key = `${strategyId}:${deviceId}`;
    return this.conditionState.get(key);
  }

  getAllConditionStates() {
    const states = [];
    this.conditionState.forEach((value, key) => {
      const [strategyId, deviceId] = key.split(':');
      states.push({ strategyId, deviceId, ...value });
    });
    return states;
  }

  getCachedSignal(deviceId) {
    return this.deviceSignalCache.get(deviceId);
  }

  getAllCachedSignals() {
    return Array.from(this.deviceSignalCache.values());
  }

  clearCache() {
    this.deviceSignalCache.clear();
    this.conditionState.clear();
    this.lastTriggerTime.clear();
    
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    
    logger.info('All caches cleared');
  }

  setMinTriggerInterval(intervalMs) {
    this.minTriggerInterval = intervalMs;
    logger.info(`Min trigger interval set to ${intervalMs}ms`);
  }
}

module.exports = StrategyEngine;
