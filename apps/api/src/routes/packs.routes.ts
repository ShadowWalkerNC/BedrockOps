import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { PackEngine, type PackCategory, type PackKind } from '@mc-admin/templates';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const packsRouter: Router = Router();

packsRouter.use(authenticateJwt);

function toPublicPack(p: ReturnType<typeof PackEngine.listCatalog>[number]) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    kind: p.kind,
    category: p.category,
    tags: p.tags,
    publisher: p.publisher,
    vetted: p.vetted,
    uuid: p.uuid,
    version: p.version,
    minEngineVersion: p.minEngineVersion,
    scriptApi: p.scriptApi,
    fileCount: Object.keys(p.files).length,
    applyBlockedReason: p.scriptApi
      ? 'Script API packs require additional BDS Script module checks'
      : undefined
  };
}

/** GET /api/v1/packs — first-party marketplace catalog (Wave D4). */
packsRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const kind = typeof req.query.kind === 'string' ? (req.query.kind as PackKind) : undefined;
  const category =
    typeof req.query.category === 'string' ? (req.query.category as PackCategory) : undefined;
  const tag = typeof req.query.tag === 'string' ? req.query.tag : undefined;
  const vettedOnly =
    req.query.vettedOnly === '1' ||
    req.query.vettedOnly === 'true' ||
    req.query.vettedOnly === undefined;

  if (kind && kind !== 'behavior' && kind !== 'resource') {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'kind must be behavior|resource' });
  }
  const allowedCategories = ['starter', 'gameplay', 'cosmetic', 'utility'];
  if (category && !allowedCategories.includes(category)) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'invalid category' });
  }

  const packs = PackEngine.listCatalog({ q, kind, category, tag, vettedOnly }).map(toPublicPack);
  return res.json({
    packs,
    facets: PackEngine.listFacets(),
    marketplace: {
      publisher: 'BedrockOps',
      note: 'First-party vetted catalog only — not the Mojang Marketplace.'
    }
  });
});

const applySchema = z.object({
  serverId: z.string().min(1),
  packId: z.string().min(1),
  levelName: z.string().min(1).optional(),
  /** When true, restart the realm after a successful pack write. */
  restart: z.boolean().optional().default(false)
});

/**
 * POST /api/v1/packs/apply — one-click apply a vetted catalog pack to a Realm.
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

  if (!pack.vetted) {
    return res.status(403).json({
      error: 'PACK_NOT_VETTED',
      message: `Pack ${pack.id} is not vetted for one-click apply`
    });
  }

  if (!PackEngine.isBdsCompatible(server.version, pack.minEngineVersion)) {
    return res.status(409).json({
      error: 'BDS_INCOMPATIBLE',
      message: `Server BDS ${server.version} is below pack min_engine_version ${pack.minEngineVersion.join('.')}`
    });
  }

  if (pack.scriptApi) {
    return res.status(409).json({
      error: 'SCRIPT_API_UNSUPPORTED',
      message: 'Script API packs require additional BDS Script module checks (Wave D follow-on).'
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
      category: pack.category,
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
      pack: toPublicPack(pack),
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
    pack: toPublicPack(pack),
    plan: { levelName: plan.levelName, fileCount: plan.files.length },
    write,
    restart
  });
});
