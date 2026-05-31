const Router = require('koa-router');
const { StrategyModel } = require('../database');
const { success, error, handleAsync, validateParams, Logger } = require('../common');

const logger = new Logger('StrategyRoutes');
const router = new Router({ prefix: '/api/strategy' });

router.get('/', handleAsync(async (ctx) => {
  logger.info('Get all strategies');
  
  const strategies = await StrategyModel.getAll();
  ctx.body = success(strategies, '获取策略列表成功');
}));

router.get('/enabled', handleAsync(async (ctx) => {
  logger.info('Get enabled strategies');
  
  const strategies = await StrategyModel.getEnabled();
  ctx.body = success(strategies, '获取启用策略成功');
}));

router.get('/:strategyId', handleAsync(async (ctx) => {
  const { strategyId } = ctx.params;
  logger.info(`Get strategy: ${strategyId}`);
  
  const validation = validateParams(ctx.params, ['strategyId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const strategy = await StrategyModel.getById(strategyId);
  if (!strategy) {
    ctx.status = 404;
    ctx.body = error('策略不存在', 404);
    return;
  }
  
  ctx.body = success(strategy, '获取策略详情成功');
}));

router.post('/', handleAsync(async (ctx) => {
  const strategyData = ctx.request.body;
  logger.info('Create strategy:', strategyData.name);
  
  const validation = validateParams(strategyData, ['name', 'trigger_condition', 'actions']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  if (!Array.isArray(strategyData.actions) || strategyData.actions.length === 0) {
    ctx.status = 400;
    ctx.body = error('actions 必须是非空数组', 400);
    return;
  }

  const triggerCondition = typeof strategyData.trigger_condition === 'string'
    ? JSON.parse(strategyData.trigger_condition)
    : strategyData.trigger_condition;

  if (!triggerCondition.metric || !triggerCondition.operator) {
    ctx.status = 400;
    ctx.body = error('trigger_condition 必须包含 metric 和 operator 字段', 400);
    return;
  }

  const validOperators = ['gt', 'lt', 'gte', 'lte', 'eq', 'neq'];
  if (!validOperators.includes(triggerCondition.operator)) {
    ctx.status = 400;
    ctx.body = error(`无效的操作符，必须是: ${validOperators.join(', ')}`, 400);
    return;
  }

  const strategy = await StrategyModel.create(strategyData);
  ctx.body = success(strategy, '创建策略成功');
}));

router.put('/:strategyId', handleAsync(async (ctx) => {
  const { strategyId } = ctx.params;
  const strategyData = ctx.request.body;
  logger.info(`Update strategy: ${strategyId}`);
  
  const validation = validateParams({ strategyId, ...strategyData }, ['strategyId', 'name', 'trigger_condition', 'actions']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const strategy = await StrategyModel.update(strategyId, strategyData);
  if (!strategy) {
    ctx.status = 404;
    ctx.body = error('策略不存在', 404);
    return;
  }
  
  ctx.body = success(strategy, '更新策略成功');
}));

router.put('/:strategyId/toggle', handleAsync(async (ctx) => {
  const { strategyId } = ctx.params;
  const { enabled } = ctx.request.body;
  logger.info(`Toggle strategy: ${strategyId} -> ${enabled}`);
  
  const validation = validateParams({ strategyId, enabled }, ['strategyId', 'enabled']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  if (typeof enabled !== 'boolean') {
    ctx.status = 400;
    ctx.body = error('enabled 必须是布尔值', 400);
    return;
  }

  const strategy = await StrategyModel.toggleEnabled(strategyId, enabled);
  if (!strategy) {
    ctx.status = 404;
    ctx.body = error('策略不存在', 404);
    return;
  }
  
  ctx.body = success(strategy, enabled ? '策略已启用' : '策略已禁用');
}));

router.delete('/:strategyId', handleAsync(async (ctx) => {
  const { strategyId } = ctx.params;
  logger.info(`Delete strategy: ${strategyId}`);
  
  const validation = validateParams(ctx.params, ['strategyId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const strategy = await StrategyModel.delete(strategyId);
  if (!strategy) {
    ctx.status = 404;
    ctx.body = error('策略不存在', 404);
    return;
  }
  
  ctx.body = success(strategy, '删除策略成功');
}));

router.get('/:strategyId/executions', handleAsync(async (ctx) => {
  const { strategyId } = ctx.params;
  const { limit = 50 } = ctx.query;
  logger.info(`Get executions for strategy: ${strategyId}`);
  
  const validation = validateParams(ctx.params, ['strategyId']);
  if (!validation.valid) {
    ctx.status = 400;
    ctx.body = error(`缺少必要参数: ${validation.missing.join(', ')}`, 400);
    return;
  }

  const limitNum = parseInt(limit);
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    ctx.status = 400;
    ctx.body = error('limit 参数必须是 1-1000 之间的整数', 400);
    return;
  }

  const executions = await StrategyModel.getExecutions(strategyId, limitNum);
  ctx.body = success(executions, '获取执行日志成功');
}));

module.exports = router;
