import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { HostProviderFactory, applyWorldExperiments } from '@mc-admin/bedrock';
import { TemplateEngine, PackEngine } from '@mc-admin/templates';
import {
  PipelineEngine,
  DnsProvider,
  SubdomainAllocator,
  defaultPortPool,
  generateSubdomain
} from '@mc-admin/pipelines';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const provisioningRouter: Router = Router();

provisioningRouter.use(authenticateJwt);

const allocator = new SubdomainAllocator(defaultPortPool, DnsProvider.fromEnv());

// GET /api/v1/provisioning/ports
provisioningRouter.get('/ports', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({
    leases: defaultPortPool.listLeases(),
    remaining: defaultPortPool.remaining(),
    range: { min: 19132, max: 19999 }
  });
});

// POST /api/v1/provisioning/network — allocate play subdomain + UDP port
const networkSchema = z.object({
  serverId: z.string().min(1),
  nodeIp: z.string().min(1),
  subdomain: z.string().optional(),
  preferredPort: z.number().int().optional()
});

provisioningRouter.post('/network', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  const parse = networkSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  try {
    const allocation = await allocator.allocate({
      serverId: parse.data.serverId,
      nodeIp: parse.data.nodeIp,
      subdomain: parse.data.subdomain || generateSubdomain(parse.data.serverId),
      preferredPort: parse.data.preferredPort
    });

    server.host = allocation.fqdn;
    server.port = allocation.port;
    server.updatedAt = new Date();

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'NETWORK_ALLOCATE',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: {
        fqdn: allocation.fqdn,
        port: allocation.port,
        stub: allocation.dns.stub,
        liveError: allocation.dns.liveError
      }
    });

    return res.status(201).json({ allocation, server });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(409).json({ error: 'ALLOCATION_FAILED', message });
  }
});

// DELETE /api/v1/provisioning/network/:serverId — release subdomain + port
provisioningRouter.delete(
  '/network/:serverId',
  requireRole(UserRole.ADMIN),
  (req: AuthenticatedRequest, res: Response) => {
    const server = db.servers.find((s) => s.id === req.params.serverId && !s.deletedAt);
    const subdomain = typeof req.query.subdomain === 'string' ? req.query.subdomain : undefined;
    const result = allocator.deallocate(req.params.serverId, subdomain);

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'NETWORK_DEALLOCATE',
      entityType: 'BedrockServer',
      entityId: req.params.serverId,
      metadata: result
    });

    return res.json({ success: true, ...result, server });
  }
);

// POST /api/v1/provisioning/setup — run automated setup pipeline (R5.3)
const setupSchema = z.object({
  serverName: z.string().min(1),
  templateId: z.string().min(1),
  webhookUrl: z.string().url().optional(),
  allocateNetwork: z.boolean().optional().default(false),
  nodeIp: z.string().optional(),
  subdomain: z.string().optional(),
  preferredPort: z.number().int().optional(),
  /** When true (default), also install template.addonPacks via the pack engine. */
  applyPacks: z.boolean().optional().default(true),
  /** When true (default), patch level.dat experiment flags for the mode. */
  applyExperiments: z.boolean().optional().default(true)
});

provisioningRouter.post('/setup', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  const parse = setupSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const result = await PipelineEngine.runServerSetupPipeline({
    ...parse.data,
    actorName: req.user!.username
  });

  const provider = HostProviderFactory.getProvider(result.server.hostProvider || HostProviderType.DOCKER_AGENT);

  let propertiesWrite: { success: boolean; stub?: boolean; path?: string; error?: string } | undefined;
  if (result.propertiesPlan) {
    propertiesWrite = await provider.writeServerProperties(result.server, result.propertiesPlan);
    result.run.logs.push(
      propertiesWrite.success
        ? `[Step 2b/4] Wrote server.properties via agent → ${propertiesWrite.path}`
        : `[Step 2b/4] Properties write deferred: ${propertiesWrite.error || 'agent offline (honest stub)'}`
    );
  }

  const packWrites = parse.data.applyPacks
    ? await applyDeclaredPacks(result.server, parse.data.templateId, provider, result.run.logs)
    : [];

  const experimentIds = TemplateEngine.getExperimentHints(parse.data.templateId);
  const levelName = PackEngine.resolveLevelName(result.propertiesPlan?.contents);
  const experimentsWrite = parse.data.applyExperiments
    ? await applyWorldExperiments(provider, result.server, experimentIds, { levelName })
    : { success: true, applied: [] as string[] };

  if (parse.data.applyExperiments) {
    result.run.logs.push(
      experimentsWrite.success
        ? `[Experiments] Applied ${experimentsWrite.applied.join(', ') || '(none)'} → ${experimentsWrite.relativePath || 'level.dat'}`
        : `[Experiments] Deferred: ${experimentsWrite.error || 'agent offline'}`
    );
  }

  return res.status(201).json({
    ...result,
    propertiesWrite,
    packWrites,
    experiments: experimentIds,
    experimentsApplied: !!experimentsWrite.success && experimentIds.length > 0,
    experimentsWrite
  });
});

// POST /api/v1/provisioning/apply-template — re-apply mode properties (+ optional packs)
const applyTemplateSchema = z.object({
  serverId: z.string().min(1),
  templateId: z.string().min(1),
  applyPacks: z.boolean().optional().default(true),
  applyExperiments: z.boolean().optional().default(true)
});

