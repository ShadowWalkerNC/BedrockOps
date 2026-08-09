# Handoff Report — Explorer 3: Phase 0 Technical Specifications (R4, R5 & E2E Test Suite)

## 1. Observation

A detailed examination of the existing repository files across `packages/` and `apps/` reveals the following concrete implementation state and architectural gaps:

### A. Existing Moderation Infrastructure (`packages/moderation/src/index.ts` & `packages/db/src/schema.ts`)
- **File**: `packages/moderation/src/index.ts` (lines 1-50)
  - `CreateModerationInput` interface (lines 3-11) accepts `gamertag` (string), optional `playerXuid` (string), `actionType` (`ModerationType`), `reason`, `issuerId`, `issuerName`, and optional `durationMinutes`.
  - `ModerationService.createAction()` (lines 13-30) generates an in-memory record and pushes to `db.moderationActions.push(actionRecord)`.
  - `ModerationService.getHistoryForPlayer()` (lines 32-37) filters `db.moderationActions` by case-insensitive gamertag.
  - `ModerationService.searchPlayers()` (lines 39-48) performs substring matching across gamertags.
- **File**: `packages/db/src/schema.ts` (lines 24-30, 117-130)
  - `ModerationType` enum defines `WARN`, `MUTE`, `KICK`, `BAN`, `NOTE`.
  - `ModerationAction` interface defines `id`, `serverId?`, `playerXuid?`, `gamertag`, `actionType`, `reason`, `issuerId`, `issuerName`, `durationMinutes?`, `active`, `deletedAt?`, `createdAt`.
- **Gaps Identified**:
  1. **No Join Event & XUID Tracking**: No database model or service exists for tracking player connection sessions, mapping Gamertags <-> XUIDs over time, or parsing join events from BDS logs.
  2. **In-Memory Storage & GDPR Soft Delete**: Actions are stored in ephemeral arrays (`db.moderationActions`). Soft-delete flag `deletedAt` is present in the schema interface but never filtered or processed in `getHistoryForPlayer` or `searchPlayers`. No data anonymization or GDPR "Right to be Forgotten" erasure method exists.
  3. **Missing BDS `allowlist.json` Sync**: No mechanism exists to convert `BAN` or `WARN` actions into BDS native `allowlist.json` entries or execute RCON allowlist reloads.
  4. **Missing Audit Logging**: `createAction()` does not emit audit events via `AuditLogger.record()`.

### B. Existing Server, Network & Template Infrastructure (`packages/templates`, `packages/pipelines`, `packages/db`)
- **File**: `packages/db/src/schema.ts` (lines 75-99)
  - `BedrockServer` interface contains `host` (string), `port` (number, default 19132), `rconPort`, `rconPassword`, `serverPath`.
  - Lacks fields for allocated subdomains (`subdomain`, `fqdn`), public port bindings (`allocatedPort`), DNS record IDs, or tunnel identifiers.
- **File**: `packages/templates/src/index.ts` (lines 1-48)
  - `TemplateEngine.applyTemplateToServer()` updates server `version`, `gameMode`, `difficulty`, and `maxPlayers`.
- **File**: `packages/pipelines/src/index.ts` (lines 13-88)
  - `PipelineEngine.runServerSetupPipeline()` executes 4 steps: (1) create server record, (2) apply template, (3) create initial backup, (4) emit audit log & Discord notification.
- **Gaps Identified**:
  1. **No Subdomain & Port Allocation Model**: No service or schema handles subdomains (e.g. `abc123.play.bedrockops.io`), host port reservation/conflict prevention, or DNS provider integration (e.g. Cloudflare A/SRV records).
  2. **No Console Player Onboarding**: No workflow exists for Xbox/PlayStation/Nintendo Switch players who cannot join direct IP addresses without Xbox Live Friend Bot invites or BedrockConnect DNS setup.

### C. Existing Agent, Discord & Worker Daemons (`apps/agent`, `apps/discord`, `apps/worker`)
- **File**: `apps/agent/src/index.ts` (lines 1-32): Contains static stub `executeLocalCommand()` returning fake strings. Does not parse BDS stdout for `Player connected: <gamertag>, xuid: <xuid>` or write `allowlist.json`.
- **File**: `apps/discord/src/index.ts` (lines 1-31): Contains `DiscordBotService` webhook alert dispatcher. Lacks interactive Discord slash commands or Xbox friend request triggers.
- **File**: `apps/worker/src/index.ts` (lines 1-22): Runs scheduled backup sweeps. Lacks background job logic for expiring temporary bans/mutes or cleaning up soft-deleted GDPR player records.

### D. Existing Test Infrastructure (`TEST_INFRA.md`, `packages/e2e/src/`)
- **File**: `packages/e2e/src/tier1-feature-coverage.test.ts` (lines 1-362)
  - Contains 4-tier test runner validating unit interactions against `MemoryDatabase`.
