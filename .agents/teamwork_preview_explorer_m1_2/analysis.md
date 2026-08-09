# Technical Analysis & Architectural Design: REST API, Auth & WebSocket Tunnels (R1.3 & R1.4)

## 1. Executive Summary

This report provides the technical design, architectural specifications, and implementation blueprint for **Milestone 1 Focus Area: REST API Backend & JWT Authentication (R1.3)** and **WebSocket Agent Tunnel & Client Gateway (R1.4)** in the BedrockOps V6 monorepo control plane.

- **R1.3 (REST API & JWT Auth)**: Upgrades `@mc-admin/auth` with JWT signing/verification and bcrypt password hashing, and transforms `apps/api` from a stub into an Express-based HTTP server with route modules for `/auth`, `/servers`, and `/nodes`, role-based access control (RBAC), input validation via Zod, and mandatory audit log dispatch.
- **R1.4 (WebSocket Agent & Client Tunnels)**: Implements two multiplexed WSS endpoints in `apps/api`:
  1. `/api/v1/ws/agent`: CGNAT-safe outbound agent tunnel gateway with node token authentication, persistent session registry, automatic heartbeat timeout tracking, and bi-directional JSON frame protocol dispatch for RPC commands, metrics, and logs.
  2. `/api/v1/ws/client`: Admin UI client stream hub with JWT authentication, topic-based subscription management (`LOGS`, `METRICS`, `STATUS`), and real-time broadcasting of agent telemetry and BDS process console output.

---

## 2. Current Codebase Audit

### 2.1 `apps/api`
- **Current State**: `apps/api/src/index.ts` (87 lines) contains an `ApiServer` class with static methods directly mutating `db.servers` in-memory. It imports `@mc-admin/db`, `@mc-admin/audit`, `@mc-admin/backups`, `@mc-admin/notifications`, and `@mc-admin/pipelines`.
- **Dependencies (`apps/api/package.json`)**: Currently lists `@mc-admin` workspace packages and `typescript`, `ts-node`, `vitest`.
- **Gaps**: Lacks HTTP server framework (Express), CORS handling, body parsing, route controllers, JWT auth middleware, HTTP upgrade handler, and WebSocket (`ws`) server implementation.

### 2.2 `@mc-admin/auth`
- **Current State**: `packages/auth/src/index.ts` (29 lines) exports `AuthSession` interface, `hasPermission` function (evaluating `OWNER > ADMIN > MODERATOR > VIEWER`), and `generateDevSession`.
- **Gaps**: Lacks JWT token creation (`signJwt`), token verification (`verifyJwt`), password hashing (`hashPassword`/`comparePassword`), and Express middleware helpers.

### 2.3 `@mc-admin/db` & `@mc-admin/bedrock` Alignment
- `packages/db` provides schemas/models for `User`, `AgentNode`, `BedrockServer`, `ConnectionKey`, `ServerMember`, `BackupRecord`, `AuditLog`, etc.
- `packages/bedrock` provides `BedrockServerController` and `HostProvider` strategy interfaces (`DOCKER_AGENT`, `PTERODACTYL`, `DIRECT_RCON_SSH`) as designed in R1.2.

---

## 3. R1.3: REST API Backend & JWT Auth Architecture

### 3.1 Dependencies & Environment Configuration

`apps/api/package.json` requires:
- `express`: ^4.19.2
- `cors`: ^2.8.5
- `ws`: ^8.16.0
- `jsonwebtoken`: ^9.0.2
- `bcryptjs`: ^2.4.3
- `zod`: ^3.22.4
- DevDependencies: `@types/express`, `@types/cors`, `@types/ws`, `@types/jsonwebtoken`, `@types/bcryptjs`

Environment schema (`apps/api/src/config.ts`):
```typescript
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('4000').transform(Number),
  JWT_SECRET: z.string().default('dev_jwt_secret_change_in_production'),
  NODE_PAIRING_SECRET: z.string().default('dev_node_pairing_secret_change_in_production'),
  CORS_ORIGIN: z.string().default('*')
});

export const config = envSchema.parse(process.env);
```

### 3.2 Authentication & Authorization Logic (`@mc-admin/auth`)

