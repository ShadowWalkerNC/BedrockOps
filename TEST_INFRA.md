# E2E Test Infra: BedrockOps V6

## Test Philosophy
- Opaque-box, requirement-driven test suite for BedrockOps V6.
- Systematic testing methodology: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Workload Testing.
- Complete decoupled test harness providing deterministic stubs for outbound WebSocket agent connections, BDS stdout log streaming, Xbox Live APIs (Gamertag -> XUID, friend invites), and Cloudflare DNS record allocation.

## Feature Inventory & Test Coverage Matrix

| # | Feature | Source Requirement | Tier 1 (Feature Coverage) | Tier 2 (Boundary & Corner) | Tier 3 (Cross-Feature Pairwise) | Tier 4 (Real-World Scenarios) |
|---|---------|---------------------|:-------------------------:|:--------------------------:|:-------------------------------:|:-----------------------------:|
| 1 | R1.1 PostgreSQL Database Schema (Prisma Models) | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ | ✓ |
| 2 | R1.2 HostProvider Abstraction Layer | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ | ✓ |
| 3 | R1.3 REST API Backend & JWT Auth | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ | ✓ |
| 4 | R1.4 WebSocket Agent Tunnel & Gateway | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ | ✓ |
| 5 | R1.5 Next.js Admin Dashboard UI Data Contracts | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ | ✓ |
| 6 | R2.1 Outbound WSS Go Daemon Agent Protocol | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ | ✓ |
| 7 | R2.2 BDS Container & Process Lifecycle Commands | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ | ✓ |
| 8 | R2.3 Telemetry Collection Engine (gopsutil) | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ | ✓ |
| 9 | R2.4 RCON Client & BDS Log Streamer | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ | ✓ |
| 10 | R3.1 Save-Hold Live Checkpoint Sequence | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ | ✓ |
| 11 | R3.2 Zero-Disk Streaming Compression (R2 PUT) | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ | ✓ |
| 12 | R3.3 Integrity Manifest Verification (SHA256) | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ | ✓ |
| 13 | R4.1 Player XUID & Gamertag Tracking | ORIGINAL_REQUEST § R4 | 5 | 5 | ✓ | ✓ |
| 14 | R4.2 Persistent Infraction Ledger (GDPR Soft-Delete) | ORIGINAL_REQUEST § R4 | 5 | 5 | ✓ | ✓ |
| 15 | R4.3 BDS allowlist.json Auto-Sync | ORIGINAL_REQUEST § R4 | 5 | 5 | ✓ | ✓ |
| 16 | R5.1 Subdomain & Port Allocation (19132-19999) | ORIGINAL_REQUEST § R5 | 5 | 5 | ✓ | ✓ |
| 17 | R5.2 Console Player Onboarding (Xbox Friend Bot) | ORIGINAL_REQUEST § R5 | 5 | 5 | ✓ | ✓ |
| 18 | R5.3 Automated Setup Pipelines | ORIGINAL_REQUEST § R5 | 5 | 5 | ✓ | ✓ |
| **Total** | | | **90+** | **90+** | **20+** | **10+** |

## Test Architecture

### 1. Test Runner & Framework
- Framework: Vitest (`vitest run`)
- Workspace Location: `packages/e2e` (`@mc-admin/e2e`) and `tests/e2e`
- Pass Criterion: 100% test pass rate with zero unhandled exceptions

### 2. Test Harness & Mocks (`packages/e2e/src/harness/`)
- **`MockAgentServer`**: Simulates outbound WebSocket daemon connections, handling framing messages (`HEARTBEAT`, `CMD_EXEC`, `LOG_LINE`, `METRICS`, `BACKUP_START`, `BACKUP_PROGRESS`, `BACKUP_COMPLETE`), status transitions, and filesystem sync (`allowlist.json`).
- **`MockBdsLogStreamer`**: Simulates BDS stdout log streams, generating formatted lines for player join/leave events (`Player connected: <gamertag>, xuid: <xuid>`), RCON command stdout, and process exit codes.
- **`MockXboxService`**: Simulates Microsoft OpenXBL / Xbox Live REST endpoints, providing 64-bit XUID resolution from Gamertags and recording Xbox Friend Bot invitation dispatches.
- **`MockDnsProvider`**: In-memory Cloudflare DNS provider simulator, tracking DNS `A` and `SRV` record creation/deletion for server subdomains (`*.play.bedrockops.io`).

## Real-World Application Scenarios (Tier 4)
1. **Full Provisioning to Live Player Session**: Multi-step pipeline execution provisioning a server, assigning subdomain & port, seeding allowlist via Xbox Friend Bot, ingesting player join stdout log, and recording session activity.
2. **Moderation Ban & Instant Allowlist Sync**: Issuing a network ban on an active player, verifying automatic `allowlist.json` update, RCON reload command dispatch, player kick execution, audit log emission, and Discord notification delivery.
3. **Save-Hold Streaming Backup under Load**: Triggering live backup while players are connected, simulating RCON save hold -> save query -> snapshot streaming to Cloudflare R2 presigned URL -> save resume, and verifying SHA256 manifest integrity.
4. **GDPR Right-to-be-Forgotten Erasure Sweep**: Processing an anonymization request for a user XUID, verifying soft-deletion (`deletedAt`), Gamertag PII redaction (`[GDPR_REDACTED]`), IP address wiping, and exclusion from active UI/API search queries.
5. **Multi-Node Failover & Re-Pairing**: Simulating Go agent node disconnection during CGNAT traversal, buffer replay upon reconnection, and seamless host provider fallback.
6. **Console Player Onboarding Workflow**: End-to-end Xbox/PlayStation/Switch onboarding: Gamertag lookup -> XUID resolution -> allowlist injection -> Xbox Live Friend Bot dispatch -> connection verification.
7. **Port Pool Exhaustion & Allocation Recovery**: Stress-testing UDP port allocator across 868 concurrent server reservations (19132-19999), validating port conflict prevention, port recycling on server deletion, and failure boundaries.
8. **Backup Retention Sweeper & R2 Purge**: Simulating background worker execution scanning historical backups, applying retention limits, deleting expired snapshots from Cloudflare R2, and logging audit entries.
9. **Multi-Tenant Server Template Deployment**: Applying custom server templates (`server.properties`) across 10 independent servers, verifying parameter validation, atomic file writes, and Discord webhook alert dispatch.
10. **Full End-to-End System Integration**: Simultaneous multi-server setup, player join tracking, automated backups, moderation enforcement, and console onboarding running concurrently.

## Coverage Thresholds
- Tier 1: ≥ 5 tests per feature (90+ tests total)
- Tier 2: ≥ 5 tests per feature (90+ tests total)
- Tier 3: Pairwise coverage of major feature interactions (20+ tests total)
- Tier 4: Realistic end-to-end application scenarios (10+ tests total)
- **Total Minimum Test Count: ≥ 210 tests**
