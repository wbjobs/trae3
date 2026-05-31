import { Router, type Request, type Response } from 'express';
import { authenticate, getAllUsers, createUser, updateUser, deleteUser } from '../services/auth.js';
import { requireAuth, requirePermission } from '../middleware/permission.js';

const router = Router();

router.post('/login', (req: Request, res: Response): void => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ success: false, error: 'username and password are required' });
    return;
  }

  const user = authenticate(username, password);
  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  res.json({ success: true, data: { token: user.id, user } });
});

router.get('/me', requireAuth, (req: Request, res: Response): void => {
  res.json({ success: true, data: res.locals.user });
});

router.get('/users', requireAuth, requirePermission('system:admin'), (req: Request, res: Response): void => {
  const users = getAllUsers();
  res.json({ success: true, data: users });
});

router.post('/users', requireAuth, requirePermission('system:admin'), (req: Request, res: Response): void => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ success: false, error: 'username, password and role are required' });
    return;
  }

  try {
    const user = createUser(username, password, role);
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint')) {
      res.status(409).json({ success: false, error: 'Username already exists' });
    } else {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

router.put('/users/:id', requireAuth, requirePermission('system:admin'), (req: Request, res: Response): void => {
  const { username, password, role } = req.body;
  const user = updateUser(req.params.id, { username, password, role });
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: user });
});

router.delete('/users/:id', requireAuth, requirePermission('system:admin'), (req: Request, res: Response): void => {
  const deleted = deleteUser(req.params.id);
  if (!deleted) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  res.json({ success: true, data: null });
});

export default router;
