# Phase 0 Codebase Survey & Gap Analysis — BedrockOps V6

**Agent**: Explorer 1  
**Working Directory**: `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_1`  
**Date**: 2026-08-06  
**Status**: Survey Complete — Read-Only Analysis  

---

## 1. Observation

### A. Core Workspace & Turborepo Infrastructure
- **Monorepo Configuration**:
  - `package.json`: Root package configured with `pnpm@9.0.0`, `turbo^2.0.0`, and `typescript^5.4.0`. Root scripts include `"build": "turbo build"`, `"dev": "turbo dev"`, `"lint": "turbo lint"`, `"test": "turbo test"`, `"clean": "turbo clean"`.
  - `pnpm-workspace.yaml`: Workspace packages mapped to `"apps/*"` and `"packages/*"`.
  - `turbo.json`: Pipelines defined for `build` (outputs `.next/**`, `dist/**`), `lint`, `test` (depends on `^build`), and `dev`.
  - `docker-compose.yml`: Defines `postgres:16-alpine` (port 5432:5432, db `minecraft_ops`) and `redis:7-alpine` (port 6379:6379).

### B. Domain Packages (`packages/*`)
1. **`packages/db`** (`@mc-admin/db`):
   - `src/schema.ts` (184 lines): Defines TypeScript enums (`UserRole`, `ServerStatus`, `BackupStatus`, `ModerationType`, `PipelineStatus`) and interfaces (`User`, `AgentNode`, `ConnectionKey`, `ServerMember`, `BedrockServer`, `BackupRecord`, `ModerationAction`, `ServerTemplate`, `Pipeline`, `PipelineRun`, `AuditLog`, `BdsVersion`).
   - `src/index.ts` (118 lines): Exports an in-memory `MemoryDatabase` class with pre-seeded dev defaults (`seedDefaults()`).
   - **Observation**: Zero `.prisma` files exist in the repository; `package.json` has no Prisma CLI or `@prisma/client` dependency.
2. **`packages/config`** (`@mc-admin/config`):
   - `src/env.ts` (40 lines): Uses Zod to parse `NODE_ENV`, `PORT`, `DATABASE_URL`, `DISCORD_WEBHOOK_URL`, `BEDROCK_SERVER_PATH`, `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD`.
3. **`packages/auth`** (`@mc-admin/auth`):
   - `src/index.ts` (29 lines): Exports `hasPermission()` with RBAC role hierarchy (`OWNER: 4`, `ADMIN: 3`, `MODERATOR: 2`, `VIEWER: 1`) and `generateDevSession()`.
4. **`packages/bedrock`** (`@mc-admin/bedrock`):
   - `src/index.ts` (55 lines): Exports `BedrockServerController` with `parseProperties()`, `serializeProperties()`, `executeRconCommand()` (STUB), and `setServerStatus()`.
5. **`packages/audit`** (`@mc-admin/audit`):
   - `src/index.ts` (37 lines): Exports `AuditLogger` with `record()`, `getLogsForEntity()`, and `getAllLogs()`.
6. **`packages/backups`** (`@mc-admin/backups`):
   - `src/index.ts` (63 lines): Exports `BackupEngine` with `triggerBackup()`, `getBackupsForServer()`, `restoreBackup()`, and `applyRetentionPolicy()`. Uses simulated sizes via `Math.random()`.
7. **`packages/moderation`** (`@mc-admin/moderation`):
   - `src/index.ts` (50 lines): Exports `ModerationService` with `createAction()`, `getHistoryForPlayer()`, and `searchPlayers()`.
8. **`packages/notifications`** (`@mc-admin/notifications`):
   - `src/index.ts` (63 lines): Exports `NotificationDispatcher` with embed generators and mock payload queue (`sentMessages`).
9. **`packages/templates`** (`@mc-admin/templates`):
   - `src/index.ts` (48 lines): Exports `TemplateEngine` with `createTemplate()` and `applyTemplateToServer()`.
10. **`packages/pipelines`** (`@mc-admin/pipelines`):
    - `src/index.ts` (89 lines): Exports `PipelineEngine` with `runServerSetupPipeline()`.
