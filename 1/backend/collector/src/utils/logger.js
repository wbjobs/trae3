import winston from 'winston'
import config from '../config/index.js'
import { v4 as uuidv4 } from 'uuid'

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, traceId, ...meta }) => {
          return `[${timestamp}] [${level}] [${service || config.serviceName}] [${traceId || '-'}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
        })
      )
    }),
    new winston.transports.File({
      filename: `logs/${config.env}-error.log`,
      level: 'error'
    }),
    new winston.transports.File({
      filename: `logs/${config.env}-combined.log`
    })
  ]
})

export class TraceLogger {
  constructor(traceId = null) {
    this.traceId = traceId || uuidv4()
  }

  log(level, message, meta = {}) {
    logger.log(level, message, {
      traceId: this.traceId,
      service: config.serviceName,
      ...meta
    })
  }

  info(message, meta) {
    this.log('info', message, meta)
  }

  warn(message, meta) {
    this.log('warn', message, meta)
  }

  error(message, meta) {
    this.log('error', message, meta)
  }

  debug(message, meta) {
    this.log('debug', message, meta)
  }

  createSpan(operation) {
    return new Span(this.traceId, operation)
  }
}

export class Span {
  constructor(traceId, operation) {
    this.traceId = traceId
    this.operation = operation
    this.startTime = Date.now()
    this.tags = {}
  }

  setTag(key, value) {
    this.tags[key] = value
    return this
  }

  finish(status = 'success') {
    this.endTime = Date.now()
    return {
      traceId: this.traceId,
      operation: this.operation,
      startTime: this.startTime,
      endTime: this.endTime,
      status,
      tags: this.tags
    }
  }
}

export { logger }
export default logger
