# Architecture & Monorepo Survey Handoff Report

## 1. Observation

### 1.1 Repository Directory Structure
The monorepo at `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin` is structured using `pnpm` workspaces (configured in `pnpm-workspace.yaml`) and Turborepo. It comprises 5 applications under `apps/` and 11 workspace packages under `packages/`.

```
.
├── .agents/
│   ├── ORIGINAL_REQUEST.md
│   └── explorer_survey_1/
│       ├── BRIEFING.md
│       ├── DISPATCH.md
│       ├── progress.md
│       └── handoff.md
├── AGENTS.md
├── PROJECT_PLAN.md
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── apps/
│   ├── agent/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── discord/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   ├── web/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── pages/
│   │           └── index.tsx
│   └── worker/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
└── packages/
    ├── audit/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── index.test.ts
    ├── auth/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       └── index.ts
    ├── backups/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── index.test.ts
    ├── bedrock/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       └── index.ts
    ├── config/
    │   ├── package.json
    │   └── tsconfig.base.json
    ├── db/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── schema.ts
    ├── moderation/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── index.test.ts
    ├── notifications/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── index.test.ts
    ├── pipelines/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       └── index.test.ts
    ├── templates/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       └── index.ts
    └── ui/
        ├── package.json
        ├── tsconfig.json
        └── src/
            └── index.ts
```

### 1.2 Workspace Applications Summary (`apps/`)

| App Name | Package Name | Purpose & Primary Responsibilities | Dependencies | Scripts |
|---|---|---|---|---|
| `apps/agent` | `@mc-admin/agent` | Local Machine Daemon: BDS process management & file controller | `@mc-admin/config`, `@mc-admin/bedrock` | `build`, `dev` |
| `apps/api` | `@mc-admin/api` | REST & WebSocket Backend Server | All 10 domain packages | `build`, `dev`, `test` |
| `apps/discord` | `@mc-admin/discord` | Discord Bot & Webhook Alert Handler | `@mc-admin/config`, `@mc-admin/notifications` | `build`, `dev` |
| `apps/web` | `@mc-admin/web` | Next.js Operations Dashboard UI | `@mc-admin/config`, `@mc-admin/ui`, `next`, `react`, `lucide-react` | `dev`, `build`, `start`, `lint` |
| `apps/worker` | `@mc-admin/worker` | Async Background Job Processor (Backups & Pipelines) | `@mc-admin/config`, `@mc-admin/db`, `@mc-admin/backups`, `@mc-admin/pipelines` | `build`, `dev` |

### 1.3 Workspace Packages Summary (`packages/`)

| Package Name | Folder Path | Key Exported Capabilities | Test Suite |
|---|---|---|---|
| `@mc-admin/audit` | `packages/audit` | `AuditLogger.record()`, `getLogsForEntity()`, `getAllLogs()` | `index.test.ts` (2 unit tests) |
| `@mc-admin/auth` | `packages/auth` | `hasPermission()`, `generateDevSession()`, RBAC role definitions | None |
| `@mc-admin/backups` | `packages/backups` | `BackupEngine.triggerBackup()`, `restoreBackup()`, `applyRetentionPolicy()` | `index.test.ts` (3 unit tests) |
| `@mc-admin/bedrock` | `packages/bedrock` | `BedrockServerController.parseProperties()`, `serializeProperties()`, `executeRconCommand()` (stub) | None |
| `@mc-admin/config` | `packages/config` | Base `tsconfig.base.json` shared configuration | None |
| `@mc-admin/db` | `packages/db` | `MemoryDatabase`, `db` singleton, TypeScript schema interfaces (`BedrockServer`, `BackupRecord`, etc.) | None |
| `@mc-admin/moderation` | `packages/moderation` | `ModerationService.createAction()`, `getHistoryForPlayer()`, `searchPlayers()` | `index.test.ts` (2 unit tests) |
| `@mc-admin/notifications` | `packages/notifications` | `NotificationDispatcher.formatServerStatusEmbed()`, `formatBackupEmbed()`, `sendWebhook()` | `index.test.ts` (2 unit tests) |
| `@mc-admin/pipelines` | `packages/pipelines` | `PipelineEngine.runServerSetupPipeline()` multi-step workflow engine | `index.test.ts` (1 unit test) |
| `@mc-admin/templates` | `packages/templates` | `TemplateEngine.createTemplate()`, `applyTemplateToServer()` | None |
| `@mc-admin/ui` | `packages/ui` | `UI_THEME` styling constants, `getStatusBadgeStyle()` helper | None |

