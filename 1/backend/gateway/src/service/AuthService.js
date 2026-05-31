import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import config from '../config/index.js'
import { UserRepository } from 'persistence'

class AuthService {
  async login(username, password, environment, traceLogger) {
    const spanStart = Date.now()

    traceLogger.debug('用户登录验证', { username, environment })

    const user = await UserRepository.findByUsername(username)

    if (!user) {
      traceLogger.warn('用户不存在', { username })
      return {
        success: false,
        code: 401,
        message: '用户名或密码错误'
      }
    }

    if (user.status !== 'active') {
      traceLogger.warn('用户已被禁用', { username, status: user.status })
      return {
        success: false,
        code: 403,
        message: '用户已被禁用，请联系管理员'
      }
    }

    const isValidPassword = await user.validatePassword(password)

    if (!isValidPassword) {
      traceLogger.warn('密码错误', { username })
      return {
        success: false,
        code: 401,
        message: '用户名或密码错误'
      }
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        environment
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    )

    const userInfo = {
      id: user.id,
      username: user.username,
      role: user.role,
      environment,
      loginTime: new Date().toISOString()
    }

    traceLogger.info('用户登录成功', {
      userId: user.id,
      username: user.username,
      role: user.role,
      environment
    })

    return {
      success: true,
      code: 200,
      message: '登录成功',
      data: {
        token,
        user: userInfo,
        expiresIn: config.jwt.expiresIn
      },
      span: {
        operation: 'user_login',
        startTime: spanStart,
        endTime: Date.now(),
        status: 'success',
        tags: { username, userId: user.id }
      }
    }
  }

  async logout(userId, traceLogger) {
    traceLogger.info('用户登出', { userId })
    return {
      success: true,
      message: '登出成功'
    }
  }

  async getCurrentUser(userId, traceLogger) {
    traceLogger.debug('获取当前用户信息', { userId })

    const user = await UserRepository.findById(userId)

    if (!user) {
      return {
        success: false,
        code: 404,
        message: '用户不存在'
      }
    }

    return {
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt
      }
    }
  }

  async changePassword(userId, oldPassword, newPassword, traceLogger) {
    const user = await UserRepository.findById(userId)

    if (!user) {
      return {
        success: false,
        code: 404,
        message: '用户不存在'
      }
    }

    const isValidPassword = await user.validatePassword(oldPassword)

    if (!isValidPassword) {
      return {
        success: false,
        code: 400,
        message: '原密码错误'
      }
    }

    user.password = newPassword
    await user.save()

    traceLogger.info('密码修改成功', { userId })

    return {
      success: true,
      message: '密码修改成功'
    }
  }
}

export default new AuthService()