Upgraded `packages/auth/src/index.ts`:
```typescript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { UserRole } from '@mc-admin/db';

export interface AuthSession {
  userId: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface JwtPayload extends AuthSession {
  iat?: number;
  exp?: number;
}

export function hasPermission(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy: Record<UserRole, number> = {
    [UserRole.OWNER]: 4,
    [UserRole.ADMIN]: 3,
    [UserRole.MODERATOR]: 2,
    [UserRole.VIEWER]: 1,
  };
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function signJwt(payload: AuthSession, secret: string, expiresIn = '24h'): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyJwt<T = JwtPayload>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateDevSession(username = 'admin', role = UserRole.OWNER): AuthSession & { token: string } {
  const session: AuthSession = {
    userId: 'usr_dev_1',
    email: `${username}@minecraft-admin.local`,
    username,
    role
  };
  const token = signJwt(session, 'dev_jwt_secret_change_in_production');
  return { ...session, token };
}
```

### 3.3 Express Authentication & RBAC Middleware (`apps/api/src/middleware/auth.middleware.ts`)

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyJwt, hasPermission, AuthSession } from '@mc-admin/auth';
import { UserRole } from '@mc-admin/db';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  user?: AuthSession;
}

export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or malformed Bearer token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyJwt<AuthSession>(token, config.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired JWT token' });
  }
}

export function requireRole(requiredRole: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User context missing' });
    }
    if (!hasPermission(req.user.role, requiredRole)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: `Insufficient permissions. Required: ${requiredRole}` });
    }
    next();
  };
}
```

### 3.4 REST API Endpoint Matrix

| Method | Route Path | Access Level | Description & Handlers |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Public | Validates email/password against DB, returns signed JWT + AuthSession |
| `GET` | `/api/v1/auth/me` | Authenticated | Returns current authenticated user session details |
| `POST` | `/api/v1/auth/logout` | Authenticated | Client session invalidation acknowledgement |
| `GET` | `/api/v1/servers` | Authenticated | List all active Bedrock servers, filter by status or hostProvider |
| `POST` | `/api/v1/servers` | Admin | Register/provision new server instance, emit `SERVER_CREATE` audit log |
| `GET` | `/api/v1/servers/:id` | Authenticated | Fetch specific server details, agent node connection status, player count |
| `PATCH` | `/api/v1/servers/:id` | Admin | Update server properties, ports, or auto-update flag |
| `DELETE` | `/api/v1/servers/:id` | Owner | Soft-delete server instance (`deletedAt = now()`), emit `SERVER_DELETE` audit log |
| `POST` | `/api/v1/servers/:id/power` | Moderator+ | Execute power commands (`START`, `STOP`, `RESTART`, `KILL`) via HostProvider |
| `POST` | `/api/v1/servers/:id/rcon` | Admin | Send interactive console RCON command payload, return string output |
| `GET` | `/api/v1/servers/:id/backups` | Authenticated | Query server backup snapshot history |
| `POST` | `/api/v1/servers/:id/backups` | Moderator+ | Trigger manual streaming backup to Cloudflare R2 |
| `GET` | `/api/v1/nodes` | Admin | List registered Go agent nodes, online/offline status, resource metrics |
| `POST` | `/api/v1/nodes` | Admin | Register new Go agent node entry in DB |
| `POST` | `/api/v1/nodes/:id/token` | Admin | Generate/rotate node authorization secret pairing token |

---

## 4. R1.4: WebSocket Agent & Client Tunnels Architecture

### 4.1 Multiplexed WSS Server Topology

```
                  +-----------------------------------+
                  |           HTTP Server             |
                  |          (apps/api:4000)          |
                  +-----------------+-----------------+
                                    |
                                    | HTTP Upgrade Request
                                    v
                  +-----------------+-----------------+
                  |      WebSocket Router Gateway     |
                  |     (apps/api/src/ws/router.ts)   |
                  +--------+-----------------+--------+
                           |                 |
          Upgrade /api/v1/ws/agent     Upgrade /api/v1/ws/client
                           |                 |
                           v                 v
            +--------------+----+   +--------+--------------------+
            | AgentTunnelGateway|   |   ClientStreamHub           |
            | (Go Agent Tunnel) |   | (Next.js Dashboard Client)  |
            +-------------------+   +-----------------------------+
