# BedrockOps

Bedrock-first Minecraft server operations platform — server control, backups, moderation, Discord alerts, templates, and setup pipelines in one monorepo.

## Overview

BedrockOps (internal package scope: `@mc-admin/*`) is a pnpm + Turborepo monorepo for managing Bedrock Dedicated Server (BDS) communities. The dashboard, API, worker, machine agent, and Discord relay share domain packages for auth, audit, backups, moderation, and more.

**Current status:** Phase 1 foundation — domain packages and a working dashboard prototype. Runtime persistence uses an in-memory database for local development; Prisma/Postgres schema is in place for production wiring (see [Roadmap](#roadmap)).

## Repository structure

```
.
├── apps/
│   ├── web/       # Next.js admin dashboard
│   ├── api/       # Express REST + WebSocket control plane (port 4000)
│   ├── worker/    # Scheduled backups and background jobs
│   ├── agent/     # Bedrock machine daemon (process/filesystem control)
│   └── discord/   # Discord webhook / bot relay
├── packages/
│   ├── db/        # Prisma schema + development memory store
│   ├── config/    # Zod environment validation
│   ├── auth/      # JWT + RBAC
│   ├── audit/     # Structured audit logging
│   ├── bedrock/   # BDS config parser, host providers, RCON
│   ├── backups/   # Backup snapshots and retention
│   ├── moderation/# Player moderation records
│   ├── notifications/ # Discord payload formatters
│   ├── templates/ # Server template engine
│   ├── pipelines/ # Setup pipeline orchestrator
│   └── ui/        # Shared React UI tokens and components
├── docker-compose.yml   # Postgres 16 + Redis 7
├── PROJECT_PLAN.md      # Product roadmap and phases
└── AGENTS.md            # Coding standards and package boundaries
```

## Prerequisites

- **Node.js** 18+
- **pnpm** 9 (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- **Docker** (optional, for Postgres/Redis via `docker compose`)

## Quick start

```bash
# Install dependencies
pnpm install

# Copy environment template and adjust as needed
cp .env.example .env

# Start Postgres + Redis (optional for future Prisma wiring)
docker compose up -d

# Generate Prisma client
pnpm --filter @mc-admin/db db:generate

# Run all apps in development (via Turborepo)
pnpm dev
```

### Default dev URLs

| Service | URL |
|---------|-----|
| Web dashboard | http://localhost:3000 |
| API control plane | http://localhost:4000 |
| Agent daemon | http://localhost:5050 |

## Environment variables

Copy `.env.example` to `.env` at the repo root. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | Web / shared port hint | `3000` |
| `DATABASE_URL` | Postgres connection string | see `.env.example` |
| `JWT_SECRET` | API JWT signing secret | change in production |
| `DISCORD_WEBHOOK_URL` | Optional Discord alerts | — |
| `RCON_HOST` / `RCON_PORT` / `RCON_PASSWORD` | Bedrock RCON | local defaults |

See `packages/config/src/env.ts` and `apps/api/src/config.ts` for full validation schemas.

## Scripts

```bash
pnpm dev          # Start all workspace dev servers
pnpm build        # Build all packages and apps
pnpm test         # Run Vitest across workspaces
pnpm lint         # Lint all workspaces
pnpm clean        # Turbo clean

# Database (Prisma)
pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:push
pnpm --filter @mc-admin/db db:validate
```

## Architecture notes

- **Domain packages** hold business logic; apps orchestrate I/O and HTTP.
- **Audit logging** is required for state-changing operations (server control, backups, moderation, templates, pipelines).
- **Development DB:** `packages/db` exports a seeded `MemoryDatabase` singleton (`DB_ADAPTER=memory`). Set `DB_ADAPTER=prisma` when wiring Postgres persistence.
- **Web → API:** The dashboard proxies `/api/v1/*` to `apps/api` (port 4000). Web no longer imports `@mc-admin/db` or domain engines directly.
- **Honest stubs:** Backups start as `PENDING`, agent/power actions return explicit stub responses until host integration is wired.

Read `AGENTS.md` before contributing — it defines package boundaries and Phase 1 scope.

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **1** | Monorepo, domain packages, dashboard vertical slice | Prototype complete |
| **2** | Onboarding wizard, Discord workflows, referrals, moderation UI | In progress |
| **3** | Live console/RCON, analytics, security rules | Planned |
| **4** | Host partner integrations, creator templates | Planned |

Details: [PROJECT_PLAN.md](./PROJECT_PLAN.md)

## Testing

```bash
pnpm test
pnpm --filter @mc-admin/backups test
pnpm --filter @mc-admin/e2e test
```

## License

Private — all rights reserved unless otherwise specified.
