import { Router, Response } from 'express';
import { z } from 'zod';
import { db, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const nodeRouter = Router();

nodeRouter.use(authenticateJwt);

// GET /api/v1/nodes - List agent nodes
nodeRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ nodes: db.agentNodes });
});

// POST /api/v1/nodes - Register agent node
const registerNodeSchema = z.object({
  name: z.string().min(1),
  version: z.string().optional().default('v1.0.0-static-go')
});

nodeRouter.post('/', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const parse = registerNodeSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const node = {
    id: `node_${Date.now()}`,
    name: parse.data.name,
    version: parse.data.version,
    status: 'ONLINE' as const,
    lastHeartbeat: new Date(),
    createdAt: new Date()
  };

  db.agentNodes.push(node);

  AuditLogger.record({
    userId: req.user!.userId,
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'NODE_REGISTER',
    entityType: 'AgentNode',
    entityId: node.id,
    metadata: { name: node.name }
  });

  return res.status(201).json({ node });
});

// POST /api/v1/nodes/token or /:id/token - Generate pairing token key
nodeRouter.post('/token', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const nodeName = req.body.nodeName || 'New Go Agent Node';
  const key = `NODE_${Math.random().toString(36).substring(2, 10).toUpperCase()}_2026`;

  const node = {
    id: `node_${Date.now()}`,
    name: nodeName,
    version: 'v1.0.0-static-go',
    status: 'OFFLINE' as const,
    createdAt: new Date()
  };

  db.agentNodes.push(node);

  const connKey = {
    id: `key_${Date.now()}`,
    serverId: node.id,
    key,
    useCount: 0,
    maxUses: 1,
    createdAt: new Date()
  };
  db.connectionKeys.push(connKey);

  AuditLogger.record({
    userId: req.user!.userId,
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'NODE_TOKEN_GENERATE',
    entityType: 'AgentNode',
    entityId: node.id,
    metadata: { key }
  });

  return res.status(201).json({ node, pairingKey: key });
});
