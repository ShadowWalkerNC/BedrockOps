# Technical Analysis & Implementation Blueprint: R1.1 (Database Schema) & R1.2 (HostProvider Layer)

## 1. Executive Summary & Scope

This document provides the complete, production-ready technical specification and step-by-step implementation blueprint for **Milestone 1 Focus Area R1.1 (PostgreSQL Database Schema & Prisma ORM)** and **R1.2 (HostProvider Abstraction Layer & Strategy Pattern)**.

### Target Workspaces
- `packages/db`: Database schema definitions, Prisma ORM setup, client exports, and type definitions.
- `packages/bedrock`: Bedrock server protocol utilities, configuration parsers, and the `HostProvider` strategy pattern interface & implementations.

---

## 2. Existing File Audit & Gap Analysis

### 2.1 `packages/db`
- **Current State**: Contains in-memory mock schema interfaces (`src/schema.ts`) and an in-memory database stub (`MemoryDatabase` in `src/index.ts`).
- **Gaps**:
  - Missing `prisma/schema.prisma` definition.
  - Missing `@prisma/client` dependency and Prisma CLI tooling in `package.json`.
  - Missing `src/client.ts` for Prisma client instantiation and singleton management.
  - Missing schema validation tests for Prisma model alignment.

### 2.2 `packages/bedrock`
- **Current State**: Contains `BedrockServerController` with `server.properties` parsing/serialization methods and stubbed RCON command execution.
- **Gaps**:
  - Missing `src/provider.ts` containing the `HostProvider` strategy pattern interface.
  - Missing concrete strategy implementations (`DockerAgentHostProvider`, `PterodactylHostProvider`, `DirectRconSshHostProvider`).
  - Missing `HostProviderFactory` for dynamic strategy instantiation based on server configuration.
  - Missing provider unit tests (`src/provider.test.ts`).

---

## 3. R1.1 Database Schema Blueprint (`packages/db/prisma/schema.prisma`)

### 3.1 Complete Prisma Schema Definition

The Prisma schema is designed for PostgreSQL, adhering strictly to AGENTS.md rules and PROJECT.md requirements (soft-deletes for GDPR compliance, BigInt for file sizes, cuid IDs, relations, and structured enums).

