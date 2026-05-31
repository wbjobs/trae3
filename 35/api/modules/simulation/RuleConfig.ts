import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AIConfig {
  detectionRange: number;
  attackRange: number;
  moveSpeed: number;
  attackCooldown: number;
  wanderRadius: number;
  chaseDuration: number;
}

export interface SkillBalance {
  damageMultiplier: number;
  cooldownMultiplier: number;
  rangeMultiplier: number;
  costMultiplier: number;
}

export interface EntityBalance {
  healthMultiplier: number;
  speedMultiplier: number;
  damageMultiplier: number;
}

export interface SpawnRule {
  type: string;
  spawnInterval: number;
  maxCount: number;
  aiConfig: Partial<AIConfig>;
  balance: Partial<EntityBalance>;
}

export interface GameRules {
  gameDuration: number;
  maxPlayers: number;
  maxEntities: number;
  spawnRules: SpawnRule[];
  defaultAI: AIConfig;
  skillBalances: Record<string, SkillBalance>;
  entityBalances: Record<string, EntityBalance>;
  gravity: number;
  friction: number;
  collisionEnabled: boolean;
}

const DEFAULT_AI_CONFIG: AIConfig = {
  detectionRange: 300,
  attackRange: 80,
  moveSpeed: 80,
  attackCooldown: 1500,
  wanderRadius: 200,
  chaseDuration: 5000
};

const DEFAULT_GAME_RULES: GameRules = {
  gameDuration: 600000,
  maxPlayers: 8,
  maxEntities: 50,
  spawnRules: [
    {
      type: 'slime',
      spawnInterval: 8000,
      maxCount: 8,
      aiConfig: {
        detectionRange: 200,
        attackRange: 50,
        moveSpeed: 50,
        attackCooldown: 2000
      },
      balance: {}
    },
    {
      type: 'goblin',
      spawnInterval: 12000,
      maxCount: 5,
      aiConfig: {
        detectionRange: 350,
        attackRange: 70,
        moveSpeed: 100,
        attackCooldown: 1200
      },
      balance: {}
    },
    {
      type: 'boss',
      spawnInterval: 60000,
      maxCount: 1,
      aiConfig: {
        detectionRange: 500,
        attackRange: 120,
        moveSpeed: 60,
        attackCooldown: 2500
      },
      balance: {
        healthMultiplier: 3,
        damageMultiplier: 2
      }
    }
  ],
  defaultAI: DEFAULT_AI_CONFIG,
  skillBalances: {
    basic_attack: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    fireball: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    heal: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    dash: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    shield: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    lightning: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    frost: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 },
    whirlwind: { damageMultiplier: 1, cooldownMultiplier: 1, rangeMultiplier: 1, costMultiplier: 1 }
  },
  entityBalances: {
    player: { healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
    slime: { healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
    goblin: { healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 },
    boss: { healthMultiplier: 1, speedMultiplier: 1, damageMultiplier: 1 }
  },
  gravity: 0,
  friction: 0.98,
  collisionEnabled: true
};

export class RuleConfig {
  private static instance: RuleConfig;
  private config: GameRules;
  private configPath: string;

  private constructor() {
    this.configPath = path.resolve(__dirname, '..', '..', '..', 'config', 'game-rules.json');
    this.config = this.loadConfig();
  }

  static getInstance(): RuleConfig {
    if (!RuleConfig.instance) {
      RuleConfig.instance = new RuleConfig();
    }
    return RuleConfig.instance;
  }

  private loadConfig(): GameRules {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      if (fs.existsSync(this.configPath)) {
        const data = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        const merged = this.mergeConfigs(DEFAULT_GAME_RULES, data);
        console.log(`[RuleConfig] 已加载自定义游戏规则`);
        return merged;
      } else {
        this.saveConfig(DEFAULT_GAME_RULES);
        console.log(`[RuleConfig] 已创建默认游戏规则配置`);
        return DEFAULT_GAME_RULES;
      }
    } catch (e) {
      console.warn('[RuleConfig] 加载配置失败，使用默认规则:', e);
      return DEFAULT_GAME_RULES;
    }
  }

  private mergeConfigs(base: GameRules, override: Partial<GameRules>): GameRules {
    const result = { ...base, ...override };
    if (override.skillBalances) {
      result.skillBalances = { ...base.skillBalances, ...override.skillBalances };
    }
    if (override.entityBalances) {
      result.entityBalances = { ...base.entityBalances, ...override.entityBalances };
    }
    if (override.defaultAI) {
      result.defaultAI = { ...base.defaultAI, ...override.defaultAI };
    }
    if (override.spawnRules) {
      result.spawnRules = override.spawnRules;
    }
    return result;
  }

  private saveConfig(config: GameRules): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
    } catch (e) {
      console.error('[RuleConfig] 保存配置失败:', e);
    }
  }

  getRules(): GameRules {
    return this.config;
  }

  updateRules(updates: Partial<GameRules>): void {
    this.config = this.mergeConfigs(this.config, updates);
    this.saveConfig(this.config);
    console.log(`[RuleConfig] 游戏规则已更新`);
  }

  getSkillBalance(skillId: string): SkillBalance {
    return this.config.skillBalances[skillId] || {
      damageMultiplier: 1,
      cooldownMultiplier: 1,
      rangeMultiplier: 1,
      costMultiplier: 1
    };
  }

  setSkillBalance(skillId: string, balance: Partial<SkillBalance>): void {
    const existing = this.getSkillBalance(skillId);
    this.config.skillBalances[skillId] = { ...existing, ...balance };
    this.saveConfig(this.config);
  }

  getEntityBalance(entityType: string): EntityBalance {
    return this.config.entityBalances[entityType] || {
      healthMultiplier: 1,
      speedMultiplier: 1,
      damageMultiplier: 1
    };
  }

  setEntityBalance(entityType: string, balance: Partial<EntityBalance>): void {
    const existing = this.getEntityBalance(entityType);
    this.config.entityBalances[entityType] = { ...existing, ...balance };
    this.saveConfig(this.config);
  }

  getAIConfig(entityType: string): AIConfig {
    const spawnRule = this.config.spawnRules.find(r => r.type === entityType);
    if (spawnRule?.aiConfig) {
      return { ...this.config.defaultAI, ...spawnRule.aiConfig };
    }
    return this.config.defaultAI;
  }

  setAIConfig(entityType: string, aiConfig: Partial<AIConfig>): void {
    const spawnRule = this.config.spawnRules.find(r => r.type === entityType);
    if (spawnRule) {
      spawnRule.aiConfig = { ...spawnRule.aiConfig, ...aiConfig };
      this.saveConfig(this.config);
    }
  }

  getSpawnRules(): SpawnRule[] {
    return this.config.spawnRules;
  }

  setSpawnRules(rules: SpawnRule[]): void {
    this.config.spawnRules = rules;
    this.saveConfig(this.config);
  }

  resetToDefaults(): void {
    this.config = DEFAULT_GAME_RULES;
    this.saveConfig(this.config);
    console.log(`[RuleConfig] 已重置为默认游戏规则`);
  }
}