11. **`packages/ui`** (`@mc-admin/ui`):
    - `src/index.ts` (28 lines): Exports `UI_THEME` token map and `getStatusBadgeStyle()`. No React components are exported.
12. **`packages/e2e`** (`@mc-admin/e2e`):
    - Contains 4 Vitest test files (`tier1-feature-coverage.test.ts`, `tier2-boundary-corner.test.ts`, `tier3-cross-feature.test.ts`, `tier4-real-world.test.ts`) with 41 passing E2E tests.

### C. Applications (`apps/*`)
1. **`apps/web`** (`@mc-admin/web`):
   - Next.js application using Pages Router (`src/pages/index.tsx`, `src/pages/api/*.ts`).
   - `src/pages/index.tsx` (581 lines): Single dashboard page with tabs for Servers, Backups, Moderation, Discord, Templates, Referrals. Uses inline CSS styles.
   - `src/pages/api/`: API handlers (`servers.ts`, `backups.ts`, `moderation.ts`, `servers/[id]/control.ts`) that directly import backend domain packages and mutate `db` in-memory.
2. **`apps/api`** (`@mc-admin/api`):
   - `src/index.ts` (87 lines): Static `ApiServer` class with stubbed helper methods (`getServers`, `createServer`, `triggerManualBackup`, `executeSetupPipeline`).
   - **Observation**: Does not instantiate an HTTP or WebSocket listener framework (e.g. Express/Fastify/Hono).
3. **`apps/agent`** (`@mc-admin/agent`):
   - `src/index.ts` (18 lines): TypeScript `LocalBedrockAgent` stub class.
   - **Observation**: Zero Go (`.go`) source files or Go modules (`go.mod`) exist in the repository.
4. **`apps/worker`** (`@mc-admin/worker`):
   - `src/index.ts` (22 lines): `BackgroundJobWorker.runScheduledBackupSweep()`.
5. **`apps/discord`** (`@mc-admin/discord`):
   - `src/index.ts` (31 lines): `DiscordBotService.initializeBot()` and `dispatchAlert()`.

### D. Build & Test Executions
- `pnpm test`: Executed successfully in ~95ms (cached/replayed), passing all 41 E2E tests and domain package unit tests across 28 tasks.
- `pnpm build`: Executed successfully in 25.59s, building all 17 tasks (including `@mc-admin/web` next build) with 0 errors.

---

## 2. Logic Chain

1. **Prisma ORM & PostgreSQL Schema Gap**:
   - *Observation*: `ORIGINAL_REQUEST.md` (R1 & Acceptance Criteria) mandates a PostgreSQL database schema defined with Prisma models for `User`, `AgentNode`, `Server`, `ConnectionKey`, `ServerMember`, `Infraction`, `Backup`, `AuditLog`, and `BdsVersion`.
   - *Logic*: Currently, `@mc-admin/db` only contains `src/schema.ts` (TypeScript interfaces) and an in-memory class `MemoryDatabase`. No `.prisma` schema file, Prisma CLI, or migration scripts exist. Transition to production readiness requires creating `packages/db/prisma/schema.prisma` and updating `@mc-admin/db` to export a PrismaClient instance.

2. **CGNAT-Safe Outbound Go Agent Gap**:
   - *Observation*: `ORIGINAL_REQUEST.md` (R2) mandates an outbound WebSocket tunneling Go agent binary (`apps/agent`) for home connections/VPS hosting that manages BDS container lifecycles, telemetry collection, RCON log streaming, and CGNAT firewall bypass.
   - *Logic*: Currently, `apps/agent` is a 18-line TypeScript file. No `.go` files exist anywhere in the monorepo. Creating a production-ready agent requires scaffolding a Go module in `apps/agent` (with `main.go`, `websocket` client, process lifecycle manager, RCON runner, and metric collector).

