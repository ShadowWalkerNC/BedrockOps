import { Router, Response } from 'express';
import { z } from 'zod';
import { db, ModerationType, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { ModerationService } from '@mc-admin/moderation';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const moderationRouter: Router = Router();

moderationRouter.use(authenticateJwt);

// GET /api/v1/moderation - List moderation actions
moderationRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  const activeActions = db.moderationActions.filter(m => !m.deletedAt);
  return res.json({ moderationActions: activeActions });
});

// POST /api/v1/moderation - Create moderation action
const createModerationSchema = z.object({
  gamertag: z.string().min(1),
  playerXuid: z.string().optional(),
  actionType: z.enum(['WARN', 'MUTE', 'KICK', 'BAN', 'NOTE']),
  reason: z.string().min(1),
  serverId: z.string().optional(),
  durationMinutes: z.number().optional()
});

moderationRouter.post('/', requireRole(UserRole.MODERATOR), (req: AuthenticatedRequest, res: Response) => {
  const parse = createModerationSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const { gamertag, playerXuid, actionType, reason, serverId, durationMinutes } = parse.data;

  const action = ModerationService.createAction({
    gamertag,
    playerXuid,
    actionType: actionType as ModerationType,
    reason,
    issuerId: req.user!.userId,
    issuerName: req.user!.username,
    durationMinutes
  });
  if (serverId) {
    action.serverId = serverId;
  }

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: `MODERATION_${actionType}`,
    entityType: 'ModerationAction',
    entityId: action.id,
    metadata: { gamertag, reason }
  });

  return res.status(201).json({ moderationAction: action });
});