- **Gaps Identified**:
  - Tests rely entirely on synchronous in-memory array manipulation (`db.servers.push`).
  - No test harness exists for testing Go daemon WebSocket streaming, BDS stdout log parser event hooks, Cloudflare DNS mocks, or real PostgreSQL/Prisma query execution.

---

## 2. Logic Chain

1. **R4 Technical Specification Requirements**:
   - Production BDS servers log player connection events to stdout in the format: `Player connected: <Gamertag>, xuid: <XUID>`.
   - To track player identities reliably across Gamertag changes, the system must parse these log events, update a persistent `PlayerIdentity` store, and evaluate active infractions.
   - Compliance with GDPR requires soft deletion (`deletedAt`) by default to hide player records from UI queries, and an anonymization routine (`anonymizePlayerInfractions`) to scrub PII (Gamertag, IP) while retaining security audit totals.
   - For automatic enforcement, when a `BAN` is issued or revoked, the control plane must regenerate `allowlist.json` (`[{ "name": "Gamertag", "xuid": "XUID", "ignoresPlayerLimit": false }]`), transmit it via WebSocket to `apps/agent`, write it atomically, and trigger RCON `allowlist reload`.

2. **R5 Technical Specification Requirements**:
   - Modern Bedrock hosting requires routing player connections through recognizable subdomains (e.g. `abc123.play.bedrockops.io`) and dynamically allocated host ports (range 19132-19999).
   - Console players (Xbox, PlayStation, Nintendo Switch) cannot enter custom IP/port combinations in native Minecraft UI due to platform sandbox restrictions.
   - Console onboarding requires a 3-part solution:
     1. Gamertag to 64-bit XUID resolution via Xbox API.
     2. Automatic injection into server `allowlist.json`.
     3. Automated Xbox Live Friend Bot (`BedrockOps Bot`) that adds player as an Xbox friend so the server appears automatically under the console player's "Friends" tab.
   - Setup pipelines in `PipelineEngine` must automate server creation, port allocation, DNS record provisioning, allowlist seeding, and agent container startup.

3. **E2E Test Harness Requirements**:
   - V6 requires testing real asynchronous WebSocket agent connections, streaming log event parsers, and Prisma PostgreSQL migrations.
   - The E2E test harness must include mock WebSocket servers, simulated BDS log stream generators, mock DNS providers, and mock Xbox API endpoints to validate all 4 test tiers deterministically.

---

## 3. Caveats

- **Scope Limit**: Read-only survey. No source code in `apps/` or `packages/` was modified during this phase.
- **External Dependencies**: Full execution of console friend bot onboarding relies on Xbox Live API access tokens. Test harnesses must provide stubbed responses for Xbox OpenXBL/Microsoft APIs.
- **DNS Provider Integration**: Production setup assumes Cloudflare API for A/SRV record management. Local development should use a local hosts/proxy DNS stub.

---

## 4. Conclusion & Technical Specifications

### A. R4 Specification: Moderation & Persistent Infraction Ledger

#### 1. Prisma Data Models (`packages/db/prisma/schema.prisma`)
```prisma
enum ModerationType {
  WARN
  MUTE
  KICK
  BAN
  NOTE
}

model PlayerIdentity {
  id              String               @id @default(cuid())
  xuid            String               @unique
  primaryGamertag String
  knownGamertags  String[]
  firstJoinedAt   DateTime             @default(now())
  lastJoinedAt    DateTime             @updatedAt
  deletedAt       DateTime?            // GDPR soft delete
  sessions        PlayerServerSession[]
  infractions     Infraction[]

  @@index([xuid])
  @@index([primaryGamertag])
}

model PlayerServerSession {
  id               String         @id @default(cuid())
  playerXuid       String
  player           PlayerIdentity @relation(fields: [playerXuid], references: [xuid])
  serverId         String
  server           BedrockServer  @relation(fields: [serverId], references: [id])
  gamertag         String
  ipAddress        String?
  deviceOS         String?        // e.g. Android, iOS, Windows10, Xbox, PlayStation, Switch
  joinedAt         DateTime       @default(now())
  leftAt           DateTime?
  disconnectReason String?

  @@index([playerXuid])
  @@index([serverId])
}

model Infraction {
  id              String         @id @default(cuid())
  serverId        String?        // Null = global network ban
  server          BedrockServer? @relation(fields: [serverId], references: [id])
  playerXuid      String
  player          PlayerIdentity @relation(fields: [playerXuid], references: [xuid])
  gamertag        String
  type            ModerationType
  reason          String
  issuerId        String
  issuerName      String
  durationMinutes Int?           // Null = permanent
  expiresAt       DateTime?
  active          Boolean        @default(true)
  revokedAt       DateTime?
  revokedBy       String?
  revokeReason    String?
  deletedAt       DateTime?      // GDPR soft delete

  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  @@index([playerXuid])
  @@index([serverId])
  @@index([active])
}
```

