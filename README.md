# BedrockOps

**The operating system for Bedrock Realms.**

BedrockOps is a Realms-first control plane for Minecraft Bedrock Dedicated Servers — start/stop, live console, offsite backups, moderation, Discord alerts, console onboarding, and version-aware ops in one stack.

> **This is my SaaS.** The product, brand, and hosted BedrockOps service are mine.
>
> **This repo is free to fork.** Clone it, self-host it, hack on it, send PRs. You’re welcome to run your own control plane. You’re not getting commodity RAM hosting — you’re getting (or forking) the software that makes community Realms actually operable.

---

## Why it exists

Most Bedrock “hosts” compete on specs and price. Operators still drown in FTP panels, brittle backups, opaque crashes, and staff tools that feel bolted on.

BedrockOps competes on **software**:

| Hosts sell | BedrockOps sells |
|------------|------------------|
| CPU / RAM / disk | Lifecycle, safety, and staff workflows |
| A panel for one box | A Realms admin OS across your fleet |
| “Hope the world saved” | Streaming backups, audit trails, honest failure modes |

**Positioning:** Realms-first (self-hosted BDS). Own the agent, Postgres, R2 backups, and join adapters. Hosting partners are optional later — never a prerequisite to ship. Official Mojang Realms APIs are out of scope.

---

## What’s in the box

- **Ops Room dashboard** — power actions, live console, player profiles, setup wizard
- **CGNAT-safe Go agent** — outbound WebSocket tunnel; no inbound ports required on the game host
- **Streaming backups** — save-hold → agent archive → optional Cloudflare R2
- **Moderation ledger** — warn / mute / kick / ban / note with GDPR anonymize + allowlist sync
- **Console onboarding** — subdomain/port allocation, FriendConnect-style adapters, Xbox resolve (when keyed)
- **Discord alerts** — bans, backups, crashes (webhook; slash commands scaffolded)
- **Version matrix** — pin BDS builds, mismatch warnings, backup-before-update
- **Honest stubs** — if the agent, R2, or Discord isn’t wired, the API says so instead of lying

Shippable Waves **A–C** are on `main`. Wave **D** (packs, marketplace, host partners, rounds) is planned next. Details: [SHIP_READINESS.md](./SHIP_READINESS.md) · [PROJECT_PLAN.md](./PROJECT_PLAN.md)

---

## SaaS vs fork

| | Hosted BedrockOps (SaaS) | This repo (fork / self-host) |
|--|--------------------------|------------------------------|
| Who runs the control plane | Me | You |
| Brand / product | BedrockOps | Your fork — please don’t pretend to *be* BedrockOps Cloud |
| Game servers | Your Realms, managed through the product | Your metal / VPS + the Go agent |
| Cost model | SaaS | Your infra + your time |
| Contributions | Welcome via PR | Same |

Fork freely. If you build something useful, open a pull request. If you want the managed product, that’s the SaaS — not something this README pretends to bill you for in git.

---

## Quick start (local)

```bash
pnpm install
cp .env.example .env
./scripts/start-local.sh
# → http://localhost:3000/login
#    admin@minecraft-admin.local / admin
```

Windows: `powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1`  
(Always run the API with `PORT=4000` — root `.env` uses `PORT=3000` for the web app.)

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000/login |
| API | http://localhost:4000/health |

### Manual path

```bash
pnpm install && cp .env.example .env
docker compose up -d postgres
pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate
# Terminal A
PORT=4000 DB_ADAPTER=prisma pnpm --filter @mc-admin/api dev
# Terminal B
NEXT_PUBLIC_DEV_AUTO_LOGIN=false API_URL=http://localhost:4000 pnpm --filter @mc-admin/web dev
# Terminal C (optional agent — simulated BDS if -bds-bin omitted)
pnpm --filter @mc-admin/agent agent:build
./apps/agent/bin/bedrock-agent \
  -control-plane http://127.0.0.1:4000 \
  -node-id node_docker_agent_1 \
  -token dev_agent_token_change_me
```

### Prerequisites

- Node.js 18+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9.0.0 --activate`)
- Go 1.22+ (agent build/tests)
- Docker (Postgres via `docker compose`)

---

## Repository layout

```
apps/
  web/       Next.js operator dashboard
  api/       REST + WebSocket control plane (:4000)
  worker/    Scheduled backups & retention
  agent/     Go machine daemon (BDS process, RCON, files)
  discord/   Webhooks / slash-command relay
packages/    Domain libs — db, auth, audit, bedrock, backups,
             moderation, notifications, templates, pipelines, ui
```

Internal package scope: `@mc-admin/*`. Coding boundaries: [AGENTS.md](./AGENTS.md).

---

## Useful commands

```bash
pnpm dev          # all workspace apps
pnpm build        # build everything
pnpm test         # Vitest (+ Go tests in apps/agent)
pnpm typecheck    # full-repo TypeScript (includes tests)
pnpm lint         # lint (primarily web today)

pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate
pnpm --filter @mc-admin/web clean     # wipe stale .next (Windows/OneDrive-friendly)
```

---

## Configuration notes

Copy `.env.example` → `.env`. Important knobs:

| Variable | Notes |
|----------|--------|
| `DB_ADAPTER=prisma` | Production-shaped local / real deploys (needs Postgres) |
| `JWT_SECRET` / `NODE_PAIRING_SECRET` | Strong secrets in production (min 32 chars) |
| `CORS_ORIGIN` | Dashboard origin — never `*` in production |
| `BEDROCK_AGENT_TOKEN` | Must match hashed token on the `AgentNode` |
| `R2_*` | Optional offsite backups; honest stub without them |
| `DISCORD_WEBHOOK_URL` | Optional live alerts |
| `NEXT_PUBLIC_DEV_AUTO_LOGIN` | Dev-only silent login — keep `false` for prod-shaped play |

Full validation: `packages/config` + `apps/api/src/config.ts`. Production checklist: [SHIP_READINESS.md](./SHIP_READINESS.md).

**Honest stubs by design.** Missing agent / R2 / Discord / DNS / Xbox keys never fake success — they return explicit stub or pending states.

---

## Roadmap

| Wave | Focus | Status |
|------|-------|--------|
| **A** | Agent tunnel, RCON, Prisma, R2 backup/restore, security hardening | Done on `main` |
| **B** | Moderation, allowlist, subdomain onboarding, Discord | Done on `main` |
| **C** | Live console, analytics, rate limits, versions, crash alerts, Settings/Worlds/Plugins UI | Done on `main` |
| **D** | Pack engine, marketplace, host partners, seasonal rounds | Next |

---

## Contributing

1. Read [AGENTS.md](./AGENTS.md) (package boundaries, no fake stubs, audit everything).
2. Prefer small PRs against `main`.
3. Keep Wave D features honest — don’t pretend pack install or partner hosts work until wired.

---

## License & trademark

**Free to fork** for self-hosting, learning, and contribution.

The **BedrockOps** name and hosted SaaS offering remain mine. Don’t present a public fork as the official BedrockOps cloud product.

If you need a formal SPDX license file for corporate compliance, open an issue and we’ll pin one — until then: fork freely, attribute reasonably, don’t impersonate the SaaS.
