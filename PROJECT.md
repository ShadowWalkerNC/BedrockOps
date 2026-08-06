# Project: BedrockOps V6

## Architecture
BedrockOps V6 is a monorepo control plane for Minecraft Bedrock Dedicated Servers (BDS) featuring CGNAT-safe outbound Go agent daemon tunneling, host provider abstraction, streaming backups to Cloudflare R2, player moderation tracking, and console onboarding.

```
+-------------------------------------------------------------------------+
|                              apps/web                                   |
|                     Next.js Admin Dashboard UI                          |
+------------------------------------+------------------------------------+
                                     | (HTTP REST / WSS Client)
                                     v
+-------------------------------------------------------------------------+
|                              apps/api                                   |
|               REST API Backend & WSS Tunnel Gateway                     |
|                   HostProvider Strategy Interface                       |
+--------+---------------------------+---------------------------+--------+
         | (Prisma ORM)              | (Outbound WSS)            | (REST API)
         v                           v                           v
+------------------+    +--------------------------+    +------------------+
|   packages/db    |    |        apps/agent        |    |   Pterodactyl /  |
| PostgreSQL / DB  |    |  Outbound Go Agent Daemon|    | Direct RCON SSH  |
+------------------+    +------------+-------------+    +------------------+
                                     | (Docker / BDS)
                                     v
                        +--------------------------+
                        |  Bedrock Dedicated Server|
                        +--------------------------+
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 PostgreSQL Database Schema | Prisma models for User, AgentNode, BedrockServer, ConnectionKey, ServerMember, BackupRecord, ModerationAction, AuditLog, BdsVersion | M1 | survey_1 & survey_2 |
| 2 | R1.2 HostProvider Abstraction Layer | TypeScript strategy pattern interface for DOCKER_AGENT, PTERODACTYL, and DIRECT_RCON_SSH | M1 | survey_2 |
| 3 | R1.3 REST API Backend & JWT Auth | Express/Fastify/HTTP routes in apps/api for authentication, server management, node pairing | M1 | survey_2 |
| 4 | R1.4 WebSocket Agent Tunnel & Gateway | WSS server endpoint in apps/api for agent tunnel framing and client console streaming | M1 | survey_2 |
| 5 | R1.5 Next.js Admin Dashboard UI | Dashboard UI at apps/web with live server list, node monitoring, moderation modals, backup controls | M1 | survey_1 & survey_2 |
| 6 | R2.1 Outbound WSS Go Daemon Agent | Native Go binary agent in apps/agent with persistent outbound TLS WSS tunnel and CGNAT bypass | M2 | survey_2 |
| 7 | R2.2 BDS Container & Process Lifecycle | Docker SDK integration and fallback process runner for start, stop, restart, status in Go | M2 | survey_2 |
| 8 | R2.3 Telemetry Collection Engine | gopsutil metrics scraper for CPU, RAM, disk, and server process uptime metrics | M2 | survey_2 |
| 9 | R2.4 RCON Client & Log Streamer | Go RCON client and stdout/stderr log parser with real-time WSS frame forwarding | M2 | survey_2 |
| 10 | R3.1 Save-Hold Live Checkpoint Sequence | Driver for save hold -> save query -> snapshot -> save resume RCON sequence | M3 | survey_2 |
| 11 | R3.2 Zero-Disk Streaming Compression | Tar/gzip stream compressor piping io.Pipe directly to Cloudflare R2 presigned PUT URLs | M3 | survey_2 |
| 12 | R3.3 Integrity Manifest Verification | SHA256 hashing engine and manifest.json verification validator for snapshot packages | M3 | survey_2 |
| 13 | R4.1 Player XUID & Gamertag Tracking | BDS stdout connection log parser capturing XUID and Gamertag on join events | M4 | survey_3 |
| 14 | R4.2 Persistent Infraction Ledger | Soft-delete GDPR-compliant moderation ledger (BAN, MUTE, WARN, NOTE) in PostgreSQL with anonymization | M4 | survey_3 |
| 15 | R4.3 BDS allowlist.json Auto-Sync | Atomic file swap and RCON allowlist reload synchronization mechanism | M4 | survey_3 |
| 16 | R5.1 Subdomain & Port Allocation | Subdomain mapping (abc123.play.bedrockops.io), UDP port pool reservation (19132-19999), and DNS record generator | M5 | survey_3 |
| 17 | R5.2 Console Player Onboarding | Gamertag-to-XUID resolution, Xbox Friend Bot invitation, and console allowlist seeding | M5 | survey_3 |
| 18 | R5.3 Automated Setup Pipelines | Multi-step pipeline execution engine for server provisioning and initial deployment | M5 | survey_3 |
| 19 | E2E Test Suite (Tiers 1-4) | Comprehensive Vitest requirement-driven opaque-box E2E test suite covering all features | M_E2E | survey_3 |
| 20 | Final Verification & Hardening | Final E2E pass + Tier 5 white-box adversarial testing and victory audit | M_FINAL | survey_1, 2, 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Control Plane, Database Schema & HostProvider Layer | Features 1-5 (Prisma DB, HostProvider interface, REST/WS API backend, Next.js UI) | None | COMPLETE |
| M2 | CGNAT-Safe Outbound Go Daemon Agent | Features 6-9 (Go agent binary, WSS tunnel, Docker lifecycle, telemetry, RCON logs) | M1 | COMPLETE |
| M3 | Streaming Backup Engine & Cloudflare R2 Integration | Features 10-12 (Save-hold driver, streaming gzip tar, presigned R2, manifest verification) | M1, M2 | IN_PROGRESS |
| M4 | Moderation Ledger & Allowlist Sync | Features 13-15 (Join tracking, infraction ledger, GDPR anonymize, allowlist.json sync) | M1, M2 | PLANNED |
| M5 | Subdomain Allocation & Console Onboarding | Features 16-18 (Subdomain & port allocation, console onboarding, setup pipelines) | M1, M4 | PLANNED |
| M_E2E | E2E Test Suite Development (Parallel Track) | Feature 19 (Tiers 1-4 test suite infrastructure and test cases) | M1 | IN_PROGRESS |
| M_FINAL | Final E2E Integration Pass & Hardening | Feature 20 (Phase 1 100% E2E tests pass + Phase 2 Tier 5 adversarial hardening) | M1-M5, M_E2E | PLANNED |

## Interface Contracts

### HostProvider Interface Contract (`packages/bedrock/src/provider.ts`)
```typescript
export interface HostProvider {
  type: 'DOCKER_AGENT' | 'PTERODACTYL' | 'DIRECT_RCON_SSH';
  startServer(serverId: string): Promise<boolean>;
  stopServer(serverId: string, force?: boolean): Promise<boolean>;
  restartServer(serverId: string): Promise<boolean>;
  getStatus(serverId: string): Promise<ServerMetrics>;
  executeRcon(serverId: string, command: string): Promise<string>;
  streamLogs(serverId: string, callback: (line: string) => void): () => void;
  triggerBackup(serverId: string, options: BackupOptions): Promise<BackupResult>;
}
```

### Go Agent Tunnel Protocol Contract (`apps/agent` <-> `apps/api`)
```json
{
  "id": "string",
  "type": "HEARTBEAT | CMD_EXEC | CMD_RESP | LOG_LINE | METRICS | BACKUP_START | BACKUP_PROGRESS | BACKUP_COMPLETE | BACKUP_ERROR",
  "nodeId": "string",
  "serverId": "string",
  "timestamp": 1234567890,
  "payload": "object"
}
```

## Code Layout
```
apps/
├── web/            # Next.js App Router admin UI
├── api/            # REST & WebSocket API backend
├── agent/          # Native Go daemon binary (cmd/bedrock-agent)
├── worker/         # Scheduled backup & maintenance worker
└── discord/        # Discord bot integration & alert notifications
packages/
├── db/             # Prisma schema & PostgreSQL client
├── bedrock/        # BDS parser, RCON client, HostProvider interface
├── backups/        # Backup snapshot engine & R2 presigned client
├── moderation/     # Infraction ledger, join parser, allowlist sync
├── templates/      # BDS configuration template engine
├── pipelines/      # Server provisioning & setup workflows
├── notifications/  # Discord & web alert payload formatters
├── auth/           # JWT & RBAC permission logic
├── audit/          # Structured audit logging schemas
├── config/         # Shared TS, ESLint, Tailwind configs
└── ui/             # React component library
```
