# Handoff Report: Phase 0 Survey (Explorer 2) — Technical Specifications for R1, R2, & R3

## 1. Observation

### 1.1 Existing Repository State & Package Boundaries
- **Monorepo Scaffold**: Managed via `pnpm` workspaces + Turborepo (`turbo.json`, `package.json`).
- **`packages/db`** (`packages/db/src/schema.ts`): Contains in-memory mock schema and interface definitions (`User`, `AgentNode`, `ConnectionKey`, `ServerMember`, `BedrockServer`, `BackupRecord`, `ModerationAction`, `ServerTemplate`, `Pipeline`, `PipelineRun`, `AuditLog`, `BdsVersion`). Currently lacks a production PostgreSQL `schema.prisma` file.
- **`packages/bedrock`** (`packages/bedrock/src/index.ts`): Provides `BedrockProperties` interface, `parseProperties`, `serializeProperties`, and a stubbed `executeRconCommand`.
- **`packages/backups`** (`packages/backups/src/index.ts`): Implements `BackupEngine` with stubbed in-memory snapshot creation (`Math.random()` size), local path generation, restore state check, and retention policy filter.
- **`apps/agent`** (`apps/agent/src/index.ts`): Simple Node.js stub class (`LocalBedrockAgent`) with `checkHealth` and `executeLocalCommand`. Needs Go binary architecture for outbound WebSocket agent daemon.
- **`apps/api`** (`apps/api/src/index.ts`): Node.js stub server (`ApiServer`) demonstrating handler calls to in-memory `db`, `AuditLogger`, `BackupEngine`, `NotificationDispatcher`, and `PipelineEngine`.

### 1.2 Key File Locations
- Requirements Source: `ORIGINAL_REQUEST.md` (Lines 13-20)
- Repository Rules: `AGENTS.md` (Lines 10-28 for boundaries, 32-40 for standards)
- Master Plan: `PROJECT_PLAN.md` (Lines 23-47 monorepo layout, 51-87 roadmap phases)

---

## 2. Logic Chain

1. **R1 (Control Plane & HostProvider Abstraction)** requires transforming stubbed in-memory interfaces into a robust PostgreSQL Prisma schema, defining a unified `HostProvider` strategy pattern in TypeScript, and establishing REST/WebSocket API route contracts in `apps/api`.
2. **R2 (CGNAT-Safe Outbound Go Daemon Agent)** requires moving beyond Node.js stubs in `apps/agent` to a native Go binary daemon (`apps/agent/cmd/bedrock-agent`). Because home/VPS hosts are behind CGNAT firewalls with no public IPv4 ports, the agent MUST establish an outbound TLS WebSocket tunnel back to `apps/api`. It must multiplex process control, gopsutil metrics, log streaming, and local RCON commands over this tunnel.
3. **R3 (Streaming Backup Engine & Cloudflare R2 Integration)** requires a zero-local-disk streaming architecture. Live Bedrock LevelDB databases require an active `save hold` -> `save query` -> snapshot copy -> `save resume` RCON sequence to guarantee zero corruption. Piping this directly into `tar.Writer` -> `gzip.Writer` -> HTTP PUT stream over Cloudflare R2 presigned URLs ensures zero local disk exhaustion and high-throughput backup execution.

---

## 3. Caveats

- **Cloudflare R2 S3 Compatibility**: Cloudflare R2 utilizes S3-compatible APIs. Standard `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` can be used to generate presigned PUT URLs, but multi-part upload presigned URLs require exact chunk-size synchronization between `apps/api` and `apps/agent`.
- **Docker vs Standalone BDS Execution**: The Go agent design assumes BDS runs inside Docker containers on host machines for isolation and resource limits, with direct host-process systemd fallback for non-containerized hosts.
- **WebSocket Protocol Framing**: Frame serialization over the WebSocket tunnel should use lightweight JSON payloads with strict message types to maintain compatibility between TypeScript (`apps/api`) and Go (`apps/agent`).

---

