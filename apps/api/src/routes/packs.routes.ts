import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { PackEngine } from '@mc-admin/templates';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const packsRouter: Router = Router();

packsRouter.use(authenticateJwt);

/** GET /api/v1/packs — first-party vetted pack catalog (Wave D1; not marketplace). */
packsRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  const packs = PackEngine.listCatalog().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    kind: p.kind,
    uuid: p.uuid,
    version: p.version,
    minEngineVersion: p.minEngineVersion,
    scriptApi: p.scriptApi,
    fileCount: Object.keys(p.files).length
  }));
  return res.json({ packs });
});

const applySchema = z.object({
  serverId: z.string().min(1),
  packId: z.string().min(1),
  levelName: z.string().min(1).optional(),
  /** When true, restart the realm after a successful pack write. */
  restart: z.boolean().optional().default(false)
});

/**
 * POST /api/v1/packs/apply — install + enable a vetted pack on a Realm.
 * Fails honestly when the agent is offline (never fakes success).
 */
packsRouter.post('/apply', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  const parse = applySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  let pack;
  try {
    pack = PackEngine.getPack(parse.data.packId);
  } catch (err: unknown) {
    return res.status(404).json({
      error: 'PACK_NOT_FOUND',
      message: err instanceof Error ? err.message : String(err)
    });
  }

  if (!PackEngine.isBdsCompatible(server.version, pack.minEngineVersion)) {
    return res.status(409).json({
      error: 'BDS_INCOMPATIBLE',
      message: `Server BDS ${server.version} is below pack min_engine_version ${pack.minEngineVersion.join('.')}`
    });
  }

  if (pack.scriptApi) {
    // Awareness only for D1 sample packs (none are Script API yet).
    return res.status(409).json({
      error: 'SCRIPT_API_UNSUPPORTED',
      message: 'Script API packs require additional BDS Script module checks (Wave D1 follow-on).'
    });
  }

  const plan = PackEngine.buildApplyPlan(pack.id, server, {
    levelName: parse.data.levelName
  });

  const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);
  const write = await provider.writePackFiles(server, { files: plan.files });

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'PACK_APPLY',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: {
      packId: pack.id,
      kind: pack.kind,
      levelName: plan.levelName,
      success: write.success,
      stub: write.stub,
      filesWritten: write.filesWritten,
      error: write.error
    }
  });

  if (!write.success) {
    return res.status(503).json({
      error: 'PACK_APPLY_DEFERRED',
      message: write.error || 'Agent offline — pack not written on host',
      pack: { id: pack.id, name: pack.name, kind: pack.kind },
      plan: { levelName: plan.levelName, fileCount: plan.files.length },
      write
    });
  }

  let restart: { success: boolean; stub?: boolean } | undefined;
  if (parse.data.restart) {
    const ok = await provider.restartServer(server);
    restart = { success: ok, stub: !ok };
    if (ok) {
      AuditLogger.record({
        actorId: req.user!.userId,
        actorName: req.user!.username,
        action: 'PACK_APPLY_RESTART',
        entityType: 'BedrockServer',
        entityId: server.id,
        metadata: { packId: pack.id }
      });
    }
  }

  return res.status(201).json({
    success: true,
    pack: { id: pack.id, name: pack.name, kind: pack.kind },
    plan: { levelName: plan.levelName, fileCount: plan.files.length },
    write,
    restart
  });
});
