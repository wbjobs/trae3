const { Logger } = require('./logger');

const logger = new Logger('UpdateOptimizer');

class DiffCalculator {
  static calculateDiff(oldData, newData, fields = null) {
    const changes = {};
    const keys = fields || Object.keys({ ...oldData, ...newData });
    
    for (const key of keys) {
      const oldVal = oldData?.[key];
      const newVal = newData?.[key];
      
      if (oldVal !== newVal) {
        changes[key] = {
          old: oldVal,
          new: newVal
        };
      }
    }
    
    return {
      hasChanges: Object.keys(changes).length > 0,
      changes
    };
  }

  static shallowEqual(obj1, obj2, ignoreFields = []) {
    if (obj1 === obj2) return true;
    if (!obj1 || !obj2) return false;
    
    const keys1 = Object.keys(obj1).filter(k => !ignoreFields.includes(k));
    const keys2 = Object.keys(obj2).filter(k => !ignoreFields.includes(k));
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (obj1[key] !== obj2[key]) return false;
    }
    
    return true;
  }

  static mergePartialUpdate(existing, partial) {
    return { ...existing, ...partial };
  }
}

class ChangeTracker {
  constructor(options = {}) {
    this.options = {
      debounceMs: options.debounceMs || 100,
      maxBatchSize: options.maxBatchSize || 50,
      maxWaitMs: options.maxWaitMs || 200
    };
    
    this.pendingUpdates = new Map();
    this.updateTimers = new Map();
    this.changeCallbacks = new Set();
    this.version = 0;
  }

  trackUpdate(id, data, type = 'update') {
    const existing = this.pendingUpdates.get(id);
    const now = Date.now();
    
    if (existing) {
      const diff = DiffCalculator.calculateDiff(existing.data, data);
      
      if (!diff.hasChanges) {
        return { hasChanges: false };
      }
      
      this.pendingUpdates.set(id, {
        id,
        data: DiffCalculator.mergePartialUpdate(existing.data, data),
        type,
        changes: { ...existing.changes, ...diff.changes },
        firstSeen: existing.firstSeen,
        lastUpdate: now
      });
    } else {
      this.pendingUpdates.set(id, {
        id,
        data,
        type,
        changes: {},
        firstSeen: now,
        lastUpdate: now
      });
    }
    
    this.scheduleFlush(id);
    return { hasChanges: true, pendingCount: this.pendingUpdates.size };
  }

  scheduleFlush(id) {
    if (this.updateTimers.has(id)) {
      clearTimeout(this.updateTimers.get(id));
    }
    
    const pending = this.pendingUpdates.get(id);
    const elapsed = Date.now() - pending.firstSeen;
    
    const delay = elapsed >= this.options.maxWaitMs 
      ? 0 
      : Math.min(this.options.debounceMs, this.options.maxWaitMs - elapsed);
    
    this.updateTimers.set(id, setTimeout(() => {
      this.flush(id);
    }, delay));
    
    if (this.pendingUpdates.size >= this.options.maxBatchSize) {
      setImmediate(() => this.flushAll());
    }
  }

  async flush(id) {
    const update = this.pendingUpdates.get(id);
    const timer = this.updateTimers.get(id);
    
    if (timer) {
      clearTimeout(timer);
      this.updateTimers.delete(id);
    }
    
    if (!update) return null;
    
    this.pendingUpdates.delete(id);
    this.version++;
    
    for (const callback of this.changeCallbacks) {
      try {
        await callback(update, this.version);
      } catch (err) {
        logger.error('Change callback error:', err);
      }
    }
    
    return update;
  }

  async flushAll() {
    const ids = Array.from(this.pendingUpdates.keys());
    const results = [];
    
    for (const id of ids) {
      const result = await this.flush(id);
      if (result) results.push(result);
    }
    
    return results;
  }

  onChange(callback) {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  getPendingCount() {
    return this.pendingUpdates.size;
  }

  getVersion() {
    return this.version;
  }

  getPendingUpdates() {
    return Array.from(this.pendingUpdates.values());
  }

  clear() {
    this.pendingUpdates.clear();
    this.updateTimers.forEach(timer => clearTimeout(timer));
    this.updateTimers.clear();
  }
}

class PartialUpdateGenerator {
  static generateNodeUpdate(oldNode, newNode) {
    const diff = DiffCalculator.calculateDiff(oldNode, newNode);
    
    if (!diff.hasChanges) {
      return null;
    }
    
    const update = {
      type: 'node_update',
      id: newNode.id || newNode.device_id,
      timestamp: Date.now(),
      changes: diff.changes
    };
    
    if (diff.changes.status || diff.changes.signal_strength) {
      update.important = true;
    }
    
    return update;
  }

  static generateLinkUpdate(oldLink, newLink) {
    const diff = DiffCalculator.calculateDiff(oldLink, newLink, ['quality', 'status']);
    
    if (!diff.hasChanges) {
      return null;
    }
    
    return {
      type: 'link_update',
      source: newLink.source_device_id,
      target: newLink.target_device_id,
      timestamp: Date.now(),
      changes: diff.changes
    };
  }

  static generateBatchUpdate(updates) {
    return {
      type: 'batch_update',
      timestamp: Date.now(),
      count: updates.length,
      updates
    };
  }

  static generateFullRefresh(reason = 'full_refresh') {
    return {
      type: 'full_refresh',
      timestamp: Date.now(),
      reason
    };
  }

  static shouldUsePartialUpdate(changeCount, totalCount, threshold = 0.3) {
    if (totalCount === 0) return false;
    return (changeCount / totalCount) < threshold;
  }
}

module.exports = {
  DiffCalculator,
  ChangeTracker,
  PartialUpdateGenerator
};
