const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  server: {
    port: 3000,
    host: '0.0.0.0',
    maxConnections: 1000
  },
  game: {
    maxPlayersPerRoom: 2,
    startingHp: 30,
    startingMana: 1,
    maxMana: 10,
    startingHandSize: 4,
    maxHandSize: 10,
    maxFieldSize: 7,
    deckSize: 20,
    turnTimeout: 90
  },
  database: {
    path: path.join(__dirname, '../../data/game.db'),
    backupPath: path.join(__dirname, '../../data/backups'),
    enableWal: true,
    maxConnections: 10
  },
  sync: {
    enabled: true,
    serverId: process.env.SERVER_ID || null,
    peerServers: [],
    syncInterval: 5000,
    stateExpireTime: 3600000
  },
  logging: {
    level: 'info',
    file: path.join(__dirname, '../../logs/server.log'),
    maxSize: '100m',
    maxFiles: 10
  },
  matchmaking: {
    maxWaitTime: 120000,
    ratingRange: 200
  }
};

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.configPath = path.join(__dirname, 'config.json');
    this.loadConfig();
    this.watchConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        
        if (!fileContent || fileContent.trim() === '') {
          console.warn('[Config] 配置文件为空，使用默认配置');
          this.saveDefaultConfig();
          return;
        }

        const userConfig = JSON.parse(fileContent);
        this.config = this.mergeConfig(this.config, userConfig);
        console.log('[Config] 配置文件加载成功');
      } else {
        console.warn('[Config] 配置文件不存在，创建默认配置');
        this.saveDefaultConfig();
      }
    } catch (error) {
      console.error('[Config] 配置文件读取失败:', error.message);
      console.warn('[Config] 将使用默认配置启动');
      
      if (error instanceof SyntaxError) {
        console.warn('[Config] 配置文件JSON格式错误，已备份并创建新配置');
        this.backupCorruptedConfig();
        this.saveDefaultConfig();
      }
    }

    this.applyEnvironmentOverrides();
  }

  mergeConfig(defaults, userConfig) {
    const merged = { ...defaults };
    
    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && userConfig[key] !== null && !Array.isArray(userConfig[key])) {
        merged[key] = this.mergeConfig(defaults[key] || {}, userConfig[key]);
      } else {
        merged[key] = userConfig[key];
      }
    }
    
    return merged;
  }

  saveDefaultConfig() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log('[Config] 默认配置文件已创建');
    } catch (error) {
      console.error('[Config] 创建默认配置文件失败:', error.message);
    }
  }

  backupCorruptedConfig() {
    try {
      const backupPath = `${this.configPath}.corrupted.${Date.now()}`;
      if (fs.existsSync(this.configPath)) {
        fs.copyFileSync(this.configPath, backupPath);
        console.log(`[Config] 损坏的配置文件已备份到: ${backupPath}`);
      }
    } catch (error) {
      console.error('[Config] 备份损坏配置文件失败:', error.message);
    }
  }

  applyEnvironmentOverrides() {
    if (process.env.PORT) {
      this.config.server.port = parseInt(process.env.PORT, 10) || this.config.server.port;
    }
    
    if (process.env.SERVER_ID) {
      this.config.sync.serverId = process.env.SERVER_ID;
    }
    
    if (process.env.DB_PATH) {
      this.config.database.path = process.env.DB_PATH;
    }
    
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL;
    }
  }

  watchConfig() {
    try {
      fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          console.log('[Config] 检测到配置文件变化，重新加载');
          this.loadConfig();
        }
      });
    } catch (error) {
      console.warn('[Config] 无法监听配置文件变化:', error.message);
    }
  }

  get(key) {
    if (!key) return { ...this.config };
    
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in obj) || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    
    obj[keys[keys.length - 1]] = value;
  }

  validateConfig() {
    const errors = [];
    
    if (this.config.server.port < 1 || this.config.server.port > 65535) {
      errors.push('端口号必须在1-65535之间');
    }
    
    if (this.config.game.startingHp <= 0) {
      errors.push('初始生命值必须大于0');
    }
    
    if (this.config.game.startingMana < 0 || this.config.game.startingMana > this.config.game.maxMana) {
      errors.push('初始法力值配置无效');
    }
    
    if (this.config.game.maxHandSize <= 0) {
      errors.push('最大手牌数必须大于0');
    }
    
    if (!path.isAbsolute(this.config.database.path)) {
      errors.push('数据库路径必须是绝对路径');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

const configManager = new ConfigManager();

const validation = configManager.validateConfig();
if (!validation.valid) {
  console.error('[Config] 配置验证失败:', validation.errors);
}

module.exports = configManager;