import express from 'express';
import { RuleConfig, type GameRules, type SkillBalance, type EntityBalance, type AIConfig, type SpawnRule } from '../modules/simulation/RuleConfig.js';

const router = express.Router();

router.get('/', (req, res) => {
  const config = RuleConfig.getInstance();
  res.json({
    success: true,
    rules: config.getRules()
  });
});

router.put('/', (req, res) => {
  try {
    const updates = req.body as Partial<GameRules>;
    const config = RuleConfig.getInstance();
    config.updateRules(updates);
    res.json({
      success: true,
      rules: config.getRules(),
      message: '游戏规则已更新'
    });
  } catch (error) {
    console.error('[Rules API] 更新规则失败:', error);
    res.status(500).json({
      success: false,
      error: '更新规则失败'
    });
  }
});

router.get('/skills', (req, res) => {
  const config = RuleConfig.getInstance();
  const rules = config.getRules();
  res.json({
    success: true,
    skillBalances: rules.skillBalances
  });
});

router.get('/skills/:skillId', (req, res) => {
  const config = RuleConfig.getInstance();
  const balance = config.getSkillBalance(req.params.skillId);
  res.json({
    success: true,
    skillId: req.params.skillId,
    balance
  });
});

router.put('/skills/:skillId', (req, res) => {
  try {
    const { skillId } = req.params;
    const balance = req.body as Partial<SkillBalance>;
    const config = RuleConfig.getInstance();
    config.setSkillBalance(skillId, balance);
    res.json({
      success: true,
      skillId,
      balance: config.getSkillBalance(skillId),
      message: '技能平衡已更新'
    });
  } catch (error) {
    console.error('[Rules API] 更新技能平衡失败:', error);
    res.status(500).json({
      success: false,
      error: '更新技能平衡失败'
    });
  }
});

router.get('/entities', (req, res) => {
  const config = RuleConfig.getInstance();
  const rules = config.getRules();
  res.json({
    success: true,
    entityBalances: rules.entityBalances
  });
});

router.get('/entities/:entityType', (req, res) => {
  const config = RuleConfig.getInstance();
  const balance = config.getEntityBalance(req.params.entityType);
  res.json({
    success: true,
    entityType: req.params.entityType,
    balance
  });
});

router.put('/entities/:entityType', (req, res) => {
  try {
    const { entityType } = req.params;
    const balance = req.body as Partial<EntityBalance>;
    const config = RuleConfig.getInstance();
    config.setEntityBalance(entityType, balance);
    res.json({
      success: true,
      entityType,
      balance: config.getEntityBalance(entityType),
      message: '实体平衡已更新'
    });
  } catch (error) {
    console.error('[Rules API] 更新实体平衡失败:', error);
    res.status(500).json({
      success: false,
      error: '更新实体平衡失败'
    });
  }
});

router.get('/ai/:entityType', (req, res) => {
  const config = RuleConfig.getInstance();
  const aiConfig = config.getAIConfig(req.params.entityType);
  res.json({
    success: true,
    entityType: req.params.entityType,
    aiConfig
  });
});

router.put('/ai/:entityType', (req, res) => {
  try {
    const { entityType } = req.params;
    const aiConfig = req.body as Partial<AIConfig>;
    const config = RuleConfig.getInstance();
    config.setAIConfig(entityType, aiConfig);
    res.json({
      success: true,
      entityType,
      aiConfig: config.getAIConfig(entityType),
      message: 'AI配置已更新'
    });
  } catch (error) {
    console.error('[Rules API] 更新AI配置失败:', error);
    res.status(500).json({
      success: false,
      error: '更新AI配置失败'
    });
  }
});

router.get('/spawn-rules', (req, res) => {
  const config = RuleConfig.getInstance();
  res.json({
    success: true,
    spawnRules: config.getSpawnRules()
  });
});

router.put('/spawn-rules', (req, res) => {
  try {
    const rules = req.body as SpawnRule[];
    const config = RuleConfig.getInstance();
    config.setSpawnRules(rules);
    res.json({
      success: true,
      spawnRules: config.getSpawnRules(),
      message: '刷怪规则已更新'
    });
  } catch (error) {
    console.error('[Rules API] 更新刷怪规则失败:', error);
    res.status(500).json({
      success: false,
      error: '更新刷怪规则失败'
    });
  }
});

router.post('/reset', (req, res) => {
  try {
    const config = RuleConfig.getInstance();
    config.resetToDefaults();
    res.json({
      success: true,
      rules: config.getRules(),
      message: '已重置为默认规则'
    });
  } catch (error) {
    console.error('[Rules API] 重置规则失败:', error);
    res.status(500).json({
      success: false,
      error: '重置规则失败'
    });
  }
});

export default router;
