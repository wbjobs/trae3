import jwt from 'jsonwebtoken'
import config from '../config/index.js'
import { UserRepository } from 'persistence'

const rolePermissions = {
  admin: ['*'],
  operator: ['node:view', 'node:control', 'room:view', 'room:control', 'audit:view'],
  viewer: ['node:view', 'room:view', 'audit:view']
}

export default function authMiddleware(permission = null) {
  return async (ctx, next) => {
    const traceLogger = ctx.traceLogger

    if (config.publicPaths.includes(ctx.path)) {
      await next()
      return
    }

    const authHeader = ctx.headers['authorization']

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      traceLogger.warn('未提供认证令牌')
      ctx.status = 401
      ctx.body = {
        code: 401,
        message: '未提供认证令牌',
        data: null,
        traceId: traceLogger.traceId,
        timestamp: Date.now()
      }
      return
    }

    const token = authHeader.substring(7)

    try {
      const decoded = jwt.verify(token, config.jwt.secret)

      const user = await UserRepository.findById(decoded.userId)

      if (!user || user.status !== 'active') {
        traceLogger.warn('用户不存在或已被禁用', { userId: decoded.userId })
        ctx.status = 401
        ctx.body = {
          code: 401,
          message: '用户不存在或已被禁用',
          data: null,
          traceId: traceLogger.traceId,
          timestamp: Date.now()
        }
        return
      }

      if (decoded.environment && decoded.environment !== config.env) {
        traceLogger.warn('环境不匹配', {
          tokenEnv: decoded.environment,
          currentEnv: config.env
        })
        ctx.status = 403
        ctx.body = {
          code: 403,
          message: '令牌环境不匹配，请重新登录',
          data: null,
          traceId: traceLogger.traceId,
          timestamp: Date.now()
        }
        return
      }

      if (permission && !checkPermission(user.role, permission)) {
        traceLogger.warn('权限不足', {
          userId: user.id,
          role: user.role,
          requiredPermission: permission
        })
        ctx.status = 403
        ctx.body = {
          code: 403,
          message: '权限不足，无法执行此操作',
          data: null,
          traceId: traceLogger.traceId,
          timestamp: Date.now()
        }
        return
      }

      ctx.state.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        environment: decoded.environment
      }

      traceLogger.debug('用户认证通过', {
        userId: user.id,
        username: user.username,
        role: user.role
      })

      await next()
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        traceLogger.warn('令牌已过期')
        ctx.status = 401
        ctx.body = {
          code: 401,
          message: '令牌已过期，请重新登录',
          data: null,
          traceId: traceLogger.traceId,
          timestamp: Date.now()
        }
      } else if (error.name === 'JsonWebTokenError') {
        traceLogger.warn('无效的令牌', { error: error.message })
        ctx.status = 401
        ctx.body = {
          code: 401,
          message: '无效的认证令牌',
          data: null,
          traceId: traceLogger.traceId,
          timestamp: Date.now()
        }
      } else {
        throw error
      }
    }
  }
}

function checkPermission(userRole, requiredPermission) {
  const permissions = rolePermissions[userRole] || []

  if (permissions.includes('*')) {
    return true
  }

  return permissions.includes(requiredPermission)
}
