import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
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

// POST /api/v1/provisioning/network
const networkSchema = z.object({
  serverId: z.string().min(1),
  nodeIp: z.string().min(1),
  subdomain: z.string().optional(),
  preferredPort: z.number().int().optional()
});

provisioningRouter.post('/network', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const parse = networkSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find((s) => s.id === parse.data.serverId && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  try {
    const allocation = allocator.allocate({
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
        stub: allocation.dns.stub
      }
    });

    return res.status(201).json({ allocation, server });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(409).json({ error: 'ALLOCATION_FAILED', message });
  }
});

// DELETE /api/v1/provisioning/network/:serverId
provisioningRouter.delete('/network/:serverId', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
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
});

// POST /api/v1/provisioning/setup
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

  return res.status(201).json(result);
});

// POST /api/v1/provisioning/onboarding/console
const onboardingSchema = z.object({
  gamertag: z.string().min(1),
  serverId: z.string().min(1),
  ignoresPlayerLimit: z.boolean().optional(),
  autoAcceptInvite: z.boolean().optional().default(false)
});

provisioningRouter.post('/onboarding/console', requireRole(UserRole.MODERATOR), async (req: AuthenticatedRequest, res: Response) => {
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
});