3. **Streaming Backup & Cloudflare R2 Gap**:
   - *Observation*: `ORIGINAL_REQUEST.md` (R3) mandates real-time world snapshot archiving with gzip/tar stream compression directly to Cloudflare R2 presigned URLs with save-hold live checkpoints and manifest validation.
   - *Logic*: Currently, `@mc-admin/backups` simulates snapshot file sizes using `Math.random()` and in-memory arrays. Implementing R3 requires adding streaming tar/gzip compression, Cloudflare R2 S3 SDK / presigned URL uploads, BDS save-hold RCON execution (`save-hold`, `save-query`, `save-resume`), and manifest verification.

4. **API Backend Framework & Protocol Gap**:
   - *Observation*: `apps/api` contains static helper functions in `ApiServer` without an HTTP server listener or WebSocket handler for agent tunnels.
   - *Logic*: To handle control plane communications, `apps/api` must host HTTP REST endpoints and a WebSocket server endpoint for Go agent node connections and live RCON/console streaming.

5. **UI Architecture & Component Isolation Gap**:
   - *Observation*: `apps/web` currently uses Next.js Pages Router with a single monolithic `index.tsx` file containing inline styles. `packages/ui` only exports style tokens (`UI_THEME`).
   - *Logic*: `AGENTS.md` mandates `apps/web` to use Next.js App Router and import shared UI components from `@mc-admin/ui`. Reusable components (buttons, modals, server cards, status badges) should be extracted into `@mc-admin/ui`.

---

## 3. Caveats

- **Existing Mock Test Suite**: The current test suite (`packages/e2e` with 41 tests) passes 100% against the in-memory `MemoryDatabase` and TypeScript stubs. Refactoring to Prisma ORM and real Go daemon interfaces must maintain test compatibility or update test mocks cleanly.
- **Phase Scope Compliance**: According to `AGENTS.md`, Phase 1 scope (Bedrock Dedicated Server control, Go agent, R2 streaming backups, player moderation, console onboarding) must be strictly enforced. Phase 2/3 features (Java support, White-labeling, Shield security module, AI agents) should not be implemented prematurely.

---

## 4. Conclusion

The repository has a solid, 100% passing TypeScript baseline scaffold with 12 packages and 5 apps, clean build outputs, and comprehensive E2E test coverage for in-memory operations.

However, **6 major architectural gaps** exist to fulfill the BedrockOps V6 requirements:
1. **Prisma ORM & PostgreSQL**: Absence of `schema.prisma` models and Prisma client integration in `@mc-admin/db`.
2. **Go Agent Daemon**: Total absence of Go source code (`.go`) and WebSocket tunneling in `apps/agent`.
3. **HostProvider Abstraction**: Lack of provider driver interface supporting Go daemon tunnel, Pterodactyl Panel, and direct RCON/SSH execution.
4. **Streaming Backup Engine**: Simulated backups need replacement with real gzip/tar R2 streaming, save-hold checkpoints, and integrity manifests.
5. **API & Tunnel Server**: `apps/api` needs an HTTP/WebSocket server implementation (e.g. Express/Fastify/Hono) handling client auth and agent tunnel connections.
6. **UI Component Library & App Router**: `apps/web` needs migration/refactoring to Next.js App Router and `@mc-admin/ui` reusable component exports.

---

## 5. Verification Method

To independently verify the current state of the codebase:

1. **Verify All Workspace Tests**:
   ```bash
   pnpm test
   ```
   *Expected Output*: 28 tasks successful, 41 E2E tests passing.

2. **Verify Monorepo Build**:
   ```bash
   pnpm build
   ```
   *Expected Output*: 17 tasks built successfully, 0 compilation errors.

3. **Verify Absence of Prisma and Go Files**:
   - Check `packages/db` for `.prisma` files (0 found).
   - Check `apps/agent` for `.go` files (0 found).

4. **Verify App / Package Directory Layout Compliance**:
   - Inspect `apps/` (`web`, `api`, `agent`, `worker`, `discord`).
   - Inspect `packages/` (`db`, `config`, `auth`, `bedrock`, `audit`, `backups`, `moderation`, `notifications`, `templates`, `pipelines`, `ui`, `e2e`).
