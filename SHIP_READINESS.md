# BedrockOps — Ship Readiness

Status of the platform against `PROJECT_PLAN.md`, what is required to run it in
production, and what is intentionally deferred as later add-ons.

## Shippable scope (deploy this)

| Wave | Capability | Status |
|------|------------|--------|
| A | Control plane (REST + JWT/RBAC), Prisma persistence, Go agent WSS tunnel, real RCON, R2 streaming backup + restore | ✅ Shipped |
| A | Dashboard power actions reach a live agent (honest stubs when offline) | ✅ Shipped |
| B | Player join tracking, GDPR moderation ledger, `allowlist.json` atomic sync | ✅ Shipped |
| B | Subdomain + UDP port allocation, console onboarding adapters, setup pipelines | ✅ Shipped |
| B | Discord webhook delivery + alerts for bans/backups/crashes | ✅ Shipped |
| C | Live console / interactive RCON streaming | ✅ Shipped |
| C | Analytics + destructive-action rate limiting + join-flood detection | ✅ Shipped |
| C | BDS version matrix, crash → Discord alert, Settings/Worlds surfaces | ✅ Shipped |
| D1–D4 | Pack engine, mode templates + packs, cosmetics (world RP), Script API matrix, marketplace, level.dat experiments | ✅ Shipped |
| D5 | Partner host **readiness** (env, Settings, realm hostProvider) — panel/SSH lifecycle still stubbed | ✅ Readiness shipped |
| — | Worker scheduled backup + retention | ✅ Shipped |
| B5 | Discord slash commands | ✅ Scaffolded — needs Discord bot env |
| B4 / R5.1 | Xbox resolve / Cloudflare DNS | ✅ Wired — needs API keys (honest stub without) |

## Later add-ons (not required to deploy)

- Live Pterodactyl panel power / files / console HTTP
- Direct SSH process lifecycle / SFTP world writes (RCON path already works)
- Seasonal / round-based modes (D6)
- Mojang Marketplace federation
- Xbox Persona force-apply
- Player Discord ↔ in-game chat relay

## Required production configuration

See [DEPLOY.md](./DEPLOY.md) and `.env.example`.

- `NODE_ENV=production`
- `JWT_SECRET`, `NODE_PAIRING_SECRET` — strong unique secrets (min 32 chars)
- `DATABASE_URL` + `DB_ADAPTER=prisma` — run `pnpm --filter @mc-admin/db db:migrate`
- `CORS_ORIGIN` — dashboard origin (never `*`)
- `API_URL` + `NEXT_PUBLIC_API_URL` — absolute API URL (REST rewrite + browser WebSockets)
- Agent pairing token — rotate off the seeded `dev_agent_token_change_me`
- Optional: `R2_*`, Discord, Cloudflare DNS, Xbox/OpenXBL

## Pre-ship checklist

- [x] `pnpm install && pnpm --filter @mc-admin/db db:generate`
- [x] `pnpm build && pnpm test` (CI)
- [x] Production start scripts (`pnpm start:api` / `start:web` / `start:worker`, `./scripts/start-prod.sh`)
- [x] Deploy runbook ([DEPLOY.md](./DEPLOY.md))
- [x] Local production-shaped path: `./scripts/start-local.sh`
- [ ] Provision production secrets; set `NEXT_PUBLIC_API_URL` to the public API
- [ ] Put TLS + WebSocket-capable reverse proxy in front of web + API
- [ ] Rotate seed admin password (`admin@minecraft-admin.local` / `admin`)
- [ ] Pair at least one Go agent to a real BDS host and verify power + backup + restore
- [ ] Confirm Discord webhook receives a test alert (if used)
- [ ] Restrict `CORS_ORIGIN`; keep `NEXT_PUBLIC_DEV_AUTO_LOGIN=false`

### Local production-shaped play

```bash
docker compose up -d postgres
./scripts/start-local.sh
# open http://localhost:3000/login
# admin@minecraft-admin.local / admin
```

### Staging / VPS

```bash
cp .env.example .env   # edit secrets
docker compose up -d postgres
./scripts/start-prod.sh
# pair agent on the game host — see DEPLOY.md
```

Without R2/Discord/DNS/Xbox secrets, those adapters remain honest stubs (expected).
