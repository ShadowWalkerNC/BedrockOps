import { Router, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { db, UserRole, hashAgentToken } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';

export const nodeRouter: Router = Router();

nodeRouter.use(authenticateJwt);

function publicNode(node: (typeof db.agentNodes)[number]) {
  const { secretTokenHash: _omit, ...rest } = node;
  return { ...rest, hasToken: Boolean(node.secretTokenHash) };
}

// GET /api/v1/nodes - List agent nodes
nodeRouter.get('/', (_req: AuthenticatedRequest, res: Response) => {
  return res.json({ nodes: db.agentNodes.map(publicNode) });
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

  const agentToken = randomBytes(32).toString('hex');
  const node = {
    id: `node_${Date.now()}_${randomBytes(3).toString('hex')}`,
    name: parse.data.name,
    version: parse.data.version,
    status: 'OFFLINE' as const,
    secretTokenHash: hashAgentToken(agentToken),
    lastHeartbeat: undefined,
    createdAt: new Date()
  };

  db.agentNodes.push(node);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'NODE_REGISTER',
    entityType: 'AgentNode',
    entityId: node.id,
    metadata: { name: node.name }
  });

  // Plaintext token returned once — store as BEDROCK_AGENT_TOKEN on the agent host.
  return res.status(201).json({ node: publicNode(node), agentToken });
});

// POST /api/v1/nodes/token or /:id/token - Generate pairing token key
nodeRouter.post('/token', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const nodeName = typeof req.body?.nodeName === 'string' ? req.body.nodeName : 'New Go Agent Node';
  const agentToken = randomBytes(32).toString('hex');

  const node = {
    id: `node_${Date.now()}_${randomBytes(3).toString('hex')}`,
    name: nodeName,
    version: 'v1.0.0-static-go',
    status: 'OFFLINE' as const,
    secretTokenHash: hashAgentToken(agentToken),
    createdAt: new Date()
  };

  db.agentNodes.push(node);

  const connKey = {
    id: `key_${Date.now()}_${randomBytes(3).toString('hex')}`,
    serverId: node.id,
    key: agentToken,
    useCount: 0,
    maxUses: 1,
    createdAt: new Date()
  };
  db.connectionKeys.push(connKey);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'NODE_TOKEN_GENERATE',
    entityType: 'AgentNode',
    entityId: node.id,
    metadata: { oneTime: true }
  });

  return res.status(201).json({ node: publicNode(node), pairingKey: agentToken, agentToken });
});

// POST /api/v1/nodes/:id/rotate-token — rotate agent bearer token
nodeRouter.post('/:id/rotate-token', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const node = db.agentNodes.find((n) => n.id === req.params.id);
  if (!node) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Node not found' });
  }

  const agentToken = randomBytes(32).toString('hex');
  node.secretTokenHash = hashAgentToken(agentToken);

  AuditLogger.record({
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'NODE_TOKEN_ROTATE',
    entityType: 'AgentNode',
    entityId: node.id
  });

  return res.json({ node: publicNode(node), agentToken });
});