```prisma
// packages/db/prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum UserRole {
  OWNER
  ADMIN
  MODERATOR
  VIEWER
}

enum ServerStatus {
  OFFLINE
  STARTING
  ONLINE
  STOPPING
  ERROR
  MAINTENANCE
}

enum BackupStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

enum ModerationType {
  WARN
  MUTE
  KICK
  BAN
  NOTE
}

enum HostProviderType {
  DOCKER_AGENT
  PTERODACTYL
  DIRECT_RCON_SSH
}

enum PipelineStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
}

model User {
  id           String         @id @default(cuid())
  email        String         @unique
  passwordHash String
  username     String?
  role         UserRole       @default(ADMIN)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  
  // Relations
  servers           ServerMember[]
  auditLogs         AuditLog[]
  moderationsIssued ModerationAction[] @relation("IssuedModerations")

  @@map("users")
}

model AgentNode {
  id              String         @id @default(cuid())
  name            String
  version         String
  secretTokenHash String
  status          String         @default("OFFLINE") // ONLINE, OFFLINE, MAINTENANCE
  ipAddress       String?
  hostname        String?
  os              String?
  arch            String?
  cpuCores        Int?
  totalMemoryMb   Int?
  lastHeartbeat   DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  
  // Relations
  servers         BedrockServer[]

  @@map("agent_nodes")
}

model BedrockServer {
  id                  String           @id @default(cuid())
  name                String
  type                String           @default("VANILLA")
  hostProvider        HostProviderType @default(DOCKER_AGENT)
  version             String
  host                String
  port                Int              @default(19132)
  rconPort            Int?             @default(19133)
  rconPassword        String?
  serverPath          String
  status              ServerStatus     @default(OFFLINE)
  maxPlayers          Int              @default(10)
  gameMode            String           @default("survival")
  difficulty          String           @default("easy")
  ownerId             String?
  agentId             String?
  agentTunnelId       String?
  pterodactylServerId String?
  autoUpdate          Boolean          @default(false)
  lastCrashAt         DateTime?
  crashCount24h       Int              @default(0)
  deletedAt           DateTime?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  
  // Relations
  agentNode           AgentNode?       @relation(fields: [agentId], references: [id], onDelete: SetNull)
  members             ServerMember[]
  backups             BackupRecord[]
  moderations         ModerationAction[]
  connectionKeys      ConnectionKey[]
  pipelineRuns        PipelineRun[]

  @@map("bedrock_servers")
}

model ConnectionKey {
  id        String        @id @default(cuid())
  serverId  String
  key       String        @unique
  maxUses   Int           @default(1)
  useCount  Int           @default(0)
  expiresAt DateTime?
  createdAt DateTime      @default(now())
  
  // Relations
  server    BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)

  @@map("connection_keys")
}

model ServerMember {
  id        String        @id @default(cuid())
  serverId  String
  userId    String
  role      UserRole      @default(ADMIN)
  createdAt DateTime      @default(now())
  
  // Relations
  server    BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([serverId, userId])
  @@map("server_members")
}

model BackupRecord {
  id               String       @id @default(cuid())
  serverId         String
  filename         String
  fileSizeBytes    BigInt       @default(0)
  storageUrl       String?
  storagePath      String
  sha256           String?
  verified         Boolean      @default(false)
  status           BackupStatus @default(PENDING)
  isManual         Boolean      @default(false)
  isHoldCheckpoint Boolean      @default(true)
  notes            String?
  bdsVersion       String?
  manifestJson     Json?
  createdAt        DateTime     @default(now())
  
  // Relations
  server           BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)

  @@map("backup_records")
}

model ModerationAction {
  id              String         @id @default(cuid())
  serverId        String?
  playerXuid      String?
  gamertag        String
  actionType      ModerationType
  reason          String
  issuerId        String
  issuerName      String
  durationMinutes Int?
  active          Boolean        @default(true)
  deletedAt       DateTime?
  createdAt       DateTime       @default(now())
  
  // Relations
  server          BedrockServer? @relation(fields: [serverId], references: [id], onDelete: SetNull)
  issuer          User?          @relation("IssuedModerations", fields: [issuerId], references: [id], onDelete: SetNull)

  @@map("moderation_actions")
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  actorId    String
  actorName  String
  action     String
  entityType String
  entityId   String
  metadata   Json?
  timestamp  DateTime @default(now())
  
  // Relations
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@map("audit_logs")
}

model BdsVersion {
  id          String   @id @default(cuid())
  version     String   @unique
  downloadUrl String
  releaseDate DateTime
  isLatest    Boolean  @default(false)
  isSupported Boolean  @default(true)

  @@map("bds_versions")
}

model ServerTemplate {
  id                String   @id @default(cuid())
  name              String
  description       String
  bdsVersion        String
  defaultProperties Json
  addonPacks        Json     @default("[]")
  createdAt         DateTime @default(now())

  @@map("server_templates")
}

model Pipeline {
  id          String        @id @default(cuid())
  name        String
  description String
  steps       Json
  createdAt   DateTime      @default(now())
  runs        PipelineRun[]

  @@map("pipelines")
}

model PipelineRun {
  id          String         @id @default(cuid())
  pipelineId  String
  serverId    String?
  status      PipelineStatus @default(PENDING)
  logs        Json           @default("[]")
  startedAt   DateTime       @default(now())
  completedAt DateTime?

  // Relations
  pipeline    Pipeline       @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  server      BedrockServer? @relation(fields: [serverId], references: [id], onDelete: SetNull)

  @@map("pipeline_runs")
}
```

### 3.2 Prisma Client Singleton Export (`packages/db/src/client.ts`)
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

---

## 4. R1.2 HostProvider Strategy Pattern Blueprint (`packages/bedrock/src/provider.ts`)

### 4.1 Interface Contract Definition

```typescript
import { BedrockServer, HostProviderType } from '@mc-admin/db';

export interface ServerMetrics {
  cpuPercent: number;
  memoryMb: number;
  totalMemoryMb?: number;
  diskFreeGb?: number;
  uptimeSeconds: number;
  activePlayers: number;
}

export interface BackupTriggerOptions {
  backupId: string;
  presignedUploadUrl: string;
  isManual: boolean;
  isHoldCheckpoint?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  fileSizeBytes?: number;
  sha256?: string;
  error?: string;
}

export interface HostProvider {
  readonly type: HostProviderType;

  startServer(server: BedrockServer): Promise<boolean>;
  stopServer(server: BedrockServer, force?: boolean): Promise<boolean>;
  restartServer(server: BedrockServer): Promise<boolean>;
  getStatus(server: BedrockServer): Promise<ServerMetrics>;
  executeRcon(server: BedrockServer, command: string): Promise<string>;
  streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void;
  triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult>;
}
```

