import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getLogger } from '../modules/logger';

const logger = getLogger('APIMiddleware');

export interface RequestContext {
  requestId: string;
  traceId: string;
  startTime: number;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.context = {
    requestId: uuidv4(),
    traceId: req.headers['x-trace-id'] as string || uuidv4(),
    startTime: Date.now(),
  };

  res.setHeader('X-Request-Id', req.context.requestId);
  res.setHeader('X-Trace-Id', req.context.traceId);

  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  logger.info('请求开始', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  }, req.context?.requestId, req.context?.traceId);

  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - (req.context?.startTime || Date.now());
    logger.info('请求完成', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    }, req.context?.requestId, req.context?.traceId);
    return originalSend.call(this, body);
  };

  next();
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error('请求处理错误', err, req.context?.requestId, req.context?.traceId);

  res.status(500).json({
    success: false,
    code: 500,
    message: '内部服务器错误',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    requestId: req.context?.requestId,
    timestamp: Date.now(),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('请求路径不存在', {
    method: req.method,
    path: req.path,
  }, req.context?.requestId, req.context?.traceId);

  res.status(404).json({
    success: false,
    code: 404,
    message: '请求的资源不存在',
    requestId: req.context?.requestId,
    timestamp: Date.now(),
  });
}

export function validateMessage(req: Request, res: Response, next: NextFunction): void {
  const { type, priority, payload } = req.body;

  if (!type || !['command', 'event', 'notification'].includes(type)) {
    res.status(400).json({
      success: false,
      code: 400,
      message: '无效的消息类型，必须是 command、event 或 notification',
      requestId: req.context?.requestId,
      timestamp: Date.now(),
    });
    return;
  }

  if (!priority || !['low', 'normal', 'high', 'critical'].includes(priority)) {
    res.status(400).json({
      success: false,
      code: 400,
      message: '无效的优先级，必须是 low、normal、high 或 critical',
      requestId: req.context?.requestId,
      timestamp: Date.now(),
    });
    return;
  }

  if (!payload || typeof payload !== 'object') {
    res.status(400).json({
      success: false,
      code: 400,
      message: '无效的消息负载',
      requestId: req.context?.requestId,
      timestamp: Date.now(),
    });
    return;
  }

  next();
}
