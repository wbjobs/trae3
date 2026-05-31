import Router from 'koa-router'
import collectScheduler from '../scheduler/CollectScheduler.js'
import { TraceLogger } from '../utils/logger.js'

const router = new Router({ prefix: '/api/collector' })

router.get('/status', async (ctx) => {
  const traceLogger = new TraceLogger()
  traceLogger.info('查询采集服务状态')

  ctx.body = {
    code: 200,
    message: 'success',
    data: collectScheduler.getStatus(),
    timestamp: Date.now()
  }
})

router.post('/collect/:nodeId', async (ctx) => {
  const traceLogger = new TraceLogger()
  const { nodeId } = ctx.params

  traceLogger.info('手动触发节点采集', { nodeId })

  const result = await collectScheduler.manualCollect(nodeId)

  if (!result) {
    ctx.status = 404
    ctx.body = {
      code: 404,
      message: '未找到该节点的采集任务',
      data: null,
      timestamp: Date.now()
    }
    return
  }

  ctx.body = {
    code: 200,
    message: 'success',
    data: result,
    timestamp: Date.now()
  }
})

router.post('/collect/all', async (ctx) => {
  const traceLogger = new TraceLogger()
  traceLogger.info('手动触发全部节点采集')

  const status = collectScheduler.getStatus()
  const results = []

  for (const task of status.tasks) {
    const result = await collectScheduler.manualCollect(task.nodeId)
    if (result) {
      results.push(result)
    }
  }

  ctx.body = {
    code: 200,
    message: 'success',
    data: {
      total: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    },
    timestamp: Date.now()
  }
})

router.post('/control/start', async (ctx) => {
  const traceLogger = new TraceLogger()
  traceLogger.info('启动采集服务')

  await collectScheduler.start()

  ctx.body = {
    code: 200,
    message: '采集服务已启动',
    data: collectScheduler.getStatus(),
    timestamp: Date.now()
  }
})

router.post('/control/stop', async (ctx) => {
  const traceLogger = new TraceLogger()
  traceLogger.info('停止采集服务')

  await collectScheduler.stop()

  ctx.body = {
    code: 200,
    message: '采集服务已停止',
    data: collectScheduler.getStatus(),
    timestamp: Date.now()
  }
})

router.post('/task/:nodeId', async (ctx) => {
  const traceLogger = new TraceLogger()
  const { nodeId } = ctx.params
  const { interval = 30000, node } = ctx.request.body

  traceLogger.info('添加采集任务', { nodeId, interval })

  collectScheduler.addTask(nodeId, interval, node)

  ctx.body = {
    code: 200,
    message: '采集任务已添加',
    data: { nodeId, interval },
    timestamp: Date.now()
  }
})

router.delete('/task/:nodeId', async (ctx) => {
  const traceLogger = new TraceLogger()
  const { nodeId } = ctx.params

  traceLogger.info('删除采集任务', { nodeId })

  collectScheduler.removeTask(nodeId)

  ctx.body = {
    code: 200,
    message: '采集任务已删除',
    data: { nodeId },
    timestamp: Date.now()
  }
})

export default router
