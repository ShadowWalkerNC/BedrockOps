import { Router, Response } from 'express';
import { db } from '@mc-admin/db';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const templatesRouter: Router = Router();

templatesRouter.use(authenticateJwt);

/** GET /api/v1/templates — list realm templates (read-only; pack install is Wave D). */
templatesRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    templates: db.templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      bdsVersion: t.bdsVersion,
      defaultProperties: t.defaultProperties,
      addonPacks: t.addonPacks,
      createdAt: t.createdAt
    }))
  });
});
