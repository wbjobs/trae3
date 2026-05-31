const logger = require('../utils/logger');

class AlertEngine {
  constructor() {
    this.rules = [];
    this.pendingAlerts = [];
    this.maxPendingSize = 1000;
    this.subscribers = [];
  }

  addRule(rule) {
    const newRule = {
      id: rule.id || `rule_${Date.now()}`,
      name: rule.name || '未命名规则',
      type: rule.type || 'keyword',
      keywords: rule.keywords || [],
      levels: rule.levels || [],
      modules: rule.modules || [],
      terminalIds: rule.terminalIds || [],
      enabled: rule.enabled !== false,
      cooldown: rule.cooldown || 60,
      lastTriggered: new Map(),
      createdAt: new Date().toISOString(),
    };
    this.rules.push(newRule);
    logger.info(`告警规则已添加: ${newRule.name} (${newRule.id})`);
    return newRule;
  }

  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index > -1) {
      const removed = this.rules.splice(index, 1)[0];
      removed.lastTriggered.clear();
      logger.info(`告警规则已删除: ${removed.name}`);
      return true;
    }
    return false;
  }

  updateRule(ruleId, updates) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return null;
    Object.assign(rule, updates);
    if (updates.keywords) rule.lastTriggered.clear();
    return rule;
  }

  checkLog(log) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.terminalIds.length > 0 && !rule.terminalIds.includes(log.terminalId)) {
        continue;
      }

      if (rule.levels.length > 0 && !rule.levels.includes(log.level)) {
        continue;
      }

      if (rule.modules.length > 0 && !rule.modules.includes(log.module)) {
        continue;
      }

      let matched = false;
      let matchedKeyword = '';

      if (rule.type === 'keyword') {
        for (const keyword of rule.keywords) {
          if (log.message && log.message.includes(keyword)) {
            matched = true;
            matchedKeyword = keyword;
            break;
          }
        }
      } else if (rule.type === 'level') {
        matched = true;
      }

      if (!matched) continue;

      const now = Date.now();
      const lastTime = rule.lastTriggered.get(log.terminalId) || 0;
      if (now - lastTime < rule.cooldown * 1000) {
        continue;
      }

      rule.lastTriggered.set(log.terminalId, now);

      const alert = {
        terminalId: log.terminalId,
        type: rule.type,
        ruleName: rule.name,
        ruleId: rule.id,
        message: `[${rule.name}] 终端${log.terminalId}: ${matchedKeyword ? `匹配关键词"${matchedKeyword}" - ` : ''}${(log.message || '').substring(0, 200)}`,
        level: log.level,
        timestamp: log.timestamp,
        matchedKeyword,
      };

      if (this.pendingAlerts.length < this.maxPendingSize) {
        this.pendingAlerts.push(alert);
      }

      this.notifySubscribers(alert);
    }
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      const index = this.subscribers.indexOf(callback);
      if (index > -1) this.subscribers.splice(index, 1);
    };
  }

  notifySubscribers(alert) {
    for (const cb of this.subscribers) {
      try {
        cb(alert);
      } catch (err) {
        logger.error('告警通知回调错误:', err.message);
      }
    }
  }

  flushPendingAlerts() {
    const alerts = [...this.pendingAlerts];
    this.pendingAlerts = [];
    return alerts;
  }

  getRules() {
    return this.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      type: rule.type,
      keywords: rule.keywords,
      levels: rule.levels,
      modules: rule.modules,
      terminalIds: rule.terminalIds,
      enabled: rule.enabled,
      cooldown: rule.cooldown,
      createdAt: rule.createdAt,
    }));
  }

  getRule(ruleId) {
    const rule = this.rules.find(r => r.id === ruleId);
    if (!rule) return null;
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      keywords: rule.keywords,
      levels: rule.levels,
      modules: rule.modules,
      terminalIds: rule.terminalIds,
      enabled: rule.enabled,
      cooldown: rule.cooldown,
      createdAt: rule.createdAt,
    };
  }

  loadRules(rules) {
    this.rules = [];
    this.pendingAlerts = [];
    rules.forEach(r => this.addRule(r));
  }
}

module.exports = { AlertEngine };