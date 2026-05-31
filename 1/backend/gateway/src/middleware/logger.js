import { TraceLogger } from '../utils/logger.js'
import { AuditLogRepository, TraceSpanRepository } from 'persistence'
import config from '../config/index.js'

export default function loggerMiddleware() {
  return async (ctx, next) => {
    const traceLogger = new TraceLogger()
    ctx.traceLogger = traceLogger
    ctx.traceId = traceLogger.traceId

    const startTime = Date.now()
    const spanStart = startTime

    traceLogger.info(`请求开始: ${ctx.method} ${ctx.path}`, {
      ip: ctx.ip,
      userAgent: ctx.headers['user-agent'],
      params: ctx.request.body || ctx.query
    })

    ctx.set('X-Trace-Id', traceLogger.traceId)

    try {
      await next()

      const duration = Date.now() - startTime

      if (ctx.state.user && !config.publicPaths.includes(ctx.path)) {
        try {
          const nodeId = extractNodeId(ctx.path, ctx.params)
          const roomId = extractRoomId(ctx.path, ctx.params)

          await AuditLogRepository.createLog({
            traceId: traceLogger.traceId,
            userId: ctx.state.user.id,
            username: ctx.state.user.username,
            action: `${ctx.method} ${ctx.path}`,
            content: getActionDescription(ctx.method, ctx.path, ctx.params),
            module: getModuleFromPath(ctx.path),
            ip: ctx.ip,
            userAgent: ctx.headers['user-agent'] || null,
            params: {
              body: ctx.request.body,
              query: ctx.query,
              params: ctx.params
            },
            result: ctx.status < 400 ? 'success' : 'failed',
            duration,
            errorMessage: ctx.status >= 400 ? ctx.body?.message : null,
            nodeId,
            roomId
          })

          await TraceSpanRepository.createSpan({
            traceId: traceLogger.traceId,
            parentSpanId: null,
            service: 'gateway',
            operation: `${ctx.method} ${ctx.path}`,
            startTime: spanStart,
            endTime: Date.now(),
            status: ctx.status < 400 ? 'success' : 'error',
            errorMessage: ctx.status >= 400 ? ctx.body?.message : null,
            nodeId,
            tags: {
              statusCode: ctx.status,
              duration
            }
          })
        } catch (logError) {
          traceLogger.error('写入审计日志失败', { error: logError.message })
        }
      }

      traceLogger.info(`请求完成: ${ctx.method} ${ctx.path}`, {
        status: ctx.status,
        duration: `${duration}ms`
      })
    } catch (error) {
      const duration = Date.now() - startTime

      if (ctx.state.user) {
        try {
          const nodeId = extractNodeId(ctx.path, ctx.params)
          const roomId = extractRoomId(ctx.path, ctx.params)

          await AuditLogRepository.createLog({
            traceId: traceLogger.traceId,
            userId: ctx.state.user.id,
            username: ctx.state.user.username,
            action: `${ctx.method} ${ctx.path}`,
            content: getActionDescription(ctx.method, ctx.path, ctx.params),
            module: getModuleFromPath(ctx.path),
            ip: ctx.ip,
            userAgent: ctx.headers['user-agent'] || null,
            params: {
              body: ctx.request.body,
              query: ctx.query,
              params: ctx.params
            },
            result: 'failed',
            duration,
            errorMessage: error.message || '未知错误',
            nodeId,
            roomId
          })

          await TraceSpanRepository.createSpan({
            traceId: traceLogger.traceId,
            parentSpanId: null,
            service: 'gateway',
            operation: `${ctx.method} ${ctx.path}`,
            startTime: spanStart,
            endTime: Date.now(),
            status: 'error',
            errorMessage: error.message,
            nodeId,
            tags: {
              statusCode: error.status || 500,
              duration,
              errorCode: error.code
            }
          })
        } catch (logError) {
          traceLogger.error('写入异常审计日志失败', { error: logError.message })
        }
      }

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
        traceId: traceLogger.traceId,
        timestamp: Date.now()
      }
    }
  }
}

function getModuleFromPath(path) {
  if (path.includes('/auth')) return 'auth'
  if (path.includes('/node')) return 'node'
  if (path.includes('/room')) return 'room'
  if (path.includes('/audit')) return 'audit'
  if (path.includes('/collector')) return 'collector'
  if (path.includes('/settings')) return 'settings'
  return 'other'
}

function extractNodeId(path, params) {
  if (params && params.id && path.includes('/node')) {
    return params.id
  }
  return null
}

function extractRoomId(path, params) {
  if (params && params.id && path.includes('/room')) {
    return params.id
  }
  return null
}

function getActionDescription(method, path, params) {
  const module = getModuleFromPath(path)
  const actionMap = {
    auth: {
      POST: '用户登录',
      GET: '获取认证信息'
    },
    node: {
      GET: params?.id ? `查看节点 ${params.id}` : '查看节点列表',
      POST: `控制节点 ${params?.id || ''}`,
      PUT: `更新节点 ${params?.id || ''}`
    },
    room: {
      GET: params?.id ? `查看机房 ${params.id}` : '查看机房列表',
      POST: `操作机房 ${params?.id || ''}`,
      PUT: `更新机房 ${params?.id || ''}`
    },
    collector: {
      GET: '查看采集状态',
      POST: '触发采集操作'
    },
    audit: {
      GET: '查看审计日志'
    },
    settings: {
      GET: '查看系统配置',
      POST: '修改系统配置',
      PUT: '更新系统配置'
    }
  }

  return actionMap[module]?.[method] || `${method} ${path}`
}