## 4. Conclusion & Technical Specifications

### 4.1 Specification for R1: Control Plane & HostProvider Abstraction

#### A. Database Schema (`packages/db/prisma/schema.prisma`)
```prisma
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

model User {
  id           String         @id @default(cuid())
  email        String         @unique
  passwordHash String
  username     String?
  role         UserRole       @default(ADMIN)
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  servers      ServerMember[]
  auditLogs    AuditLog[]
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
  servers         BedrockServer[]
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
  agentNode           AgentNode?       @relation(fields: [agentId], references: [id])
  pterodactylServerId String?
  autoUpdate          Boolean          @default(false)
  lastCrashAt         DateTime?
  crashCount24h       Int              @default(0)
  deletedAt           DateTime?
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
  members             ServerMember[]
  backups             BackupRecord[]
  moderations         ModerationAction[]
  connectionKeys      ConnectionKey[]
}

model ConnectionKey {
  id        String        @id @default(cuid())
  serverId  String
  server    BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)
  key       String        @unique
  maxUses   Int           @default(1)
  useCount  Int           @default(0)
  expiresAt DateTime?
  createdAt DateTime      @default(now())
}

model ServerMember {
  id        String        @id @default(cuid())
  serverId  String
  server    BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      UserRole      @default(ADMIN)
  createdAt DateTime      @default(now())
}

model BackupRecord {
  id                  String       @id @default(cuid())
  serverId            String
  server              BedrockServer @relation(fields: [serverId], references: [id], onDelete: Cascade)
  filename            String
  fileSizeBytes       BigInt       @default(0)
  storageUrl          String?
  storagePath         String
  sha256              String?
  verified            Boolean      @default(false)
  status              BackupStatus @default(PENDING)
  isManual            Boolean      @default(false)
  isHoldCheckpoint    Boolean      @default(true)
  notes               String?
  bdsVersion          String?
  manifestJson        Json?
  createdAt           DateTime     @default(now())
}

model ModerationAction {
  id              String         @id @default(cuid())
  serverId        String?
  server          BedrockServer? @relation(fields: [serverId], references: [id], onDelete: SetNull)
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
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  actorId    String
  actorName  String
  action     String
  entityType String
  entityId   String
  metadata   Json?
  timestamp  DateTime @default(now())
}

model BdsVersion {
  id          String   @id @default(cuid())
  version     String   @unique
  downloadUrl String
  releaseDate DateTime
  isLatest    Boolean  @default(false)
  isSupported Boolean  @default(true)
}
```

#### B. HostProvider Abstraction Design (`packages/bedrock/src/provider.ts`)
```typescript
export interface ServerMetrics {
  cpuPercent: number;
  memoryMb: number;
  uptimeSeconds: number;
  activePlayers: number;
}

export interface BackupTriggerOptions {
  backupId: string;
  presignedUploadUrl: string;
  isManual: boolean;
}

export interface HostProvider {
  type: 'DOCKER_AGENT' | 'PTERODACTYL' | 'DIRECT_RCON_SSH';
  startServer(server: BedrockServer): Promise<boolean>;
  stopServer(server: BedrockServer, force?: boolean): Promise<boolean>;
  restartServer(server: BedrockServer): Promise<boolean>;
  getStatus(server: BedrockServer): Promise<ServerMetrics>;
  executeRcon(server: BedrockServer, command: string): Promise<string>;
  streamLogs(server: BedrockServer, onLog: (line: string) => void): () => void;
  triggerBackup(server: BedrockServer, options: BackupTriggerOptions): Promise<boolean>;
}
```

