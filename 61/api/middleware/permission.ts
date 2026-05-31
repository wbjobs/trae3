import type { Request, Response, NextFunction } from 'express';
import { getUserById, hasPermission } from '../services/auth.js';
import type { Permission, Role } from '../../shared/types.js';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization required' });
    return;
  }

  const userId = authHeader.slice(7);
  const user = getUserById(userId);
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid token' });
    return;
  }

  res.locals.user = user;
  next();
}

export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user;
    if (!user) {
      res.status(401).json({ success: false, error: 'Authorization required' });
      return;
    }

    const role = user.role as Role;
    for (const perm of permissions) {
      if (!hasPermission(role, perm)) {
        res.status(403).json({ success: false, error: `Permission denied: ${perm}` });
        return;
      }
    }

    next();
  };
}