### 4.2 Concrete Implementations

#### A. `DockerAgentHostProvider`
Uses outbound WebSocket tunnel gateway (`apps/api` agent tunnel session registry) to dispatch commands to the Go daemon agent on the host machine.

```typescript
export class DockerAgentHostProvider implements HostProvider {
  public readonly type = HostProviderType.DOCKER_AGENT;

  constructor(private tunnelGateway?: any) {}

  public async startServer(server: BedrockServer): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    // TODO: Send CMD_EXEC frame (action: START_CONTAINER) over WSS tunnel to agentNode
    return true;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    if (!server.agentId) {
      throw new Error(`Server ${server.id} has no assigned agentNode`);
    }
    // TODO: Send CMD_EXEC frame (action: STOP_CONTAINER, force) over WSS tunnel
    return true;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    await this.stopServer(server);
    return this.startServer(server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    // TODO: Fetch latest telemetry frame from Agent WSS session
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    // TODO: Send CMD_EXEC frame (action: RCON_COMMAND, command) over WSS tunnel
    return `[STUB: DockerAgent] Executed "${command}" on server ${server.id}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    // TODO: Subscribe to WSS LOG_LINE frames for server.id
    onLog(`[STUB: DockerAgent] Log streaming started for server ${server.id}`);
    return () => {
      // Unsubscribe callback
    };
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    // TODO: Send BACKUP_START frame with presignedUploadUrl over WSS tunnel
    return {
      success: true,
      backupId: options.backupId,
      fileSizeBytes: 0,
    };
  }
}
```

#### B. `PterodactylHostProvider`
Interfaces directly with Pterodactyl Client REST API (`/api/client/servers/{id}/power`, `/api/client/servers/{id}/command`, `/api/client/servers/{id}/resources`) and WebSocket console feed.

```typescript
export class PterodactylHostProvider implements HostProvider {
  public readonly type = HostProviderType.PTERODACTYL;

  constructor(private apiBaseUrl?: string, private apiKey?: string) {}

  public async startServer(server: BedrockServer): Promise<boolean> {
    if (!server.pterodactylServerId) {
      throw new Error(`Server ${server.id} has no pterodactylServerId specified`);
    }
    // TODO: POST /api/client/servers/:id/power { signal: "start" }
    return true;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    if (!server.pterodactylServerId) {
      throw new Error(`Server ${server.id} has no pterodactylServerId specified`);
    }
    // TODO: POST /api/client/servers/:id/power { signal: force ? "kill" : "stop" }
    return true;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    if (!server.pterodactylServerId) {
      throw new Error(`Server ${server.id} has no pterodactylServerId specified`);
    }
    // TODO: POST /api/client/servers/:id/power { signal: "restart" }
    return true;
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    // TODO: GET /api/client/servers/:id/resources
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    // TODO: POST /api/client/servers/:id/command { command }
    return `[STUB: Pterodactyl] Sent command "${command}" to server ${server.pterodactylServerId}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    // TODO: Connect to Pterodactyl WebSocket console token endpoint
    onLog(`[STUB: Pterodactyl] Connected to console WebSocket for ${server.pterodactylServerId}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    // TODO: Trigger Pterodactyl backup API endpoint or execute save hold via RCON
    return {
      success: true,
      backupId: options.backupId,
    };
  }
}
```

#### C. `DirectRconSshHostProvider`
Interfaces with standalone VPS/Dedicated servers over direct TCP RCON socket connection for commands/logs and SSH execution for systemctl process lifecycle controls.

```typescript
export class DirectRconSshHostProvider implements HostProvider {
  public readonly type = HostProviderType.DIRECT_RCON_SSH;

  public async startServer(server: BedrockServer): Promise<boolean> {
    // TODO: Execute SSH systemctl start bedrock-server or binary process launcher
    return true;
  }

