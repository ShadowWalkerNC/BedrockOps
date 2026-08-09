# BedrockOps

Run your own Minecraft **Bedrock Realms** with a real admin stack — not just a blank server folder.

BedrockOps gives you a dashboard + API + machine agent to **start/stop servers**, stream a **live console**, take **backups**, moderate players, send **Discord alerts**, and onboard friends without babysitting files by hand.

**This project is free.** Fork it, self-host it, break it, improve it. Pull requests are very welcome.

---

## What you get

- **Dashboard** — ops room, setup wizard, live console, players, worlds, settings
- **Go agent** — talks outbound to the control plane (works behind CGNAT / home NATs)
- **Backups** — save-hold → archive; optional upload to Cloudflare R2
- **Moderation** — warn / mute / kick / ban / notes, plus allowlist sync
- **Discord** — optional webhook alerts for bans, backups, crashes
- **Honest errors** — if the agent or R2 isn’t connected, it tells you instead of pretending it worked

---

## Quick start

### Requirements

- Node.js 18+
- [pnpm](https://pnpm.io) 9 — `corepack enable && corepack prepare pnpm@9.0.0 --activate`
- Docker (for Postgres)
- Go 1.22+ (only if you build the agent)

### One-command local stack (Mac/Linux)

```bash
pnpm install
cp .env.example .env
./scripts/start-local.sh
```

Then open **http://localhost:3000/login**

| Login | Password |
|-------|----------|
| `admin@minecraft-admin.local` | `admin` |

### Windows

```powershell
pnpm install
copy .env.example .env
powershell -ExecutionPolicy Bypass -File .\scripts\start-local.ps1
```

Then start **two** terminals:

```powershell
# Terminal 1 — API (must use port 4000)
$env:PORT="4000"; $env:DB_ADAPTER="prisma"; pnpm --filter @mc-admin/api dev

# Terminal 2 — website
$env:API_URL="http://localhost:4000"
$env:NEXT_PUBLIC_DEV_AUTO_LOGIN="false"
pnpm --filter @mc-admin/web clean
pnpm --filter @mc-admin/web dev
```

Open http://localhost:3000/login with the same admin login above.

> Tip: don’t keep the repo under **OneDrive**. It often corrupts Next.js’s `.next` cache. If you see a missing `vendor-chunks` error, run `pnpm --filter @mc-admin/web clean` and start web again.

---

## Optional: connect the agent

The agent is what actually starts Bedrock on a machine.

```bash
pnpm --filter @mc-admin/agent agent:build

./apps/agent/bin/bedrock-agent \
  -control-plane http://127.0.0.1:4000 \
  -node-id node_docker_agent_1 \
  -token dev_agent_token_change_me
```

- Without `-bds-bin`, lifecycle is **simulated** (great for trying the UI).
- With `-bds-bin /path/to/bedrock_server`, it manages a real BDS process.

---

## Project layout

```
apps/web       Operator dashboard (Next.js)
apps/api       REST + WebSocket API (port 4000)
apps/worker    Scheduled backups
apps/agent     Go daemon on the game host
apps/discord   Discord webhooks / bot bits
packages/      Shared libraries (db, auth, backups, moderation, …)
```

More contributor rules: [AGENTS.md](./AGENTS.md)  
What’s shipped vs deferred: [SHIP_READINESS.md](./SHIP_READINESS.md)

---

## Common commands

```bash
pnpm install
pnpm dev              # start workspace apps
pnpm test             # run tests
pnpm typecheck        # TypeScript check
pnpm build            # build everything

pnpm --filter @mc-admin/db db:generate
pnpm --filter @mc-admin/db db:migrate
pnpm --filter @mc-admin/web clean
```

---

## Config (short version)

1. Copy `.env.example` → `.env`
2. For a “real” local DB use `DB_ADAPTER=prisma` + Postgres (`docker compose up -d postgres`)
3. Optional later:
   - `R2_*` for offsite backups
   - `DISCORD_WEBHOOK_URL` for alerts
   - Cloudflare / Xbox keys for live DNS & gamertag resolve

Until those are set, related features stay as **honest stubs** (they fail clearly).

---

## Contributing

I’d love help. If something’s rough, missing docs, or you fixed a bug on your fork — open a PR.

Good ways to help:

- Fix bugs you hit while self-hosting
- Improve docs / Windows setup
- Add tests
- Polish UI copy and empty states
- Wire optional integrations carefully (no fake “success”)

Please skim [AGENTS.md](./AGENTS.md) before larger changes (package boundaries + “don’t fake stubs” rule).

---

## License

**Free to use and free to fork.**

No SaaS lock-in here — take the code and run it yourself. If you publish a public fork, a link back to this repo is appreciated but not required.