#### C. Control Plane REST & WebSocket API Routes (`apps/api`)
| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/v1/servers` | JWT | List all registered servers |
| `POST` | `/api/v1/servers` | JWT | Register/provision new Bedrock server |
| `GET` | `/api/v1/servers/:id` | JWT | Fetch details for a specific server |
| `POST` | `/api/v1/servers/:id/power` | JWT | Power control (`START`, `STOP`, `RESTART`, `KILL`) |
| `POST` | `/api/v1/servers/:id/rcon` | JWT | Send RCON command payload |
| `GET` | `/api/v1/servers/:id/backups` | JWT | Get backups history for server |
| `POST` | `/api/v1/servers/:id/backups` | JWT | Trigger manual streaming backup |
| `GET` | `/api/v1/nodes` | JWT | List all registered Go agent nodes |
| `POST` | `/api/v1/nodes/token` | JWT | Generate pairing token for new Go agent node |
| `WS` | `/api/v1/ws/agent` | Token | Outbound agent tunnel connection endpoint |
| `WS` | `/api/v1/ws/client` | JWT | Live console log and telemetry multiplexer for Next.js UI |

---

### 4.2 Specification for R2: CGNAT-Safe Outbound Go Daemon Agent

#### A. Architecture & Tunnel Design
- The agent runs as a Go daemon on target host machine (Linux/Windows).
- Initiates persistent outbound WSS connection: `wss://<control-plane-domain>/api/v1/ws/agent`.
- Bypasses NAT/CGNAT firewalls since connections are outbound TCP 443.
- Automatic reconnect loop with exponential backoff (1s initial, 60s max, 20% jitter).

#### B. Go Agent Directory & Package Structure
```
apps/agent/
├── cmd/
│   └── bedrock-agent/
│       └── main.go                  # CLI entrypoint, flag parsing, daemon launcher
├── pkg/
│   ├── config/
│   │   └── config.go                # Agent config parser (node ID, agent token, WSS URL)
│   ├── tunnel/
│   │   ├── client.go                # Gorilla WebSocket client & auto-reconnect loop
│   │   ├── frame.go                 # Protocol frame types & JSON payload schemas
│   │   └── router.go                # Incoming frame dispatcher (command runner)
│   ├── container/
│   │   ├── docker.go                # Docker SDK wrapper (start, stop, status)
│   │   └── process.go               # Direct BDS binary execution fallback
│   ├── telemetry/
│   │   └── metrics.go               # gopsutil metrics scraper (CPU/RAM/Disk/Uptime)
│   ├── rcon/
│   │   └── rcon.go                  # Go TCP RCON client for BDS instance
│   ├── logs/
│   │   └── streamer.go              # Container stdout/stderr log stream reader
│   └── backup/
│       ├── savehold.go              # RCON save hold / save query sequence driver
│       └── streamer.go              # Streaming tar.gz writer to presigned R2 HTTP PUT
└── go.mod
```

#### C. WebSocket Tunnel Frame Protocol Specification
Frame Format (JSON over WebSocket Text / Binary Frame):
```json
{
  "id": "msg_987654321",
  "type": "HEARTBEAT | CMD_EXEC | CMD_RESP | LOG_LINE | METRICS | BACKUP_START | BACKUP_PROGRESS | BACKUP_COMPLETE | BACKUP_ERROR",
  "nodeId": "node_abc123",
  "serverId": "srv_xyz789",
  "timestamp": 1788684600,
  "payload": {}
}
```

*Frame Payloads*:
1. `HEARTBEAT`: `payload: { cpuPercent: 12.5, memoryMb: 1024, totalMemoryMb: 8192, diskFreeGb: 45.2, uptimeSeconds: 86400, servers: [{ id: "srv_xyz", status: "ONLINE", players: 3 }] }`
2. `CMD_EXEC`: `payload: { commandId: "cmd_01", command: "list" }`
3. `CMD_RESP`: `payload: { commandId: "cmd_01", output: "There are 3/10 players online: Alex, Steve, Bob" }`
4. `LOG_LINE`: `payload: { line: "[2026-08-06 08:50:12 INFO] Player connected: Steve, xuid: 253541..." }`

---

### 4.3 Specification for R3: Streaming Backup Engine & Cloudflare R2 Integration