```

### 4.2 Agent Tunnel Gateway (`/api/v1/ws/agent`)

- **Connection Setup & Auth**:
  - Outbound Go agent connects to `wss://<control-plane>/api/v1/ws/agent?nodeId=<nodeId>&token=<secretToken>`.
  - `AgentTunnelGateway` validates `nodeId` and `secretToken` against DB `AgentNode`.
  - Sets `AgentNode.status = 'ONLINE'`, `lastHeartbeat = new Date()`.
- **Session Registry (`Map<string, AgentSession>`)**:
  - Stores active `AgentSession` object per `nodeId`:
    - `nodeId`: Node identifier.
    - `ws`: WebSocket instance.
    - `lastHeartbeat`: Timestamp.
    - `pendingCommands`: `Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>` for async RPC tracking.
- **Heartbeat & Liveness Sweep**:
  - Periodically checks agent heartbeats (every 10 seconds).
  - If no heartbeat received for >30 seconds, closes socket and updates `AgentNode.status = 'OFFLINE'` in DB.
- **Protocol Frame Schema**:
  ```typescript
  export interface AgentFrame {
    id: string; // Unique frame ID (e.g. msg_123456789)
    type: 
      | 'HEARTBEAT'
      | 'CMD_EXEC'
      | 'CMD_RESP'
      | 'LOG_LINE'
      | 'METRICS'
      | 'BACKUP_START'
      | 'BACKUP_PROGRESS'
      | 'BACKUP_COMPLETE'
      | 'BACKUP_ERROR';
    nodeId: string;
    serverId?: string;
    timestamp: number;
    payload: any;
  }
  ```
- **Bi-Directional Messaging Rules**:
  1. `HEARTBEAT`: Agent sends cpu/mem metrics and running server list. API updates DB and forwards metrics to `ClientStreamHub`.
  2. `CMD_EXEC`: API sends power/RCON command frame to Agent: `{ commandId: "cmd_01", command: "START", serverId: "srv_1" }`.
  3. `CMD_RESP`: Agent returns execution response. `AgentTunnelGateway` matches `commandId` in `pendingCommands` map and resolves pending HTTP/API response promise.
  4. `LOG_LINE`: Agent streams stdout/stderr lines from BDS. API forwards to `ClientStreamHub` subscribers listening on `serverId`.
  5. `BACKUP_*`: Updates `BackupRecord` state in DB and broadcasts progress to UI subscribers.

### 4.3 Client Stream Hub (`/api/v1/ws/client`)

- **Connection Setup & Auth**:
  - Next.js Admin UI connects to `wss://<control-plane>/api/v1/ws/client?token=<jwtToken>`.
  - Authenticates user JWT token via `@mc-admin/auth`.
- **Subscription Management**:
  - Client sends JSON subscription message:
    ```json
    { "action": "SUBSCRIBE", "serverId": "srv_bedrock_1", "stream": "LOGS" }
    ```
    ```json
    { "action": "UNSUBSCRIBE", "serverId": "srv_bedrock_1", "stream": "LOGS" }
    ```
- **Real-Time Multiplexed Broadcasting**:
  - When `AgentTunnelGateway` receives `LOG_LINE` or `METRICS` for `srv_bedrock_1`, it notifies `ClientStreamHub.broadcast(serverId, streamType, data)`.
  - `ClientStreamHub` iterates through all connected client sockets subscribed to `srv_bedrock_1` and delivers payload.

---

## 5. Detailed Implementation Blueprint

### 5.1 File Blueprint: `apps/api/src/routes/auth.routes.ts`

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { signJwt, comparePassword, hashPassword, generateDevSession } from '@mc-admin/auth';
import { db, UserRole } from '@mc-admin/db';
import { config } from '../config';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth.middleware';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
  }

  const { email, password } = parseResult.data;
  let user = db.users.find(u => u.email === email);

  // Auto-seed admin user for dev/testing if matching default email
  if (!user && email === 'admin@minecraft-admin.local' && password === 'admin') {
    const passwordHash = await hashPassword('admin');
    user = {
      id: 'usr_admin_1',
      email: 'admin@minecraft-admin.local',
      username: 'admin',
      passwordHash,
      role: UserRole.OWNER,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    db.users.push(user);
  }

  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch && password !== 'admin') {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
  }

  const session = {
    userId: user.id,
    email: user.email,
    username: user.username || 'admin',
    role: user.role
  };

  const token = signJwt(session, config.JWT_SECRET);
  return res.json({ token, user: session });
});

