import Koa from 'koa'
import cors from '@koa/cors'
import bodyParser from 'koa-bodyparser'
import config from './config/index.js'
import logger, { TraceLogger } from './utils/logger.js'
import timeoutMiddleware from './middleware/timeout.js'
import errorHandler from './middleware/errorHandler.js'
import loggerMiddleware from './middleware/logger.js'
import rateLimit from './middleware/rateLimit.js'
import responseCache from './middleware/responseCache.js'
import requestBatch from './middleware/requestBatch.js'
import authRouter from './router/authRouter.js'
import nodeRouter from './router/nodeRouter.js'
import roomRouter from './router/roomRouter.js'
import auditRouter from './router/auditRouter.js'
import collectorRouter from './router/collectorRouter.js'

const app = new Koa()

app.use(errorHandler())
app.use(rateLimit())
app.use(cors({
  origin: '*',
  credentials: true,
  exposeHeaders: ['X-Trace-Id']
}))

app.use(bodyParser({
  jsonLimit: '10mb',
  formLimit: '10mb'
}))

app.use(timeoutMiddleware(30000))

app.use(loggerMiddleware())
app.use(responseCache())
app.use(requestBatch())

app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = {
      code: 200,
      message: 'ok',
      data: {
        status: 'running',
        environment: config.env,
        timestamp: Date.now()
      }
    }
    return
  }
  await next()
})

app.use(authRouter.routes())
app.use(authRouter.allowedMethods())

app.use(nodeRouter.routes())
app.use(nodeRouter.allowedMethods())

app.use(roomRouter.routes())
app.use(roomRouter.allowedMethods())

app.use(auditRouter.routes())
app.use(auditRouter.allowedMethods())

app.use(collectorRouter.routes())
app.use(collectorRouter.allowedMethods())

app.use(async (ctx) => {
  ctx.status = 404
  ctx.body = {
    code: 404,
    message: '接口不存在',
    data: null,
    traceId: ctx.traceId,
    timestamp: Date.now()
  }
})

async function startServer() {
  const traceLogger = new TraceLogger()

  try {
    traceLogger.info(`正在启动 API 网关...`, {
      env: config.env,
      port: config.port
    })

    const server = app.listen(config.port, () => {
      traceLogger.info(`API 网关启动成功`, {
        env: config.env,
        port: config.port,
        url: `http://localhost:${config.port}`
      })

      logger.info(`========================================`)
      logger.info(`  跨机房分布式节点状态溯源系统 - API 网关`)
      logger.info(`  环境: ${config.env}`)
      logger.info(`  端口: ${config.port}`)
      logger.info(`  地址: http://localhost:${config.port}`)
      logger.info(`========================================`)
    })

    process.on('SIGINT', () => {
      traceLogger.info('收到 SIGINT 信号，正在关闭服务...')
      server.close(() => {
        traceLogger.info('服务已正常关闭')
        process.exit(0)
      })

      setTimeout(() => {
        traceLogger.error('服务强制关闭')
        process.exit(1)
      }, 10000)
    })

    process.on('SIGTERM', () => {
      traceLogger.info('收到 SIGTERM 信号，正在关闭服务...')
      server.close(() => {
        traceLogger.info('服务已正常关闭')
        process.exit(0)
      })
    })

    process.on('uncaughtException', (error) => {
      traceLogger.error('未捕获的异常', {
        error: error.message,
        stack: error.stack
      })
    })

    process.on('unhandledRejection', (reason, promise) => {
      traceLogger.error('未处理的 Promise 拒绝', {
        reason: reason?.message || reason,
        stack: reason?.stack
      })
    })

    return server
  } catch (error) {
    traceLogger.error('API 网关启动失败', {
      error: error.message,
      stack: error.stack
    })
    process.exit(1)
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer()
}

export default app
export { startServer }
