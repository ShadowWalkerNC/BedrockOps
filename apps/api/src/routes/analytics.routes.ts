import { Router, Response } from 'express';
import { db } from '@mc-admin/db';
import { OperationalMetrics } from '@mc-admin/analytics';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const analyticsRouter: Router = Router();

analyticsRouter.use(authenticateJwt);

// GET /api/v1/analytics/overview - operational rollups for the dashboard
analyticsRouter.get('/overview', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ overview: OperationalMetrics.overview(db) });
});