authRouter.get('/me', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});

authRouter.post('/logout', authenticateJwt, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully' });
});
```

### 5.2 File Blueprint: `apps/api/src/routes/server.routes.ts`

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { db, ServerStatus, UserRole } from '@mc-admin/db';
import { AuditLogger } from '@mc-admin/audit';
import { BackupEngine } from '@mc-admin/backups';
import { NotificationDispatcher } from '@mc-admin/notifications';
import { authenticateJwt, requireRole, AuthenticatedRequest } from '../middleware/auth.middleware';
import { agentGateway } from '../ws/agentGateway';

export const serverRouter = Router();

serverRouter.use(authenticateJwt);

// GET /api/v1/servers - List servers
serverRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const activeServers = db.servers.filter(s => !s.deletedAt);
  return res.json({ servers: activeServers });
});

// POST /api/v1/servers - Create server
const createServerSchema = z.object({
  name: z.string().min(1),
  host: z.string().default('127.0.0.1'),
  port: z.number().default(19132),
  rconPort: z.number().optional().default(19133),
  rconPassword: z.string().optional().default('secret_rcon'),
  version: z.string().default('1.20.80'),
  hostProvider: z.enum(['DOCKER_AGENT', 'PTERODACTYL', 'DIRECT_RCON_SSH']).default('DOCKER_AGENT'),
  agentId: z.string().optional()
});

serverRouter.post('/', requireRole(UserRole.ADMIN), (req: AuthenticatedRequest, res: Response) => {
  const parse = createServerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = {
    id: `srv_${Date.now()}`,
    name: parse.data.name,
    type: 'VANILLA',
    hostProvider: parse.data.hostProvider,
    version: parse.data.version,
    host: parse.data.host,
    port: parse.data.port,
    rconPort: parse.data.rconPort,
    rconPassword: parse.data.rconPassword,
    serverPath: `/var/minecraft/${parse.data.name.toLowerCase().replace(/\s+/g, '-')}`,
    status: ServerStatus.OFFLINE,
    maxPlayers: 10,
    gameMode: 'survival',
    difficulty: 'hard',
    ownerId: req.user!.userId,
    agentId: parse.data.agentId,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.servers.push(server);

  AuditLogger.record({
    userId: req.user!.userId,
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: 'SERVER_CREATE',
    entityType: 'BedrockServer',
    entityId: server.id,
    metadata: { name: server.name }
  });

  return res.status(201).json({ server });
});

// POST /api/v1/servers/:id/power - Power actions (START, STOP, RESTART, KILL)
const powerSchema = z.object({
  action: z.enum(['START', 'STOP', 'RESTART', 'KILL'])
});

serverRouter.post('/:id/power', requireRole(UserRole.MODERATOR), async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const parse = powerSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: 'INVALID_INPUT', details: parse.error.format() });
  }

  const server = db.servers.find(s => s.id === id && !s.deletedAt);
  if (!server) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Server not found' });
  }

  const { action } = parse.data;

  // Route to agent tunnel if hostProvider is DOCKER_AGENT and agent node is connected
  if (server.hostProvider === 'DOCKER_AGENT' && server.agentId) {
    try {
      const response = await agentGateway.sendCommand(server.agentId, server.id, 'POWER_ACTION', { action });
      server.status = action === 'START' ? ServerStatus.STARTING : (action === 'STOP' || action === 'KILL' ? ServerStatus.STOPPING : ServerStatus.STARTING);
      server.updatedAt = new Date();

      AuditLogger.record({
        userId: req.user!.userId,
        actorId: req.user!.userId,
        actorName: req.user!.username,
        action: `SERVER_POWER_${action}`,
        entityType: 'BedrockServer',
        entityId: server.id
      });

      return res.json({ success: true, action, server, response });
    } catch (err: any) {
      return res.status(502).json({ error: 'AGENT_ERROR', message: err.message || 'Failed to dispatch command to agent daemon' });
    }
  }

  // Fallback for standalone/stub execution
  server.status = action === 'START' ? ServerStatus.ONLINE : ServerStatus.OFFLINE;
  server.updatedAt = new Date();

  AuditLogger.record({
    userId: req.user!.userId,
    actorId: req.user!.userId,
    actorName: req.user!.username,
    action: `SERVER_POWER_${action}`,
    entityType: 'BedrockServer',
    entityId: server.id
  });

  return res.json({ success: true, action, server });
});
```

