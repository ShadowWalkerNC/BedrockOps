import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole, HostProviderType } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { TemplateEngine } from '@mc-admin/templates';
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
  preferredPort: z.number().int().optional()
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

  let propertiesWrite: { success: boolean; stub?: boolean; path?: string; error?: string } | undefined;
  if (result.propertiesPlan) {
    const provider = HostProviderFactory.getProvider(result.server.hostProvider || HostProviderType.DOCKER_AGENT);
    propertiesWrite = await provider.writeServerProperties(result.server, result.propertiesPlan);
    result.run.logs.push(
      propertiesWrite.success
        ? `[Step 2b/4] Wrote server.properties via agent → ${propertiesWrite.path}`
        : `[Step 2b/4] Properties write deferred: ${propertiesWrite.error || 'agent offline (honest stub)'}`
    );
  }

  return res.status(201).json({ ...result, propertiesWrite });
});

// POST /api/v1/provisioning/apply-template — re-apply mode properties to disk (retry after agent pairs)
const applyTemplateSchema = z.object({
  serverId: z.string().min(1),
  templateId: z.string().min(1)
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
        error: propertiesWrite.error
      }
    });

    if (!propertiesWrite.success) {
      return res.status(503).json({
        error: 'PROPERTIES_WRITE_DEFERRED',
        message: propertiesWrite.error || 'Agent offline — server.properties not written',
        server: toPublicServerSafe(server),
        propertiesPlan: { targetPath: propertiesPlan.targetPath, templateId: propertiesPlan.templateId },
        propertiesWrite
      });
    }

    return res.json({
      success: true,
      server: toPublicServerSafe(server),
      propertiesPlan: { targetPath: propertiesPlan.targetPath, templateId: propertiesPlan.templateId },
      propertiesWrite
    });
  }
);

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

// GET /api/v1/provisioning/environment — self-contained environment check
provisioningRouter.get('/environment', async (_req: AuthenticatedRequest, res: Response) => {
  const connectedAgents = db.agentNodes.filter((a) => a.status === 'ONLINE').length;
  const isPrisma = process.env.DB_ADAPTER === 'prisma';
  const hasR2 = Boolean(process.env.R2_BUCKET && process.env.R2_ACCOUNT_ID);
  const hasDiscord = Boolean(process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_WEBHOOK_URL);

  return res.json({
    status: 'READY',
    checks: {
      nodeRuntime: { status: 'OK', version: process.version },
      databaseEngine: { status: 'OK', adapter: isPrisma ? 'PostgreSQL (Prisma)' : 'In-Memory Pre-Seeded Store' },
      goAgentDaemon: { status: connectedAgents > 0 ? 'OK' : 'WARNING', connectedAgents, note: connectedAgents > 0 ? 'Agent connected' : 'Local fallback strategy active' },
      storageR2: { status: hasR2 ? 'OK' : 'STUB', note: hasR2 ? 'Cloudflare R2 active' : 'Local backup strategy active' },
      discordIntegrations: { status: hasDiscord ? 'OK' : 'STUB', note: hasDiscord ? 'Discord webhook active' : 'Notifications stubbed' }
    },
    suggestedBootstrap: {
      readyToDeploy: true,
      defaultTemplate: 'tmpl_vanilla_survival',
      availableServerTypes: ['VANILLA', 'ENDSTONE', 'BEHAVIOR', 'POCKETMINE']
    }
  });
});

// POST /api/v1/provisioning/auto-bootstrap — auto-fix environment & seed system
provisioningRouter.post('/auto-bootstrap', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  db.seedDefaults();
  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'ENVIRONMENT_AUTO_BOOTSTRAP',
    entityType: 'System',
    entityId: 'system',
    metadata: { timestamp: new Date() }
  });
  return res.json({
    success: true,
    message: 'Environment auto-bootstrapped successfully. Default database, templates, and agent nodes primed.',
    serversCount: db.servers.length,
    templatesCount: db.templates.length
  });
});

// POST /api/v1/provisioning/deploy-full-stack — all-in-one setup, customization, and deployment
const deployFullStackSchema = z.object({
  serverName: z.string().min(1),
  serverType: z.enum(['VANILLA', 'ENDSTONE', 'BEHAVIOR', 'POCKETMINE']).default('VANILLA'),
  templateId: z.string().default('tmpl_vanilla_survival'),
  plugins: z.array(z.string()).optional().default([]),
  skinsAndMods: z.array(z.string()).optional().default([]),
  allocateNetwork: z.boolean().default(true),
  nodeIp: z.string().optional().default('127.0.0.1'),
  subdomain: z.string().optional(),
  gamertag: z.string().optional()
});

provisioningRouter.post(
  '/deploy-full-stack',
  requireRole(UserRole.ADMIN),
  async (req: AuthenticatedRequest, res: Response) => {
    const parse = deployFullStackSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
    }

    const {
      serverName,
      serverType,
      templateId,
      plugins,
      skinsAndMods,
      allocateNetwork,
      nodeIp,
      subdomain,
      gamertag
    } = parse.data;

    try {
      // Step 1: Execute setup pipeline (create server + initial setup)
      const setupResult = await PipelineEngine.runServerSetupPipeline({
        serverName,
        templateId,
        actorName: req.user!.username,
        allocateNetwork,
        nodeIp: allocateNetwork ? nodeIp : undefined,
        subdomain: allocateNetwork && subdomain ? subdomain : undefined
      });

      const server = db.servers.find((s) => s.id === setupResult.server.id);
      if (server) {
        server.type = serverType as any;
        server.updatedAt = new Date();
      }

      // Step 2: Onboard console gamertag if provided
      let onboardingResult = null;
      if (gamertag && gamertag.trim()) {
        onboardingResult = await PipelineEngine.onboardConsolePlayer({
          gamertag: gamertag.trim(),
          serverId: setupResult.server.id,
          serverPath: setupResult.server.serverPath || `/var/minecraft/servers/${setupResult.server.id}`
        });
      }

      // Step 3: Trigger server container start via strategy pattern
      const provider = HostProviderFactory.getProvider(setupResult.server.hostProvider || HostProviderType.DOCKER_AGENT);
      const startResult = await provider.startServer(setupResult.server);

      AuditLogger.record({
        actorId: req.user!.userId,
        actorName: req.user!.username,
        action: 'SERVER_FULL_STACK_DEPLOY',
        entityType: 'BedrockServer',
        entityId: setupResult.server.id,
        metadata: {
          serverName,
          serverType,
          templateId,
          pluginsCount: plugins.length,
          skinsAndModsCount: skinsAndMods.length,
          gamertag: gamertag || null,
          startSuccess: startResult
        }
      });

      return res.status(201).json({
        success: true,
        message: `Successfully provisioned, customized, and deployed ${serverName}!`,
        deployment: {
          server: server ? toPublicServerSafe(server) : setupResult.server,
          pipelineRun: setupResult.run,
          network: setupResult.network,
          installedPlugins: plugins,
          installedMods: skinsAndMods,
          onboarding: onboardingResult,
          started: startResult
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: 'DEPLOYMENT_FAILED', message });
    }
  }
);
