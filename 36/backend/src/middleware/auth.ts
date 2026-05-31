import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { Logger } from '../utils/logger';

const logger = new Logger('AuthMiddleware');

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.apiKey) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API key' });
  }

  next();
}

export function corsMiddleware() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
    
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    
    next();
  };
}

export function requestLogger(req: Request, _res: Response, next: NextFunction) {
  logger.debug(`${req.method} ${req.path} - ${req.ip}`);
  next();
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error('Request error', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' });
}
