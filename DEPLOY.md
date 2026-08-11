# BedrockOps — Deploy guide

Self-host the **shippable core** (Waves A–C + content D1–D4 + partner readiness D5).
Later add-ons (live Pterodactyl HTTP, seasonal rounds, Mojang store federation) are optional and not required to operate.

## What you are deploying

| Process | Role | Default port |
|---------|------|--------------|
| `apps/web` | Operator dashboard (Next.js) | 3000 |
| `apps/api` | REST + agent/client WebSockets | 4000 |
| `apps/worker` | Scheduled backups / retention | (no listen) |
| `apps/agent` | Outbound WSS daemon on the **game host** | (outbound only) |
| Postgres 16 | Prisma persistence | 5432 |

Primary host path: **`DOCKER_AGENT`**. Partner providers may be assigned in Settings but stay honest stubs until their panel/SSH APIs are wired later.

## Prerequisites

- Node.js 18+ and pnpm 9
- Go 1.22+ (to build the agent)
- Docker (for local Postgres) or any Postgres 16+ reachable via `DATABASE_URL`
- A Linux host (or WSL) that can run Bedrock Dedicated Server for the agent

## 1. Configure environment

```bash
cp .env.example .env
```

**Required for a real deploy**

| Variable | Notes |
|----------|--------|
| `NODE_ENV=production` | Enables secret strength checks |
| `JWT_SECRET` | ≥ 32 chars, unique |
| `NODE_PAIRING_SECRET` | ≥ 32 chars, unique |
| `DATABASE_URL` | Postgres connection string |
| `DB_ADAPTER=prisma` | Memory DB is not for production |
| `CORS_ORIGIN` | Exact dashboard origin (never `*`) |
| `API_URL` | Absolute API URL used by Next rewrites (server-side) |
| `NEXT_PUBLIC_API_URL` | Absolute API URL for **browser WebSockets** (live console) |
| `BEDROCK_AGENT_TOKEN` | Must match the hashed token on the paired `AgentNode` |

**Optional (honest stubs when unset):** `R2_*`, `DISCORD_*`, `CLOUDFLARE_*`, `XBOX_*` / `OPENXBL_*`, `PTERODACTYL_*`, `DIRECT_SSH_*`.

## 2. Database

```bash
docker compose up -d postgres   # or use managed Postgres
pnpm install
pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate
```

## 3. Build & start control plane

**Option A — Docker control plane (recommended on a VPS)**

```bash
# Postgres + API + web + worker. Agent still runs on the game host.
docker compose --profile apps up -d --build
```

- Dashboard: http://localhost:3000/login  
- API health: http://localhost:4000/health  

Set `CORS_ORIGIN`, `JWT_SECRET`, `NODE_PAIRING_SECRET`, and `NEXT_PUBLIC_API_URL` in `.env` before build so the web image bakes the correct browser WebSocket origin.

**Option B — helper script (Node on the host)**

```bash
./scripts/start-prod.sh
```

**Option C — manual Node processes**

```bash
pnpm build
pnpm --filter @mc-admin/agent agent:build

PORT=4000 DB_ADAPTER=prisma NODE_ENV=production pnpm start:api
DB_ADAPTER=prisma NODE_ENV=production pnpm start:worker
NEXT_PUBLIC_API_URL=https://api.example.com API_URL=https://api.example.com pnpm start:web
```

Put a reverse proxy (Caddy / nginx / Traefik) in front:

- `https://ops.example.com` → web `:3000`
- `https://api.example.com` → api `:4000` (HTTP **and** WebSocket upgrade for `/api/v1/ws/*`)

Set `CORS_ORIGIN=https://ops.example.com` and matching `API_URL` / `NEXT_PUBLIC_API_URL`.

## 4. Pair the Go agent (game host)

On the machine that runs BDS:

```bash
./apps/agent/bin/bedrock-agent \
  -control-plane wss://api.example.com \
  -node-id node_docker_agent_1 \
  -token "$BEDROCK_AGENT_TOKEN" \
  -server-path /var/minecraft/bedrock \
  -bds-bin /var/minecraft/bedrock/bedrock_server
```

Use `http://` only on trusted private networks. Prefer `wss://` behind TLS.

Verify in **Settings → Agent nodes** that the tunnel shows connected, then exercise Start / Backup / Restore once.

## 5. First-login hardening

1. Open `/login` — seed admin is `admin@minecraft-admin.local` / `admin` (change immediately).
2. Rotate `BEDROCK_AGENT_TOKEN` / re-pair the agent node.
3. Confirm Discord webhook (optional) with a test alert.
4. Keep `NEXT_PUBLIC_DEV_AUTO_LOGIN=false`.

## 6. Local production-shaped play (dev laptop)

```bash
docker compose up -d postgres
./scripts/start-local.sh
# http://localhost:3000/login
```

See also [SHIP_READINESS.md](./SHIP_READINESS.md) and [README.md](./README.md).

## Out of scope for this deploy (later add-ons)

- Live Pterodactyl panel power/files HTTP
- Direct SSH process lifecycle / SFTP world writes
- Seasonal / round-based game modes
- Mojang Marketplace federation
- Xbox Persona force-apply
- Player Discord ↔ in-game chat relay

These can ship as incremental features without blocking the core ops loop.
