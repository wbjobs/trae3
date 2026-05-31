import { TraceLogger } from '../utils/logger.js'

export default function errorHandler() {
  return async (ctx, next) => {
    try {
      await next()
    } catch (error) {
      const traceLogger = ctx.traceLogger || new TraceLogger()

      traceLogger.error(`未捕获异常: ${ctx.method} ${ctx.path}`, {
        error: error.message,
        stack: error.stack,
        code: error.code
      })

      let status = error.status || 500
      let message = '服务器内部错误'

      if (error.code === 'REQUEST_TIMEOUT') {
        status = 504
        message = '请求处理超时，请稍后重试'
      } else if (status === 401) {
        message = '认证失败，请重新登录'
      } else if (status === 403) {
        message = '权限不足，拒绝访问'
      } else if (status === 404) {
        message = error.message || '资源不存在'
      } else if (status === 422) {
        message = error.message || '参数校验失败'
      } else if (status === 502) {
        message = '上游服务异常'
      } else if (status === 503) {
        message = error.message || '服务暂时不可用'
      } else if (status === 504) {
        message = error.message || '上游服务响应超时'
      } else if (status >= 400 && status < 500) {
        message = error.message || message
      } else {
        message = '服务器内部错误，请联系管理员'
      }

      ctx.status = status
      ctx.body = {
        code: status,
        message,
        data: null,
        traceId: ctx.traceId || traceLogger.traceId,
        timestamp: Date.now()
      }
    }
  }
}