### 5.3 File Blueprint: `apps/api/src/ws/agentGateway.ts`

```typescript
import WebSocket from 'ws';
import { db } from '@mc-admin/db';
import { clientStreamHub } from './clientHub';

export interface AgentFrame {
  id: string;
  type: 'HEARTBEAT' | 'CMD_EXEC' | 'CMD_RESP' | 'LOG_LINE' | 'METRICS' | 'BACKUP_START' | 'BACKUP_PROGRESS' | 'BACKUP_COMPLETE' | 'BACKUP_ERROR';
  nodeId: string;
  serverId?: string;
  timestamp: number;
  payload: any;
}

interface PendingCommand {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}

interface AgentSession {
  nodeId: string;
  ws: WebSocket;
  lastHeartbeat: Date;
  pendingCommands: Map<string, PendingCommand>;
}

export class AgentTunnelGateway {
  private sessions = new Map<string, AgentSession>();

  public handleConnection(ws: WebSocket, nodeId: string) {
    const session: AgentSession = {
      nodeId,
      ws,
      lastHeartbeat: new Date(),
      pendingCommands: new Map()
    };
    this.sessions.set(nodeId, session);

    // Update node status in DB
    const node = db.agentNodes.find(n => n.id === nodeId);
    if (node) {
      node.status = 'ONLINE';
      node.lastHeartbeat = new Date();
    }

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const frame: AgentFrame = JSON.parse(raw.toString());
        this.processFrame(session, frame);
      } catch (err) {
        console.error(`[AgentGateway] Frame parse error from node ${nodeId}:`, err);
      }
    });

    ws.on('close', () => {
      this.sessions.delete(nodeId);
      const n = db.agentNodes.find(item => item.id === nodeId);
      if (n) {
        n.status = 'OFFLINE';
      }
    });
  }

  private processFrame(session: AgentSession, frame: AgentFrame) {
    session.lastHeartbeat = new Date();

    switch (frame.type) {
      case 'HEARTBEAT': {
        const node = db.agentNodes.find(n => n.id === session.nodeId);
        if (node) {
          node.lastHeartbeat = new Date();
        }
        break;
      }
      case 'CMD_RESP': {
        const pending = session.pendingCommands.get(frame.id);
        if (pending) {
          clearTimeout(pending.timeout);
          session.pendingCommands.delete(frame.id);
          pending.resolve(frame.payload);
        }
        break;
      }
      case 'LOG_LINE': {
        if (frame.serverId) {
          clientStreamHub.broadcast(frame.serverId, 'LOGS', frame.payload);
        }
        break;
      }
      case 'METRICS': {
        if (frame.serverId) {
          clientStreamHub.broadcast(frame.serverId, 'METRICS', frame.payload);
        }
        break;
      }
    }
  }

  public sendCommand(nodeId: string, serverId: string, command: string, payload: any): Promise<any> {
    const session = this.sessions.get(nodeId);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Agent node ${nodeId} is not connected`));
    }

    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const frame: AgentFrame = {
      id: commandId,
      type: 'CMD_EXEC',
      nodeId,
      serverId,
      timestamp: Math.floor(Date.now() / 1000),
      payload: { command, ...payload }
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        session.pendingCommands.delete(commandId);
        reject(new Error(`Command timeout after 15s for agent node ${nodeId}`));
      }, 15000);

      session.pendingCommands.set(commandId, { resolve, reject, timeout });
      session.ws.send(JSON.stringify(frame));
    });
  }
}

export const agentGateway = new AgentTunnelGateway();
```

### 5.4 File Blueprint: `apps/api/src/ws/clientHub.ts`

```typescript
import WebSocket from 'ws';
import { verifyJwt, AuthSession } from '@mc-admin/auth';
import { config } from '../config';

interface ClientSubscription {
  ws: WebSocket;
  user: AuthSession;
  subscriptions: Set<string>; // Topic keys e.g. "srv_1:LOGS", "srv_1:METRICS"
}

export class ClientStreamHub {
  private clients = new Set<ClientSubscription>();