provisioningRouter.post(
  '/apply-template',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    const parse = applyTemplateSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
    if (!server) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
    }

    let propertiesPlan;
    try {
      TemplateEngine.applyTemplateToServer(parse.data.templateId, server);
      propertiesPlan = TemplateEngine.buildPropertiesWritePlan(parse.data.templateId, server);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: 'TEMPLATE_APPLY_FAILED', message });
    }

    const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);
    const propertiesWrite = await provider.writeServerProperties(server, propertiesPlan);
    const logs: string[] = [];
    const packWrites = parse.data.applyPacks
      ? await applyDeclaredPacks(server, parse.data.templateId, provider, logs)
      : [];

    const experimentIds = TemplateEngine.getExperimentHints(parse.data.templateId);
    const levelName = PackEngine.resolveLevelName(propertiesPlan.contents);
    const experimentsWrite = parse.data.applyExperiments
      ? await applyWorldExperiments(provider, server, experimentIds, { levelName })
      : { success: true, applied: [] as string[] };

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'TEMPLATE_PROPERTIES_APPLY',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: {
        templateId: parse.data.templateId,
        path: propertiesPlan.targetPath,
        success: propertiesWrite.success,
        stub: propertiesWrite.stub,
        error: propertiesWrite.error,
        packWrites: packWrites.map((p) => ({
          packId: p.packId,
          success: p.success,
          stub: p.stub,
          error: p.error
        })),
        experimentsApplied: !!experimentsWrite.success && experimentIds.length > 0,
        experimentsWrite: {
          success: experimentsWrite.success,
          stub: experimentsWrite.stub,
          applied: experimentsWrite.applied,
          error: experimentsWrite.error
        }
      }
    });

    if (!propertiesWrite.success) {
      return res.status(503).json({
        error: 'PROPERTIES_WRITE_DEFERRED',
        message: propertiesWrite.error || 'Agent offline — server.properties not written',
        server: toPublicServerSafe(server),
        propertiesPlan: { targetPath: propertiesPlan.targetPath, templateId: propertiesPlan.templateId },
        propertiesWrite,
        packWrites,
        experiments: experimentIds,
        experimentsApplied: false,
        experimentsWrite
      });
    }

    return res.json({
      success: true,
      server: toPublicServerSafe(server),
      propertiesPlan: { targetPath: propertiesPlan.targetPath, templateId: propertiesPlan.templateId },
      propertiesWrite,
      packWrites,
      experiments: experimentIds,
      experimentsApplied: !!experimentsWrite.success && experimentIds.length > 0,
      experimentsWrite
    });
  }
);

async function applyDeclaredPacks(
  server: (typeof db.servers)[number],
  templateId: string,
  provider: ReturnType<typeof HostProviderFactory.getProvider>,
  logs: string[]
): Promise<
  Array<{ packId: string; success: boolean; stub?: boolean; error?: string; filesWritten?: number }>
> {
  const planned = TemplateEngine.buildDeclaredPackPlans(templateId, server);
  const out: Array<{
    packId: string;
    success: boolean;
    stub?: boolean;
    error?: string;
    filesWritten?: number;
  }> = [];

  for (const item of planned) {
    if (!item.plan) {
      out.push({ packId: item.packId, success: false, error: item.error || 'pack plan failed' });
      logs.push(`[Packs] ${item.packId}: ${item.error || 'plan failed'}`);
      continue;
    }
    const write = await provider.writePackFiles(server, { files: item.plan.files });
    out.push({
      packId: item.packId,
      success: !!write.success,
      stub: write.stub,
      error: write.error,
      filesWritten: write.filesWritten
    });
    logs.push(
      write.success
        ? `[Packs] Installed ${item.packId} (${write.filesWritten ?? item.plan.files.length} files)`
        : `[Packs] ${item.packId} deferred: ${write.error || 'agent offline'}`
    );
  }
  return out;
}

function toPublicServerSafe(server: (typeof db.servers)[number]) {
  const { rconPassword: _omit, ...rest } = server;
  return { ...rest, hasRconPassword: Boolean(server.rconPassword) };
}

// POST /api/v1/provisioning/onboarding/console — console player onboarding (R5.2)
const onboardingSchema = z.object({
  gamertag: z.string().min(1),
  serverId: z.string().min(1),
  ignoresPlayerLimit: z.boolean().optional(),
  autoAcceptInvite: z.boolean().optional().default(false)
});

provisioningRouter.post(
  '/onboarding/console',
  requireRole(UserRole.MODERATOR),
  async (req: AuthenticatedRequest, res: Response) => {
    const parse = onboardingSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
    if (!server) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
    }

    const result = await PipelineEngine.onboardConsolePlayer({
      gamertag: parse.data.gamertag,
      serverId: server.id,
      serverPath: server.serverPath,
      ignoresPlayerLimit: parse.data.ignoresPlayerLimit,
      autoAcceptInvite: parse.data.autoAcceptInvite
    });

    AuditLogger.record({
      actorId: req.user!.userId,
      actorName: req.user!.username,
      action: 'CONSOLE_ONBOARDING',
      entityType: 'BedrockServer',
      entityId: server.id,
      metadata: {
        gamertag: result.gamertag,
        xuid: result.xuid,
        inviteStatus: result.invite.status,
        stub: result.stub
      }
    });

    return res.status(201).json({ onboarding: result, server });
  }
);
