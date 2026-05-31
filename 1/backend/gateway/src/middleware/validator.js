import Joi from 'joi'

const schemas = {
  login: Joi.object({
    username: Joi.string().min(3).max(50).required().messages({
      'string.empty': '用户名不能为空',
      'string.min': '用户名长度不能少于3个字符',
      'string.max': '用户名长度不能超过50个字符',
      'any.required': '用户名是必填项'
    }),
    password: Joi.string().min(6).max(50).required().messages({
      'string.empty': '密码不能为空',
      'string.min': '密码长度不能少于6个字符',
      'string.max': '密码长度不能超过50个字符',
      'any.required': '密码是必填项'
    }),
    environment: Joi.string().valid('development', 'production').required().messages({
      'any.only': '环境必须是 development 或 production',
      'any.required': '环境是必填项'
    })
  }),

  nodeQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    keyword: Joi.string().allow('').optional(),
    status: Joi.string().valid('online', 'offline', 'warning', 'error').optional(),
    roomId: Joi.string().optional()
  }),

  nodeId: Joi.object({
    id: Joi.string().guid({ version: ['uuidv4'] }).required().messages({
      'string.guid': '无效的节点ID格式',
      'any.required': '节点ID是必填项'
    })
  }),

  metricQuery: Joi.object({
    nodeId: Joi.string().guid({ version: ['uuidv4'] }).required(),
    hours: Joi.number().integer().min(1).max(720).default(24)
  }),

  roomQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    region: Joi.string().valid('north', 'south', 'east', 'west', 'central').optional(),
    status: Joi.string().valid('active', 'maintenance', 'offline').optional()
  }),

  auditQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(100).default(20),
    keyword: Joi.string().allow('').optional(),
    module: Joi.string().valid('auth', 'node', 'room', 'audit', 'settings', 'collector').optional(),
    username: Joi.string().optional(),
    startTime: Joi.string().isoDate().optional(),
    endTime: Joi.string().isoDate().optional()
  }),

  traceQuery: Joi.object({
    traceId: Joi.string().guid({ version: ['uuidv4'] }).required().messages({
      'string.guid': '无效的追踪ID格式',
      'any.required': '追踪ID是必填项'
    })
  })
}

export default function validateMiddleware(schemaName, location = 'body') {
  return async (ctx, next) => {
    const traceLogger = ctx.traceLogger
    const schema = schemas[schemaName]

    if (!schema) {
      traceLogger.error(`未找到验证 schema: ${schemaName}`)
      throw new Error(`未找到验证 schema: ${schemaName}`)
    }

    let data = {}
    if (location === 'body') {
      data = ctx.request.body
    } else if (location === 'query') {
      data = ctx.query
    } else if (location === 'params') {
      data = ctx.params
    }

    traceLogger.debug(`参数验证: ${schemaName}`, { data })

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    })

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))

      traceLogger.warn('参数验证失败', { errors })

      ctx.status = 400
      ctx.body = {
        code: 400,
        message: '参数验证失败',
        data: { errors },
        traceId: traceLogger.traceId,
        timestamp: Date.now()
      }
      return
    }

    if (location === 'query') {
      ctx.validatedQuery = value
    } else if (location === 'params') {
      ctx.validatedParams = value
    } else {
      ctx.validatedBody = value
    }

    await next()
  }
}

export { schemas }
