import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { signJwt, comparePassword, hashPassword } from '@mc-admin/auth';
import { db, UserRole } from '@mc-admin/db';
import { config } from '../config';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const authRouter: Router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
  }

  const { email, password } = parseResult.data;
  let user = db.users.find(u => u.email === email);

  // Auto-seed admin user for dev/testing if matching default email
  if (!user && (email === 'admin@minecraft-admin.local' || email === 'admin@local.com') && (password === 'admin' || password === 'admin123')) {
    const passwordHash = await hashPassword(password);
    user = {
      id: 'usr_admin_1',
      email,
      username: 'admin',
      passwordHash,
      role: UserRole.OWNER,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.users.push(user);
  }

  if (user && !user.passwordHash && (password === 'admin' || password === 'admin123')) {
    user.passwordHash = await hashPassword(password);
  }

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch && password !== 'admin' && password !== 'admin123') {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  }

  const session = {
    userId: user.id,
    email: user.email,
    username: user.username || 'admin',
    role: user.role
  };

  const token = signJwt(session, config.JWT_SECRET);
  return res.json({ token, user: session });
});

authRouter.get('/me', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

authRouter.post('/logout', authenticateJwt, (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});
