import { Router, Response } from 'express';
import { db, MODE_EXPERIMENT_HINTS } from '@mc-admin/db';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const templatesRouter: Router = Router();

templatesRouter.use(authenticateJwt);

/** GET /api/v1/templates — mode catalog with declared packs + experiment hints (D2). */
templatesRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    templates: db.templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      bdsVersion: t.bdsVersion,
      defaultProperties: t.defaultProperties,
      addonPacks: t.addonPacks,
      experiments: MODE_EXPERIMENT_HINTS[t.id] || [],
      experimentsApplied: false,
      experimentsNote:
        'World experiments need level.dat edits — listed for awareness only until a NBT writer ships.',
      createdAt: t.createdAt
    }))
  });
});
