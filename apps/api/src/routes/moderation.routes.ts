import { Router, Response } from 'express';
import { z } from 'zod';
import { db, ModerationType, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import {
  ModerationService,
  PlayerLogParser,
  AllowlistService,
  XboxIdentityService,
  playerTracker
} from '@mc-admin/moderation';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { agentGateway } from '../ws/agentGateway';

export const moderationRouter: Router = Router();

moderationRouter.use(authenticateJwt);

// GET /api/v1/moderation - List moderation actions (excludes soft-deleted)
moderationRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  const activeActions = db.moderationActions.filter((m) => !m.deletedAt);
  return res.json({ moderationActions: activeActions });
});

// GET /api/v1/moderation/players/search?q=
moderationRouter.get('/players/search', (req: AuthenticatedRequest, res: Response) => {
  const q = String(req.query.q || '');
  return res.json({
    players: ModerationService.searchPlayers(q),
    tracked: playerTracker
      .list()
      .filter((p) => p.gamertag.toLowerCase().includes(q.toLowerCase()) || p.xuid.includes(q))
  });
});

// GET /api/v1/moderation/players/:gamertag/history
moderationRouter.get('/players/:gamertag/history', (req: AuthenticatedRequest, res: Response) => {
  const history = ModerationService.getHistoryForPlayer(req.params.gamertag);
  const tracked = playerTracker.findByGamertag(req.params.gamertag);
  return res.json({ history, tracked });
});

// POST /api/v1/moderation/players/resolve — Gamertag <-> XUID
const resolveSchema = z
  .object({
    gamertag: z.string().optional(),
    xuid: z.string().optional()
  })
  .refine((v) => !!v.gamertag || !!v.xuid, { message: 'gamertag or xuid required' });

moderationRouter.post(
  '/players/resolve',
  requireRole(UserRole.MODERATOR),
  async (req: AuthenticatedRequest, res: Response) => {
    const parse = resolveSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const xbox = XboxIdentityService.fromEnv();
    const result = parse.data.gamertag
      ? await xbox.resolveGamertag(parse.data.gamertag)
      : await xbox.resolveXuid(parse.data.xuid!);

    return res.json({ resolution: result });
  }
);

// POST /api/v1/moderation/players/join — ingest BDS join log line or structured event
const joinSchema = z.object({
  serverId: z.string().optional(),
  line: z.string().optional(),
  gamertag: z.string().optional(),
  xuid: z.string().optional()
});

moderationRouter.post(
  '/players/join',
  requireRole(UserRole.MODERATOR),
  (req: AuthenticatedRequest, res: Response) => {
    const parse = joinSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    let gamertag = parse.data.gamertag;
    let xuid = parse.data.xuid;
    if (parse.data.line) {
      const parsed = PlayerLogParser.parseJoinLog(parse.data.line);
      if (!parsed) {
        return res.status(400).json({ error: 'INVALID_LOG', message: 'Not a player connected line' });
      }
      gamertag = parsed.gamertag;
      xuid = parsed.xuid;
    }

    if (!gamertag || !xuid) {
      return res.status(400).json({ error: 'INVALID_INPUT', message: 'gamertag and xuid required' });
    }

    const player = playerTracker.recordJoin({ gamertag, xuid, serverId: parse.data.serverId });
    return res.status(201).json({ player });
  }
);

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
    durationMinutes,
    serverId
  });

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

// POST /api/v1/moderation/:id/deactivate
moderationRouter.post(
  '/:id/deactivate',
  requireRole(UserRole.MODERATOR),
  (req: AuthenticatedRequest, res: Response) => {
    const action = ModerationService.deactivateAction(req.params.id);
    if (!action) {
      return res.status(404).json({ error: 'NOT_FOUND' });
    }
    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'MODERATION_DEACTIVATE',
      entityType: 'ModerationAction',
      entityId: action.id
    });
    return res.json({ moderationAction: action });
  }
);

// POST /api/v1/moderation/gdpr/anonymize
const gdprSchema = z.object({
  gamertagOrXuid: z.string().min(1)
});

moderationRouter.post(
  '/gdpr/anonymize',
  requireRole(UserRole.ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const parse = gdprSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const result = ModerationService.anonymizePlayer(parse.data.gamertagOrXuid);

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'MODERATION_GDPR_ANONYMIZE',
      entityType: 'ModerationAction',
      entityId: parse.data.gamertagOrXuid,
      metadata: { updated: result.updated }
    });

    return res.json({ result });
  }
);

// POST /api/v1/moderation/allowlist/sync
const allowlistSchema = z.object({
  serverId: z.string().min(1),
  entries: z
    .array(
      z.object({
        name: z.string().min(1),
        xuid: z.string().min(1),
        ignoresPlayerLimit: z.boolean().optional()
      })
    )
    .optional(),
  fromTrackedPlayers: z.boolean().optional().default(false)
});

moderationRouter.post(
  '/allowlist/sync',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    const parse = allowlistSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
    if (!server) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
    }

    const entries = parse.data.fromTrackedPlayers
      ? AllowlistService.fromPlayerTracker(playerTracker, server.id)
      : parse.data.entries || [];

    const plan = AllowlistService.prepareSync(server.id, server.serverPath, entries);

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'ALLOWLIST_SYNC',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: { entriesCount: plan.entriesCount, targetPath: plan.targetPath }
    });

    // Prefer live agent tunnel when connected; otherwise return the atomic write
    // plan for the operator/agent to apply offline (honest — no fake success).
    if (server.agentId && agentGateway.isNodeConnected(server.agentId)) {
      try {
        const agentResult = (await agentGateway.sendCommand(server.agentId, server.id, 'ALLOWLIST_SYNC', {
          entries,
          targetPath: plan.targetPath,
          tempPath: plan.tempPath,
          contents: plan.contents,
          reloadCommand: plan.reloadCommand
        })) as { success?: boolean; stub?: boolean; error?: string };

        // The agent honestly reports when it cannot apply the write (e.g. the
        // ALLOWLIST_SYNC handler is not yet wired on this agent build).
        if (agentResult?.success === false) {
          return res.status(503).json({
            success: false,
            stub: agentResult.stub ?? true,
            plan,
            agentResult,
            message: agentResult.error || 'Agent could not apply allowlist write.'
          });
        }

        // Best-effort RCON reload via HostProvider once the file is in place.
        const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);
        const reload = await provider.executeRcon(server, plan.reloadCommand);

        return res.json({ success: true, plan, agentResult, reload });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return res.status(503).json({ success: false, plan, message });
      }
    }

    return res.status(202).json({
      success: true,
      stub: true,
      plan,
      message: '[STUB] Agent not connected — returning atomic allowlist write plan for offline apply.'
    });
  }
);