#### 2. Join Event Hook Pipeline & BDS Log Parser
- **Agent Log Parser (`apps/agent/src/logParser.ts`)**:
  - Monitors BDS standard output line by line.
  - Match regex: `/Player connected: (?<gamertag>.+?), xuid: (?<xuid>\d+)/`
  - Match regex: `/Player disconnected: (?<gamertag>.+?), xuid: (?<xuid>\d+)/`
  - On match, emits WebSocket frame to control plane (`apps/api`):
    `{ type: "PLAYER_JOIN", payload: { serverId, gamertag, xuid, timestamp } }`
- **Control Plane Ingestion (`apps/api/src/services/playerService.ts`)**:
  1. Upsert `PlayerIdentity`: Set `xuid`, update `primaryGamertag`, append to `knownGamertags` if new.
  2. Record `PlayerServerSession`.
  3. Active Infraction Check: Query `Infraction` where `playerXuid = xuid`, `type = BAN`, `active = true`, `deletedAt IS NULL`, (`expiresAt IS NULL` OR `expiresAt > now()`).
  4. If banned: Execute RCON command `kick "${gamertag}" Banned: ${reason}` and update disconnect reason.
  5. Audit Event: Record `PLAYER_JOIN_ALLOWED` or `PLAYER_JOIN_BLOCKED_BAN`.

#### 3. GDPR Compliance & Soft-Delete Architecture
- **Soft-Delete Filtering**: All queries in `ModerationService` filter out records where `deletedAt IS NOT NULL`.
- **GDPR Anonymization Function**:
  ```typescript
  public static async anonymizePlayerGDPR(xuid: string): Promise<void> {
    const timestamp = new Date();
    await db.playerIdentity.update({
      where: { xuid },
      data: {
        primaryGamertag: '[GDPR_REDACTED]',
        knownGamertags: ['[GDPR_REDACTED]'],
        deletedAt: timestamp
      }
    });
    await db.infraction.updateMany({
      where: { playerXuid: xuid },
      data: {
        gamertag: '[GDPR_REDACTED]',
        reason: '[REDACTED_PRIVACY_REQUEST]',
        deletedAt: timestamp
      }
    });
    await db.playerServerSession.updateMany({
      where: { playerXuid: xuid },
      data: {
        gamertag: '[GDPR_REDACTED]',
        ipAddress: null
      }
    });
  }
  ```

#### 4. Native BDS `allowlist.json` Auto-Sync
- **Format**: JSON array of `{ ignoresPlayerLimit: boolean, name: string, xuid: string }`.
- **Sync Trigger**: Fired on allowlist addition, ban creation, ban revocation, or console onboarding completion.
- **Agent File Operations (`apps/agent`)**:
  1. Receives `ALLOWLIST_SYNC` payload from API.
  2. Writes to `allowlist.json.tmp` in BDS server directory.
  3. Renames `allowlist.json.tmp` -> `allowlist.json` (atomic write).
  4. Sends RCON command `allowlist reload` to BDS process socket.

---

### B. R5 Specification: Subdomain Allocation & Console Onboarding

#### 1. Network & Subdomain Data Model
```prisma
model SubdomainAllocation {
  id            String        @id @default(cuid())
  serverId      String        @unique
  server        BedrockServer @relation(fields: [serverId], references: [id])
  subdomain     String        @unique // e.g. "abc123"
  fqdn          String        // e.g. "abc123.play.bedrockops.io"
  allocatedPort Int           // e.g. 19134 (public host UDP port)
  internalPort  Int           @default(19132)
  dnsRecordId   String?
  status        String        @default("PROVISIONED")
  createdAt     DateTime      @default(now())
}
```

#### 2. Subdomain & Port Manager (`packages/bedrock/src/networkManager.ts`)
- **Port Allocator**: Maintains reserved port pool (19132–19999). Scans existing allocations and assigns lowest available UDP port.
- **Subdomain Generator**: Formats unique slug from server name + random 4-char hex string (`${nameSlug}-${shortId}.play.bedrockops.io`).
- **Cloudflare DNS Provisioner**:
  - API call to create DNS `A` record pointing `play.bedrockops.io` to Node IP.
  - API call to create DNS `SRV` record: `_minecraft._udp.${subdomain}.play.bedrockops.io` pointing to `port` and `target`.