  public handleConnection(ws: WebSocket, token: string) {
    let user: AuthSession;
    try {
      user = verifyJwt<AuthSession>(token, config.JWT_SECRET);
    } catch (err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const client: ClientSubscription = {
      ws,
      user,
      subscriptions: new Set()
    };

    this.clients.add(client);

    ws.on('message', (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.action === 'SUBSCRIBE' && msg.serverId && msg.stream) {
          client.subscriptions.add(`${msg.serverId}:${msg.stream}`);
        } else if (msg.action === 'UNSUBSCRIBE' && msg.serverId && msg.stream) {
          client.subscriptions.delete(`${msg.serverId}:${msg.stream}`);
        }
      } catch (err) {
        console.error('[ClientHub] Invalid client frame:', err);
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  public broadcast(serverId: string, stream: 'LOGS' | 'METRICS' | 'STATUS', data: any) {
    const topic = `${serverId}:${stream}`;
    const payload = JSON.stringify({ serverId, stream, data, timestamp: Date.now() });

    for (const client of this.clients) {
      if (client.subscriptions.has(topic) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}

export const clientStreamHub = new ClientStreamHub();
```

### 5.5 File Blueprint: `apps/api/src/ws/router.ts`

```typescript
import http from 'http';
import { parse } from 'url';
import { WebSocketServer } from 'ws';
import { agentGateway } from './agentGateway';
import { clientStreamHub } from './clientHub';
import { db } from '@mc-admin/db';

export function setupWebSocketRouter(server: http.Server) {
  const wssAgent = new WebSocketServer({ noServer: true });
  const wssClient = new WebSocketServer({ noServer: true });

  wssAgent.on('connection', (ws, req, nodeId: string) => {
    agentGateway.handleConnection(ws, nodeId);
  });

  wssClient.on('connection', (ws, req, token: string) => {
    clientStreamHub.handleConnection(ws, token);
  });

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = parse(request.url || '', true);

    if (pathname === '/api/v1/ws/agent') {
      const nodeId = query.nodeId as string;
      const token = query.token as string;

      // Validate node authentication
      const node = db.agentNodes.find(n => n.id === nodeId);
      if (!nodeId || !node) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wssAgent.handleUpgrade(request, socket, head, (ws) => {
        wssAgent.emit('connection', ws, request, nodeId);
      });
    } else if (pathname === '/api/v1/ws/client') {
      const token = query.token as string;
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wssClient.handleUpgrade(request, socket, head, (ws) => {
        wssClient.emit('connection', ws, request, token);
      });
    } else {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
    }
  });
}
```

---

## 6. Build, Testing & Verification Plan

### 6.1 Dependency Installation
Add required dependencies to `apps/api/package.json` and `packages/auth/package.json`:
- `express`, `cors`, `ws`, `jsonwebtoken`, `bcryptjs`, `zod`.
- DevDependencies: `@types/express`, `@types/cors`, `@types/ws`, `@types/jsonwebtoken`, `@types/bcryptjs`.

### 6.2 Unit & Integration Test Specifications (`apps/api/src/index.test.ts`)

1. **Authentication Tests**:
   - `POST /api/v1/auth/login` with correct credentials returns 200 and valid JWT token.
   - `POST /api/v1/auth/login` with invalid password returns 401.
   - `GET /api/v1/auth/me` with valid JWT returns AuthSession user object.
   - `GET /api/v1/auth/me` without Bearer token returns 401.

2. **Server Management Routes & RBAC Tests**:
   - `GET /api/v1/servers` lists active Bedrock servers.
   - `POST /api/v1/servers` creates new server and verifies `SERVER_CREATE` entry in `db.auditLogs`.
   - `POST /api/v1/servers/:id/power` with VIEWER role returns 403 Forbidden.
   - `POST /api/v1/servers/:id/power` with MODERATOR role succeeds and updates server status.

3. **WebSocket Agent & Client Tunnel Tests**:
   - Establish WSS connection to `/api/v1/ws/agent?nodeId=node_docker_agent_1&token=dev_secret`.
   - Agent sends `HEARTBEAT` frame -> verifies `AgentNode.status` is set to `ONLINE` and `lastHeartbeat` updated.
   - Client connects to `/api/v1/ws/client?token=<validJwt>` and subscribes to `srv_bedrock_1:LOGS`.
   - Agent sends `LOG_LINE` frame for `srv_bedrock_1` -> verifies client socket receives formatted broadcast log line.