Total Unit Tests: **10 domain unit tests** across 5 test files (`audit`, `backups`, `moderation`, `notifications`, `pipelines`).

### 1.4 Infrastructure & Tooling Configurations
- **`pnpm-workspace.yaml`**: Standard 2-glob workspace setup (`"apps/*"`, `"packages/*"`).
- **`package.json`**: Root scripts map `build`, `dev`, `lint`, `test`, `clean` to `turbo <command>`. `packageManager` is set to `pnpm@9.0.0`.
- **`turbo.json`**: Configured with `"pipeline"` root key (legacy Turborepo v1 syntax).
- **`docker-compose.yml`**: Provisions PostgreSQL 16 Alpine (`mc_admin_postgres` on port 5432) and Redis 7 Alpine (`mc_admin_redis` on port 6379).

---

## 2. Logic Chain

1. **Workspace Boundary Mapping**:
   - Examining `pnpm-workspace.yaml` confirms that all packages are partitioned into `apps/` and `packages/`.
   - Inspecting individual `package.json` files reveals explicit cross-package dependency declarations using `workspace:*`.

2. **Package Hierarchy & Isolation**:
   - `@mc-admin/db` and `@mc-admin/config` sit at the base of the dependency graph without importing other domain packages.
   - Domain packages (`@mc-admin/audit`, `@mc-admin/backups`, `@mc-admin/moderation`, `@mc-admin/notifications`, `@mc-admin/templates`) consume `@mc-admin/db` and `@mc-admin/config`.
   - `@mc-admin/pipelines` sits at a higher layer, orchestrating `@mc-admin/audit`, `@mc-admin/notifications`, `@mc-admin/backups`, and `@mc-admin/templates`.
   - Applications (`apps/api`, `apps/worker`, `apps/agent`, `apps/discord`, `apps/web`) consume workspace packages according to their specialized runtime role.

3. **Build & Test Diagnostic Findings**:
   - Running `pnpm test` failed with:
     - `x Found pipeline field instead of tasks` in `turbo.json`: Turborepo v2.0+ deprecated `pipeline` in favor of `tasks`.
     - `Lockfile not found at ... pnpm-lock.yaml` and missing local `node_modules`.
   - Running `pnpm --filter @mc-admin/backups test` failed because `vitest` binary is not in `node_modules` prior to running `pnpm install`.

---

## 3. Caveats

- **Read-Only Scope**: Per instructions, no code or configuration changes (e.g., updating `turbo.json` or running `pnpm install`) were performed during this survey.
- **ORM / Database Status**: `@mc-admin/db` currently uses an in-memory database mock (`MemoryDatabase`). `docker-compose.yml` defines Postgres 16, but Prisma/Drizzle ORM schema migration files are not yet generated in `packages/db`.
- **Next.js Router Architecture**: `AGENTS.md` references App Router for `apps/web`, whereas `apps/web/src/pages/index.tsx` currently uses Next.js Pages Router.

---

## 4. Conclusion

The repository is structured as a Bedrock-first Minecraft server operations monorepo powered by `pnpm` workspaces and Turborepo. Workspace boundaries strictly isolate 5 applications (`agent`, `api`, `discord`, `web`, `worker`) and 11 domain/utility packages (`audit`, `auth`, `backups`, `bedrock`, `config`, `db`, `moderation`, `notifications`, `pipelines`, `templates`, `ui`).

Key items for upcoming implementation phases:
1. Fix `turbo.json` by renaming `"pipeline"` to `"tasks"` for Turborepo v2 compatibility.
2. Run `pnpm install` to generate `pnpm-lock.yaml` and install `vitest` / package dependencies.
3. Replace the in-memory database in `@mc-admin/db` with Prisma/Drizzle ORM for PostgreSQL.

---

## 5. Verification Method

To verify the structure and findings documented in this report:

1. **Verify Workspace Configuration**:
   Inspect `pnpm-workspace.yaml`:
   ```bash
   cat pnpm-workspace.yaml
   ```
2. **Verify Workspace Packages & Apps**:
   Inspect `package.json` files in `apps/*/package.json` and `packages/*/package.json`.
3. **Verify Tests**:
   Run `pnpm install` followed by `pnpm test` (after updating `turbo.json` `pipeline` key to `tasks`).
