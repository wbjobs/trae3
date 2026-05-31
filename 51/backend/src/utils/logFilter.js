const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

const VALID_LEVEL_NAMES = new Set(Object.keys(LOG_LEVELS));

class LogFilter {
  constructor() {
    this.globalLevel = 'debug';
    this.terminalOverrides = new Map();
    this.moduleFilters = new Set();
    this.keywordFilters = [];
  }

  setGlobalLevel(level) {
    if (!VALID_LEVEL_NAMES.has(level)) return false;
    this.globalLevel = level;
    return true;
  }

  setTerminalLevel(terminalId, level) {
    if (!VALID_LEVEL_NAMES.has(level)) return false;
    this.terminalOverrides.set(terminalId, level);
    return true;
  }

  removeTerminalLevel(terminalId) {
    return this.terminalOverrides.delete(terminalId);
  }

  clearTerminalOverrides() {
    this.terminalOverrides.clear();
  }

  setModuleFilters(modules) {
    this.moduleFilters.clear();
    if (Array.isArray(modules)) {
      modules.forEach(m => this.moduleFilters.add(m));
    }
  }

  addModuleFilter(module) {
    this.moduleFilters.add(module);
  }

  removeModuleFilter(module) {
    this.moduleFilters.delete(module);
  }

  setKeywordFilters(keywords) {
    this.keywordFilters = [];
    if (Array.isArray(keywords)) {
      keywords.forEach(k => {
        if (k && !this.keywordFilters.includes(k)) {
          this.keywordFilters.push(k);
        }
      });
    }
  }

  addKeywordFilter(keyword) {
    if (keyword && !this.keywordFilters.includes(keyword)) {
      this.keywordFilters.push(keyword);
    }
  }

  removeKeywordFilter(keyword) {
    const index = this.keywordFilters.indexOf(keyword);
    if (index > -1) {
      this.keywordFilters.splice(index, 1);
    }
  }

  shouldStore(log) {
    const { level, terminalId, module, message } = log;

    if (!level || !VALID_LEVEL_NAMES.has(level)) {
      return false;
    }

    const levelThreshold = this.terminalOverrides.get(terminalId) || this.globalLevel;
    if (LOG_LEVELS[level] < LOG_LEVELS[levelThreshold]) {
      return false;
    }

    if (this.moduleFilters.size > 0 && module && !this.moduleFilters.has(module)) {
      return false;
    }

    if (this.keywordFilters.length > 0) {
      if (!message || typeof message !== 'string') {
        return false;
      }
      const hasKeyword = this.keywordFilters.some(keyword =>
        message.includes(keyword)
      );
      if (!hasKeyword) {
        return false;
      }
    }

    return true;
  }

  getConfig() {
    return {
      globalLevel: this.globalLevel,
      terminalOverrides: Object.fromEntries(this.terminalOverrides),
      moduleFilters: Array.from(this.moduleFilters),
      keywordFilters: [...this.keywordFilters],
    };
  }
}

module.exports = { LogFilter, LOG_LEVELS, VALID_LEVEL_NAMES };