import { Router, Response } from 'express';
import { z } from 'zod';
import { db, ServerStatus, UserRole, HostProviderType, BedrockServer } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { HostProviderFactory } from '@mc-admin/bedrock';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const serverRouter: Router = Router();

serverRouter.use(authenticateJwt);

/** Strip secrets from API responses. */
export function toPublicServer(server: BedrockServer) {
  const { rconPassword: _omit, ...rest } = server;
  return {
    ...rest,
    hasRconPassword: Boolean(server.rconPassword)
  };
}

// GET /api/v1/servers - List servers
serverRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  const activeServers = db.servers.filter((s) => !s.deletedAt).map(toPublicServer);
  return res.json({ servers: activeServers });
});

// GET /api/v1/servers/:id - Fetch server details
serverRouter.get('/:id', (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }
  return res.json({ server: toPublicServer(server) });
});

// POST /api/v1/servers - Create server
const createServerSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional().default('VANILLA'),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(19132),
  rconPort: z.number().optional().default(19133),
  rconPassword: z.string().optional().default('secret_rcon_pass'),
  version: z.string().default('1.20.80'),
  hostProvider: z.enum(['DOCKER_AGENT', 'PTERODACTYL', 'DIRECT_RCON_SSH']).default('DOCKER_AGENT'),
  agentId: z.string().optional(),
  maxPlayers: z.number().optional().default(10),
  gameMode: z.string().optional().default('survival'),
  difficulty: z.string().optional().default('easy')
});

serverRouter.post('/', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const parse = createServerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const data = parse.data;
  const server = {
    id: `srv_${Date.now()}`,
    name: data.name,
    type: data.type,
    hostProvider: data.hostProvider,
    version: data.version,
    host: data.host,
    port: data.port,
    rconPort: data.rconPort,
    rconPassword: data.rconPassword,
    serverPath: `/var/minecraft/${data.name.toLowerCase().replace(/\s+/g, '-')}`,
    status: ServerStatus.OFFLINE,
    maxPlayers: data.maxPlayers,
    gameMode: data.gameMode,
    difficulty: data.difficulty,
    ownerId: req.user!.userId,
    agentId: data.agentId || 'node_docker_agent_1',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.servers.push(server);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SERVER_CREATE',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: { name: server.name, hostProvider: server.hostProvider }
  });

  return res.status(201).json({ server: toPublicServer(server) });
});

const patchServerSchema = z
  .object({
    name: z.string().min(1).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().positive().optional(),
    rconPort: z.number().int().positive().optional(),
    rconPassword: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    maxPlayers: z.number().int().positive().optional(),
    gameMode: z.string().min(1).optional(),
    difficulty: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    serverPath: z.string().min(1).optional()
  })
  .strict();

// PATCH /api/v1/servers/:id - Update server
serverRouter.patch('/:id', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  const parse = patchServerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  Object.assign(server, parse.data, { updatedAt: new Date() });

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SERVER_UPDATE',
    entityType: 'BedrockServer',
    entityId: server.id
  });

  return res.json({ server: toPublicServer(server) });
});

// DELETE /api/v1/servers/:id - Soft delete server
serverRouter.delete('/:id', requireRole(UserRole.OWNER), (req: AuthenticatedRequest, res: Response) => {
  const server = db.servers.find((s) => s.id === req.params.id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  server.deletedAt = new Date();
  server.status = ServerStatus.OFFLINE;

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SERVER_DELETE',
    entityType: 'BedrockServer',
    entityId: server.id
  });

  return res.json({ success: true, message: 'Server soft-deleted' });
});

// POST /api/v1/servers/:id/power - Power control
const powerSchema = z.object({
  action: z.enum(['START', 'STOP', 'RESTART', 'KILL'])
});

serverRouter.post('/:id/power', requireRole(UserRole.MODERATOR), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parse = powerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find((s) => s.id === id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  const { action } = parse.data;
  const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);

  let powerOk = true;
  if (action === 'START') {
    powerOk = await provider.startServer(server);
    if (powerOk) server.status = ServerStatus.ONLINE;
  } else if (action === 'STOP' || action === 'KILL') {
    powerOk = await provider.stopServer(server, action === 'KILL');
    if (powerOk) server.status = ServerStatus.OFFLINE;
  } else if (action === 'RESTART') {
    powerOk = await provider.restartServer(server);
    if (powerOk) server.status = ServerStatus.ONLINE;
  }
  server.updatedAt = new Date();

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: `SERVER_POWER_${action}`,
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: { powerOk }
  });

  if (!powerOk) {
    return res.status(503).json({
      success: false,
      stub: true,
      action,
      server: toPublicServer(server),
      message: '[STUB] Power action not executed on host (provider pending or agent offline).'
    });
  }

  return res.json({ success: true, action, server: toPublicServer(server) });
});

// POST /api/v1/servers/:id/rcon - Execute RCON command
const rconSchema = z.object({
  command: z.string().min(1)
});

serverRouter.post('/:id/rcon', requireRole(UserRole.ADMIN), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parse = rconSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find((s) => s.id === id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  const provider = HostProviderFactory.getProvider(server.hostProvider || HostProviderType.DOCKER_AGENT);
  const result = await provider.executeRcon(server, parse.data.command);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SERVER_RCON_COMMAND',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: { command: parse.data.command }
  });

  return res.json({ success: true, output: result });
});
