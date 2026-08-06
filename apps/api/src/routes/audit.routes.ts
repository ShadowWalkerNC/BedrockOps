import { Router, Response } from 'express';
import { db } from '@mc-admin/db';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const auditRouter: Router = Router();

auditRouter.use(authenticateJwt);

// GET /api/v1/audit - List audit logs
auditRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ auditLogs: db.auditLogs });
});