  public async stopServer(server: BedrockServer, force = false): Promise<boolean> {
    // TODO: Execute RCON "stop" or SSH systemctl stop bedrock-server
    return true;
  }

  public async restartServer(server: BedrockServer): Promise<boolean> {
    await this.stopServer(server);
    return this.startServer(server);
  }

  public async getStatus(server: BedrockServer): Promise<ServerMetrics> {
    // TODO: Poll SSH uptime / top or RCON status query
    return {
      cpuPercent: 0,
      memoryMb: 0,
      uptimeSeconds: 0,
      activePlayers: 0,
    };
  }

  public async executeRcon(server: BedrockServer, command: string): Promise<string> {
    // TODO: Open TCP RCON socket to server.host:server.rconPort, send packet, receive response
    return `[STUB: DirectRCON] Executed "${command}" via TCP RCON socket to ${server.host}:${server.rconPort || 19133}`;
  }

  public streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void {
    // TODO: SSH tail -f on serverPath/logs or content polling
    onLog(`[STUB: DirectRCON] Log tail started for ${server.host}`);
    return () => {};
  }

  public async triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<BackupResult> {
    // TODO: Direct RCON save hold sequence and local tar stream
    return {
      success: true,
      backupId: options.backupId,
    };
  }
}
```

#### D. `HostProviderFactory`
Registry factory pattern providing clean dynamic resolution of `HostProvider` strategy implementations.

```typescript
export class HostProviderFactory {
  private static providers: Map<HostProviderType, HostProvider> = new Map();

  public static registerProvider(type: HostProviderType, provider: HostProvider): void {
    this.providers.set(type, provider);
  }

  public static getProvider(type: HostProviderType | string): HostProvider {
    const enumType = type as HostProviderType;
    let provider = this.providers.get(enumType);

    if (!provider) {
      switch (enumType) {
        case HostProviderType.DOCKER_AGENT:
          provider = new DockerAgentHostProvider();
          break;
        case HostProviderType.PTERODACTYL:
          provider = new PterodactylHostProvider();
          break;
        case HostProviderType.DIRECT_RCON_SSH:
          provider = new DirectRconSshHostProvider();
          break;
        default:
          throw new Error(`Unsupported HostProviderType: ${type}`);
      }
      this.providers.set(enumType, provider);
    }

    return provider;
  }
}
```

---

## 5. Implementation Action Plan & Step-by-Step Blueprint

### Phase 1: `packages/db` Integration Steps
1. Create directory `packages/db/prisma`.
2. Write `packages/db/prisma/schema.prisma` with the complete model specification.
3. Update `packages/db/package.json` with `@prisma/client` dependency and Prisma CLI scripts:
   - `"db:generate": "prisma generate"`
   - `"db:push": "prisma db push"`
   - `"db:migrate": "prisma migrate dev"`
4. Create `packages/db/src/client.ts` exporting `prisma` singleton.
5. Synchronize `packages/db/src/schema.ts` to export TypeScript types derived from `@prisma/client` while maintaining legacy type alias compatibility for fast in-memory testing.
6. Update `packages/db/src/index.ts` to re-export `prisma` and `client.ts`.
7. Add schema verification test `packages/db/src/schema.test.ts`.

### Phase 2: `packages/bedrock` Integration Steps
1. Create `packages/bedrock/src/provider.ts` containing:
   - `ServerMetrics`, `BackupTriggerOptions`, `BackupResult`, `HostProvider` interfaces.
   - `DockerAgentHostProvider`, `PterodactylHostProvider`, `DirectRconSshHostProvider` strategy classes.
   - `HostProviderFactory`.
2. Update `packages/bedrock/src/index.ts` to re-export all symbols from `src/provider.ts`.
3. Add unit test suite `packages/bedrock/src/provider.test.ts` to verify strategy pattern resolution and factory behavior.

---

## 6. Build & Verification Protocol

After implementation by the implementer agent, the following commands must be executed to verify complete compliance:

```bash
# 1. Validate Prisma schema syntax
pnpm --filter @mc-admin/db exec prisma validate

# 2. Run unit test suites for db and bedrock packages
pnpm --filter @mc-admin/db test
pnpm --filter @mc-admin/bedrock test

# 3. Verify monorepo build and typecheck
pnpm build

# 4. Check workspace linting
pnpm lint
```
