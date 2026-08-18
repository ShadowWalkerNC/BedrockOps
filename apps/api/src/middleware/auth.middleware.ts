import { Request, Response, NextFunction } from 'express';
import { verifyJwt, hasPermission, AuthSession } from '@mc-admin/auth';
import { UserRole } from '@mc-admin/db';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user?: AuthSession;
}

export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyJwt<AuthSession>(token, config.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired JWT token' });
  }
}

export function requireRole(requiredRole: UserRole | UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User context missing' });
    }
    const allowed = Array.isArray(requiredRole)
      ? requiredRole.some((r) => hasPermission(req.user!.role, r))
      : hasPermission(req.user.role, requiredRole);

    if (!allowed) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Insufficient permissions. Required role: ${Array.isArray(requiredRole) ? requiredRole.join(', ') : requiredRole}`
      });
    }
    next();
  };
}