#### A. Save-Hold Live Checkpoint Sequence Protocol
```
[Control Plane / API]  ---> BACKUP_START ---> [Go Agent]
                                                  |
                                                  v
                                     Exec RCON: "save hold"
                                                  |
                                                  v
                                     Poll RCON: "save query"
                                      (Until file list returned:
                                       world/level.dat:1200,
                                       world/db/000005.ldb:34912)
                                                  |
                                                  v
                                     Lock & Read Snapshot Files
                                                  |
                                                  +---> Stream to Tar/Gzip pipeline ---> Presigned R2 PUT URL
                                                  |
                                                  v
                                     Exec RCON: "save resume"
                                                  |
                                                  v
                                     Finalize SHA256 & Manifest
                                                  |
[Control Plane / API]  <--- BACKUP_COMPLETE <-----+
```

#### B. Zero-Disk Streaming Compression & Upload Architecture
1. **Presigned URL Generation (`apps/api`)**:
   Uses S3 Client configured for Cloudflare R2:
   - Endpoint: `https://<account_id>.r2.cloudflarestorage.com`
   - Bucket: `bedrock-ops-backups`
   - Object Key: `backups/{serverId}/{backupId}.tar.gz`
   - Signed Expiration: 3600 seconds (1 hour).
2. **Stream Archiver Goroutine (`apps/agent/pkg/backup/streamer.go`)**:
   - `pr, pw := io.Pipe()`
   - Goroutine A (Compressor):
     - `gw := gzip.NewWriter(pw)`
     - `tw := tar.NewWriter(gw)`
     - `multiWriter := io.MultiWriter(tw, hashWriter)`
     - For each file in `save query` list:
       - Truncate read to exact byte length specified in `save query`.
       - Write `tar.Header{Name: path, Size: len, Mode: 0644}`.
       - `io.CopyN(multiWriter, fileRef, len)`.
     - Close `tw`, close `gw`, close `pw`.
   - Goroutine B (Uploader):
     - `req, _ := http.NewRequest("PUT", presignedUrl, pr)`
     - `req.Header.Set("Content-Type", "application/gzip")`
     - `resp, err := httpClient.Do(req)`
     - Verify `resp.StatusCode == 200`.

#### C. Integrity Manifest Schema (`manifest.json`)
```json
{
  "version": "1.0",
  "backupId": "bkp_1788684600_abc",
  "serverId": "srv_xyz789",
  "bdsVersion": "1.20.80.01",
  "timestamp": "2026-08-06T08:50:00Z",
  "isHoldCheckpoint": true,
  "sha256": "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
  "compressedSizeBytes": 5420192,
  "uncompressedSizeBytes": 18492010,
  "fileCount": 38,
  "files": [
    {
      "path": "level.dat",
      "bytes": 1200,
      "sha256": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284ddd200126d9069e"
    },
    {
      "path": "db/000005.ldb",
      "bytes": 34912,
      "sha256": "c0535e4be2b79ffd93291305436bf889314e4a3faec05ecffcbb7df31ad9e51a"
    }
  ]
}
```

---

## 5. Verification Method

1. **Database Schema & Build Verification**:
   - Verify Prisma schema compilation: `pnpm --filter @mc-admin/db exec prisma validate`.
   - Verify monorepo typecheck and package compilation: `pnpm build`.
   - Run unit test suites across all packages: `pnpm test`.

2. **Go Agent Tunnel & Telemetry Verification**:
   - Launch local mock WSS server in `apps/api` test harness.
   - Build Go agent binary: `go build -o bedrock-agent ./cmd/bedrock-agent` in `apps/agent`.
   - Execute binary with test pairing token and verify `HEARTBEAT` and `METRICS` frames arrive every 5s.

3. **Streaming Backup & Presigned R2 Verification**:
   - Run test script generating mock BDS world files and live `save query` outputs.
   - Assert `io.Pipe()` streams directly to presigned S3/R2 mock endpoint without generating intermediary tarball files on local filesystem.
   - Compare stream SHA256 checksum against completed `BackupManifest` file list.
