import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { BdsVersionMatrix } from '@mc-admin/bedrock';
import { BackupEngine } from '@mc-admin/backups';
import { SCRIPT_API_MATRIX, PackEngine } from '@mc-admin/templates';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const versionsRouter: Router = Router();

versionsRouter.use(authenticateJwt);

// GET /api/v1/versions - BDS version catalog + latest + Script API matrix
versionsRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    versions: BdsVersionMatrix.list(db),
    latest: BdsVersionMatrix.latest(db) ?? null,
    scriptApiMatrix: SCRIPT_API_MATRIX
  });
});

// GET /api/v1/versions/script-matrix — Script API compatibility rows
versionsRouter.get('/script-matrix', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ matrix: SCRIPT_API_MATRIX });
});

// GET /api/v1/versions/servers/:id/check - drift check for a server's pinned version
versionsRouter.get('/servers/:id/check', (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }
  const check = BdsVersionMatrix.checkServer(server, db);
  const scriptPacks = PackEngine.listCatalog({ vettedOnly: true })
    .filter((p) => p.scriptApi)
    .map((p) => ({
      packId: p.id,
      ...PackEngine.checkScriptCompatibility(server.version, p)
    }));
  return res.json({ check, scriptPacks });
});

// POST /api/v1/versions/servers/:id/pin - pin a BDS version (optionally backup-before-update)
const pinSchema = z.object({
  version: z.string().min(1),
  backupBefore: z.boolean().optional().default(true)
});

versionsRouter.post('/servers/:id/pin', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }
  const parse = pinSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  // Take a safety snapshot before changing the pinned version when requested.
  let backup;
  if (parse.data.backupBefore) {
    backup = BackupEngine.triggerBackup({
      serverId: server.id,
      isManual: false,
      notes: `Pre-update snapshot before pinning BDS ${parse.data.version}`
    });
  }

  const result = BdsVersionMatrix.pin(server, parse.data.version, { backupBefore: parse.data.backupBefore }, db);
  const check = BdsVersionMatrix.checkServer(server, db);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'BDS_VERSION_PIN',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: {
      from: result.previousVersion,
      to: result.version,
      supported: result.supported,
      backupId: backup?.id
    }
  });

  return res.json({ result, check, backup });
});
