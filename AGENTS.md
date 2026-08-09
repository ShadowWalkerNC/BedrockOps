# AGENTS.md - Repository Rules, Standards, and Directory Boundaries

## Core Mission
This monorepo houses a Bedrock-first Minecraft server operations platform. All code additions must prioritize maintainability, clean package boundaries, safety, and local development experience.

---

## Directory Boundaries & Responsibilities

### `apps/`
- **`apps/web`**: Next.js (App Router) admin dashboard UI. Responsibilities: UI rendering, user interaction, form input, state display. Dependencies should import from `@mc-admin/ui`, `@mc-admin/auth`, and API contracts.
- **`apps/api`**: REST/WebSocket backend server. Responsibilities: Request authentication/authorization, database operations via `@mc-admin/db`, domain package invocation, audit logging dispatch.
- **`apps/worker`**: Async task processor. Responsibilities: Scheduled backups, background pipeline execution, retention policy sweeps.
- **`apps/agent`**: Machine daemon. Responsibilities: Direct filesystem and process management for Bedrock Dedicated Server instances on host machine.
- **`apps/discord`**: Discord integration. Responsibilities: Discord bot commands, webhook message formatting, staff notification delivery.

### `packages/`
- **`packages/db`**: Database schema (Prisma/Drizzle), migrations, client exports. **No UI or application code.**
- **`packages/ui`**: Shared React UI components and design system. **No direct DB calls.**
- **`packages/config`**: Shared build configs (TSConfig, ESLint, Tailwind presets).
- **`packages/auth`**: Shared authentication, JWT handling, role/permission logic.
- **`packages/audit`**: Audit trail formatters, action types, event schemas.
- **`packages/bedrock`**: BDS configuration parsers (`server.properties`), process management primitives, RCON protocol client.
- **`packages/backups`**: Backup snapshot engine, file archiving, retention calculations, restore validation.
- **`packages/moderation`**: Player search filters, moderation record schemas (warn/mute/kick/ban/note).
- **`packages/notifications`**: Discord payload generators and alert formatters.
- **`packages/templates`**: Server template manifests and file synthesis engine.
- **`packages/pipelines`**: Step-by-step pipeline execution workflows and execution context.

---

## Coding Standards & Rules

1. **TypeScript Everywhere**: All code must be strictly typed. Avoid `any`; use clean `interface` or `type` declarations.
2. **Package Isolation**: Packages under `packages/` must not cross-import horizontally unless strictly hierarchical or explicit (e.g. `pipelines` using `templates` and `db`).
3. **No Fake Stubs**: Never pretend a Bedrock process control or backup action succeeded when it didn't. Write explicit stubs with `TODO:` markers when an integration is pending.
4. **Environment Variables**: Always validate env variables on application startup using `zod` or equivalent validation schemas in `@mc-admin/config`.
5. **Audit Everything**: Any state-changing operational action (server start/stop, backup trigger, restore, moderation action, template apply, pipeline run) MUST emit a structured audit log event.
6. **UI Design Standard**: Admin-first aesthetics. Clean hierarchy, low visual noise, explicit confirmation modals for dangerous actions (server stops, restores, bans), role-aware controls, dark mode support.

---

## Testing Commands & Workflows

- **Run all tests**: `pnpm test`
- **Run package-specific tests**: `pnpm --filter @mc-admin/backups test`
- **Lint all workspaces**: `pnpm lint`
- **Build all packages & apps**: `pnpm build`
- **Database migrations**: `pnpm --filter @mc-admin/db db:migrate`

---

## Change Management & Staged Execution
- Respect delivery waves in `PROJECT_PLAN.md` (Wave A → B → C → D).
- **Wave A scope is strictly enforced** for foundation work: agent tunnel, real RCON, Prisma wiring, Cloudflare R2 backup/restore, and security hardening.
- Do **not** auto-implement later-wave items during Wave A tasks: host partner APIs, marketplace, referrals, official Mojang Realms, Java/Geyser primary path, round-based modes, white-label Shield SKU, or AI agents.
- Prefer the single host path `DOCKER_AGENT` until Wave A ship gate passes; other `HostProvider` types must fail honestly when unwired.

---

## Cursor Cloud specific instructions

The startup update script already runs `pnpm install` and `pnpm --filter @mc-admin/db db:generate`, so dependencies and the Prisma client are ready when a session begins. Do not re-run install steps unless something is broken.

### Services & how to run them
- **Production-shaped local play:** `./scripts/start-local.sh` (Postgres + Prisma + API:4000 + web:3000 + Go agent + worker). Login at `/login` with seed `admin@minecraft-admin.local` / `admin`.
- **Core end-to-end = `apps/api` (port 4000) + `apps/web` (port 3000).** Standard commands live in `README.md` / `package.json`; run the whole stack with `pnpm dev`, or start just the core with `pnpm --filter @mc-admin/api dev` and `pnpm --filter @mc-admin/web dev`.
- The web dashboard proxies `/api/v1/*` to `API_URL` (default `http://localhost:4000`), so start the API before (or alongside) the web app.
- Optional services (`worker`, `discord`, and the Go `agent`) are not needed to exercise the dashboard's core flow.

### Non-obvious gotchas
- **No database service is required for local dev.** `DB_ADAPTER` defaults to an in-memory, pre-seeded store (seeded admin user, one Bedrock server, one agent node). Postgres/Redis in `docker-compose.yml` are only needed when you explicitly set `DB_ADAPTER=prisma`.
- **`prisma generate` is mandatory before test/build/run.** `@mc-admin/db` instantiates `PrismaClient` at import time, so `api`, `worker`, and `e2e` fail to load if the client is missing. If you ever hit "@prisma/client did not initialize", run `pnpm --filter @mc-admin/db db:generate`.
- **Root `.env` has `PORT=3000` (web).** Always start the API with an explicit override: `PORT=4000 pnpm --filter @mc-admin/api dev`. If the API inherits `PORT=3000` it collides with the dashboard.
- **Web dev auto-login is env-gated and `next dev` does NOT read the repo-root `.env`.** The dashboard silently logs in only when `NEXT_PUBLIC_DEV_AUTO_LOGIN=true` is in the web app's environment — pass it inline (e.g. `NEXT_PUBLIC_DEV_AUTO_LOGIN=true pnpm --filter @mc-admin/web dev`) or put it in `apps/web/.env.local`. Without it the dashboard throws "Not authenticated". The dev-only login is `admin@minecraft-admin.local` / `admin`.
- **API health check is `GET /health`** (not under `/api/v1`). All domain routes are under `/api/v1/*` and require a JWT.
- **Go 1.22+ is required** for the agent: `pnpm build` runs `go build` and `pnpm test` runs `go test ./...` in `apps/agent`.
- **Honest stubs are expected in dev.** With no Go agent connected, power actions return `503` + `[STUB]` and backups stay `PENDING`. This is intended behavior, not a bug. Optional live adapters (R2, Discord, Cloudflare DNS, OpenXBL) also stub honestly when their secrets are unset — local E2E does not require them.
- **Lint coverage is uneven.** Root `pnpm lint` currently exercises packages that define a `lint` script (primarily `@mc-admin/web`); use `pnpm typecheck` / `pnpm test` for monorepo-wide correctness.
