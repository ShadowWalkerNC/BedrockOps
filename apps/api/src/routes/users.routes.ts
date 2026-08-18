import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole } from '@mc-admin/db';
import { hashPassword } from '@mc-admin/auth';
import { AuditLogger } from '@mc-admin/audit';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const usersRouter: Router = Router();

usersRouter.use(authenticateJwt);

const createUserSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(4),
  role: z.nativeEnum(UserRole).default(UserRole.VIEWER)
});

const updateUserSchema = z.object({
  username: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(4).optional(),
  role: z.nativeEnum(UserRole).optional()
});

/** GET /api/v1/users - List users (Admin/Owner only) */
usersRouter.get('/', requireRole([UserRole.OWNER, UserRole.ADMIN]), (_req: AuthenticatedRequest, res: Response) => {
  const safeUsers = db.users.map((u) => ({
    id: u.id,
    username: u.username || 'unknown',
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  }));
  return res.json({ users: safeUsers });
});

/** POST /api/v1/users - Create user (Admin/Owner only) */
usersRouter.post('/', requireRole([UserRole.OWNER, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const { username, email, password, role } = parse.data;
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'USER_EXISTS', message: 'User with this email already exists' });
  }

  const passwordHash = await hashPassword(password);
  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    username,
    email,
    passwordHash,
    role,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.users.push(newUser);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'USER_CREATE',
    entityType: 'User',
    entityId: newUser.id,
    metadata: { username, email, role }
  });

  return res.status(201).json({
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt
    }
  });
});

/** PATCH /api/v1/users/:id - Update user */
usersRouter.patch('/:id', requireRole([UserRole.OWNER, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const user = db.users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
  }

  const parse = updateUserSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const { username, email, password, role } = parse.data;
  if (username) user.username = username;
  if (email) user.email = email;
  if (role) user.role = role;
  if (password) user.passwordHash = await hashPassword(password);
  user.updatedAt = new Date();

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'USER_UPDATE',
    entityType: 'User',
    entityId: user.id,
    metadata: { username, email, role }
  });

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      updatedAt: user.updatedAt
    }
  });
});

/** DELETE /api/v1/users/:id - Delete user */
usersRouter.delete('/:id', requireRole([UserRole.OWNER, UserRole.ADMIN]), (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found' });
  }

  if (db.users[index].id === req.user!.userId) {
    return res.status(400).json({ error: 'SELF_DELETE', message: 'Cannot delete your own active account' });
  }

  const [deleted] = db.users.splice(index, 1);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'USER_DELETE',
    entityType: 'User',
    entityId: deleted.id,
    metadata: { username: deleted.username, email: deleted.email }
  });

  return res.json({ success: true, message: 'User deleted successfully' });
});
