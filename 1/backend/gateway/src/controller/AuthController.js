import authService from '../service/AuthService.js'

class AuthController {
  async login(ctx) {
    const { username, password, environment } = ctx.validatedBody
    const traceLogger = ctx.traceLogger

    const result = await authService.login(username, password, environment, traceLogger)

    ctx.status = result.code
    ctx.body = {
      code: result.code,
      message: result.message,
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async logout(ctx) {
    const traceLogger = ctx.traceLogger
    const userId = ctx.state.user.id

    await authService.logout(userId, traceLogger)

    ctx.body = {
      code: 200,
      message: '登出成功',
      data: null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async currentUser(ctx) {
    const traceLogger = ctx.traceLogger
    const userId = ctx.state.user.id

    const result = await authService.getCurrentUser(userId, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message || 'success',
      data: result.data || null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }

  async changePassword(ctx) {
    const traceLogger = ctx.traceLogger
    const userId = ctx.state.user.id
    const { oldPassword, newPassword } = ctx.request.body

    const result = await authService.changePassword(userId, oldPassword, newPassword, traceLogger)

    ctx.status = result.code || 200
    ctx.body = {
      code: result.code || 200,
      message: result.message,
      data: null,
      traceId: traceLogger.traceId,
      timestamp: Date.now()
    }
  }
}

export default new AuthController()