#### 3. Console Onboarding Workflow (Xbox / PlayStation / Switch)
- **Step 1: Onboarding Request**: Console player enters Gamertag into web onboarding page or Discord command (`/join gamertag:Steve`).
- **Step 2: Gamertag -> XUID Resolution**: Calls Xbox API service to resolve Gamertag to 64-bit XUID (e.g. `2535412345678901`).
- **Step 3: Allowlist Injection**: Adds `{ name: Gamertag, xuid: XUID, ignoresPlayerLimit: false }` to server allowlist and syncs `allowlist.json` to agent.
- **Step 4: Xbox Friend Bot Dispatch**:
  - Controls an Xbox Live bot account (`BedrockOps Join Bot`).
  - Sends Xbox Live friend request to player Gamertag.
  - Once accepted, server appears under player's native **Friends** tab in Minecraft Bedrock on Xbox, PlayStation, and Switch!
- **Step 5: Platform-Specific Instructions**:
  - **Xbox**: Open Friends tab -> Join `BedrockOps Bot`.
  - **PlayStation / Switch**: Join via `BedrockOps Bot` friend tab OR set Primary DNS to BedrockConnect proxy (`135.181.126.15`).

#### 4. Extended Setup Pipeline (`packages/pipelines/src/index.ts`)
1. Create `BedrockServer` database record.
2. Allocate subdomain & UDP port via `SubdomainAllocation`.
3. Provision DNS SRV/A records via Cloudflare integration.
4. Apply selected `ServerTemplate` (`server.properties`).
5. Initialize empty `allowlist.json` and generate console onboarding code.
6. Trigger Go Agent to initialize BDS container directory & start process.
7. Execute health check poll until status is `ONLINE`.
8. Create initial safety backup snapshot.
9. Dispatch audit log & send Discord onboarding embed with domain URL & console code.

---

### C. E2E Test Suite Design Specification

To validate BedrockOps V6 requirements (R1–R5), the E2E test harness must be structured into 4 distinct tiers using Vitest:

#### 1. Test Harness Components (`packages/e2e/src/harness/`)
- **`MockAgentServer`**: Simulated WebSocket server mimicking `apps/agent` responses, container status transitions, and file system writes (`allowlist.json`).
- **`MockBdsLogStreamer`**: Helper that emits simulated stdout lines (`Player connected: SteveCraft, xuid: 2535412345678901`) to test join event pipelines.
- **`MockXboxService`**: Mock API resolving Gamertag -> XUID and recording Xbox friend request dispatches.
- **`MockDnsProvider`**: In-memory registry tracking A and SRV record creations for `subdomain.play.bedrockops.io`.

#### 2. 4-Tier Test Matrix Coverage
- **Tier 1: Feature Coverage**:
  - Verify player join log parsing -> `PlayerIdentity` upsert -> session creation.
  - Verify `BAN` action -> `allowlist.json` auto-sync -> RCON reload.
  - Verify subdomain allocation + Cloudflare DNS mock record creation.
  - Verify console player Gamertag -> XUID resolution & Xbox Friend Bot dispatch.
- **Tier 2: Boundary & Corner Cases**:
  - Duplicate XUID join with modified Gamertag (tests primary Gamertag update & history tracking).
  - Soft-delete GDPR request execution (verify `deletedAt` filtering in UI queries and PII redaction).
  - Port exhaustion in port allocator pool (tests error boundary handling).
  - Malformed BDS stdout log lines (tests log parser robustness).
- **Tier 3: Multi-Domain Integration Flows**:
  - Console Onboarding Flow: Gamertag lookup -> XUID resolution -> allowlist injection -> friend bot invite -> join event ingestion -> session active.
  - Moderation Escalation Flow: MUTE issued -> MUTE expires via worker sweep -> BAN issued -> `allowlist.json` synced -> player join attempt auto-kicked -> audit log recorded -> Discord alert sent.
- **Tier 4: Real-World Scenarios**:
  - Automated provisioning pipeline for 10 concurrent servers with subdomains, templates, backups, and console allowlist seeding.
  - Full GDPR data erasure request sweep across 1,000 historical session & infraction records.

---

## 5. Verification Method

To verify these specifications against the current repository state:

1. **Inspect Existing In-Memory Implementations**:
   - `view_file` on `packages/moderation/src/index.ts` (lines 1-50) — observe missing XUID event tracking & allowlist sync.
   - `view_file` on `packages/db/src/schema.ts` (lines 75-130) — observe missing `PlayerIdentity`, `PlayerServerSession`, and `SubdomainAllocation` models.
   - `view_file` on `packages/pipelines/src/index.ts` (lines 13-88) — observe basic 4-step setup pipeline lacking subdomain & console onboarding steps.

2. **Run Monorepo Test Suite**:
   ```bash
   npx vitest run
   ```
   *Expected Result*: 5 unit test files pass for basic in-memory models. The extended E2E test harness designed above will serve as the verification baseline for Phase 1/V6 implementation.
