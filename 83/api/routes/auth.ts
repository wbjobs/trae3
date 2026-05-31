import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getMetadataDb } from '../db/index.js';
import { LoginRequest, LoginResponse, ApiResponse, User, UserRole } from '../../shared/types.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'rubbing-system-secret-key';

export function verifyToken(token: string): { id: string; username: string; role: UserRole } {
  return jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: UserRole };
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: UserRole;
  };
}

export function authenticateToken(req: AuthRequest, res: Response, next: () => void): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ success: false, message: '未提供认证令牌' });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    res.status(403).json({ success: false, message: '认证令牌无效或已过期' });
  }
}

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body as LoginRequest;

  if (!username || !password) {
    res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    return;
  }

  const db = getMetadataDb();

  const user = db.prepare(`
    SELECT id, username, email, password_hash, role, is_active 
    FROM users 
    WHERE username = ?
  `).get(username) as Record<string, unknown> | undefined;

  if (!user) {
    res.status(401).json({ success: false, message: '用户名或密码错误' });
    return;
  }

  if (!user.is_active) {
    res.status(403).json({ success: false, message: '账号已被禁用' });
    return;
  }

  const isValid = bcrypt.compareSync(password, user.password_hash as string);

  if (!isValid) {
    res.status(401).json({ success: false, message: '用户名或密码错误' });
    return;
  }

  const userInfo: User = {
    id: user.id as string,
    username: user.username as string,
    email: user.email as string,
    role: user.role as UserRole,
    isActive: user.is_active === 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const token = jwt.sign(
    { id: userInfo.id, username: userInfo.username, role: userInfo.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const response: ApiResponse<LoginResponse> = {
    success: true,
    data: {
      token,
      user: userInfo,
    },
  };

  res.json(response);
});

router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const db = getMetadataDb();
  const user = db.prepare(`
    SELECT id, username, email, role, is_active, created_at, updated_at
    FROM users WHERE id = ?
  `).get(req.user.id) as Record<string, unknown> | undefined;

  if (!user) {
    res.status(404).json({ success: false, message: '用户不存在' });
    return;
  }

  const userInfo: User = {
    id: user.id as string,
    username: user.username as string,
    email: user.email as string,
    role: user.role as UserRole,
    isActive: user.is_active === 1,
    createdAt: user.created_at as string,
    updatedAt: user.updated_at as string,
  };

  res.json({ success: true, data: userInfo });
});

router.post('/logout', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ success: true, message: '登出成功' });
});

export default router;
