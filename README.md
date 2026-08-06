# BedrockOps

Realms-first Bedrock Dedicated Server operations platform — lifecycle control, Cloudflare R2 backups, console onboarding, moderation, Discord, templates, and (later) add-on marketplace tooling in one monorepo.

## Overview

BedrockOps (internal package scope: `@mc-admin/*`) is a pnpm + Turborepo monorepo for running self-hosted Bedrock **Realms** (community BDS servers). The dashboard, API, worker, machine agent, and Discord relay share domain packages for auth, audit, backups, moderation, and more.

**Positioning:** software/control-plane first (self-sufficient). Hosting partners are optional later — not required to ship. Official Mojang Realms APIs are out of scope.

**Current status:** Wave A foundation on `main` — domain packages and a working dashboard prototype. Runtime persistence defaults to in-memory DB for local development; Prisma/Postgres schema is ready for production wiring. See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for Wave A–D delivery.

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
| Agent daemon (TS shim) | http://localhost:5050 |

### Go agent (CGNAT-safe outbound tunnel)

Production process control lives in the Go binary under `apps/agent/cmd/bedrock-agent`. It dials the control plane WebSocket at `/api/v1/ws/agent` (outbound-only, CGNAT-friendly), handles power actions, heartbeats, metrics, and backup triggers.

```bash
# Build
pnpm --filter @mc-admin/agent agent:build

# Run against local API (simulated lifecycle when -bds-bin is omitted)
./apps/agent/bin/bedrock-agent \
  -control-plane http://127.0.0.1:4000 \
  -node-id node_docker_agent_1
```

Set `-bds-bin /path/to/bedrock_server` for live process management.

### Streaming backups (Cloudflare R2)

Manual backups (`POST /api/v1/backups`) run the save-hold command plan, ask the connected agent to stream a `tar.gz` archive, and optionally PUT to an R2 presigned URL when these env vars are set:

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`

Without R2 credentials the control plane returns an honest presign stub; the agent still archives locally when a world directory exists.

### Security notes (local prototype)

- Agent WebSocket requires a bearer token matching `AgentNode.secretTokenHash` (seeded token: `dev_agent_token_change_me`).
- Production refuses weak `JWT_SECRET` / `NODE_PAIRING_SECRET`, `CORS_ORIGIN=*`, and MemoryDatabase unless `ALLOW_MEMORY_DB=true`.
- Host providers that are not wired (Pterodactyl / Direct RCON) return `false` / `[STUB]` — they never pretend power actions succeeded.
- Dashboard auto-login is opt-in via `NEXT_PUBLIC_DEV_AUTO_LOGIN=true`.

## Environment variables

Copy `.env.example` to `.env` at the repo root. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | Web / shared port hint | `3000` |
| `DATABASE_URL` | Postgres connection string | see `.env.example` |
| `JWT_SECRET` | API JWT signing secret | change in production |
| `NODE_PAIRING_SECRET` | Agent bootstrap pairing secret | change in production |
| `CORS_ORIGIN` | Allowed browser origin(s) | `http://localhost:3000` |
| `BEDROCK_AGENT_TOKEN` | Agent tunnel bearer token | see `.env.example` |
| `NEXT_PUBLIC_DEV_AUTO_LOGIN` | Web silent admin login (dev only) | unset / `true` in example |
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

Read `AGENTS.md` before contributing — it defines package boundaries and Wave A scope.

## Roadmap

| Wave | Focus | Status on `main` |
|------|-------|------------------|
| **A** | Real agent tunnel, RCON, Prisma, R2 backup/restore | Prototype / stubs — in-flight branches |
| **B** | Console/FriendConnect adapters, moderation, Discord, onboarding | Planned |
| **C** | Live console, security rules, analytics, version pins | Planned |
| **D** | Packs/marketplace, optional host partners, rounds (later) | Planned |

Details: [PROJECT_PLAN.md](./PROJECT_PLAN.md)

## Testing

```bash
pnpm test
pnpm --filter @mc-admin/backups test
pnpm --filter @mc-admin/e2e test
```

## License

Private — all rights reserved unless otherwise specified.
