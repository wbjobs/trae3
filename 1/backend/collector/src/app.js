import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import config from './config/index.js'
import logger, { TraceLogger } from './utils/logger.js'
import collectorRouter from './router/collectorRouter.js'
import collectScheduler from './scheduler/CollectScheduler.js'

const app = new Koa()

app.use(cors({
  origin: '*',
  credentials: true
}))

app.use(bodyParser({
  jsonLimit: '10mb'
}))

app.use(async (ctx, next) => {
  const traceLogger = new TraceLogger()
  ctx.traceLogger = traceLogger

  const start = Date.now()
  traceLogger.info(`请求开始: ${ctx.method} ${ctx.path}`, {
    ip: ctx.ip,
    userAgent: ctx.headers['user-agent']
  })

  try {
    await next()

    const duration = Date.now() - start
    traceLogger.info(`请求完成: ${ctx.method} ${ctx.path}`, {
      status: ctx.status,
      duration: `${duration}ms`
    })
  } catch (error) {
    const duration = Date.now() - start
    traceLogger.error(`请求异常: ${ctx.method} ${ctx.path}`, {
      status: ctx.status || 500,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`
    })

    ctx.status = error.status || 500
    ctx.body = {
      code: ctx.status,
      message: error.message || '服务器内部错误',
      data: null,
      timestamp: Date.now()
    }
  }
})

app.use(collectorRouter.routes())
app.use(collectorRouter.allowedMethods())

async function startServer() {
  const traceLogger = new TraceLogger()

  try {
    traceLogger.info(`正在启动采集服务...`, {
      env: config.env,
      port: config.port
    })

    const server = app.listen(config.port, () => {
      traceLogger.info(`采集服务启动成功`, {
        url: `http://127.0.0.1:${config.port}`,
        env: config.env
      })
    })

    await collectScheduler.start()

    return server
  } catch (error) {
    traceLogger.error('采集服务启动失败', { error: error.message })
    process.exit(1)
  }
}

process.on('SIGINT', async () => {
  logger.info('收到 SIGINT 信号，正在优雅关闭...')
  await collectScheduler.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM 信号，正在优雅关闭...')
  await collectScheduler.stop()
  process.exit(0)
})

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', { error: error.message, stack: error.stack })
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝', {
    reason: reason?.message || reason,
    promise: promise?.toString()
  })
})

if (process.argv[1] === import.meta.url.substring(7)) {
  startServer()
}

export { app, startServer }
export default app
