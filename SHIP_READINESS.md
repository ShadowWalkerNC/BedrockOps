# BedrockOps — Ship Readiness

Status of the platform against `PROJECT_PLAN.md`, what is required to run it in
production, and what is intentionally deferred.

## Shippable scope: Waves A–C (core product)

| Wave | Capability | Status |
|------|------------|--------|
| A | Control plane (REST + JWT/RBAC), Prisma persistence, Go agent WSS tunnel, real RCON, R2 streaming backup + restore | ✅ Implemented |
| A | Dashboard power actions reach a live agent (honest stubs when offline) | ✅ Verified end-to-end |
| B | Player join tracking, GDPR-compliant moderation ledger, `allowlist.json` atomic sync (agent writer) | ✅ Implemented (M4) |
| B | Subdomain + UDP port allocation, console/FriendConnect onboarding adapters, setup pipelines | ✅ Implemented (M5) |
| B | Discord webhook delivery + alerts for bans/backups/crashes | ✅ Implemented |
| C | Live console / interactive RCON streaming to the dashboard | ✅ Implemented (agent pipes BDS stdout/stderr as `LOG_LINE`) |
| C | Operational analytics + destructive-action rate limiting + join-flood detection | ✅ Implemented (flood wired on join ingest + agent logs) |
| C | BDS version matrix (pin, mismatch warnings, backup-before-update) | ✅ Implemented |
| C | Crash detection → crash Discord alert | ✅ Implemented (agent auto-reports unexpected process exit) |
| — | Worker scheduled backup + retention loop | ✅ Implemented (honest stub when agent/R2 offline) |
| — | Unified "command center" UI design system across pages | ✅ Implemented |
| — | Ops Room BDS version pin / mismatch UI | ✅ Implemented |
| — | Setup wizard (create realm → onboard → first backup) | ✅ Implemented (`/setup`) |
| B5 | Discord slash commands + channel mapping | ✅ Scaffolded — needs `DISCORD_BOT_TOKEN` + `DISCORD_APPLICATION_ID` + `DISCORD_GUILD_ID` |
| B4 | Live Xbox / OpenXBL gamertag resolve | ✅ Wired — needs `XBOX_API_KEY`/`OPENXBL_API_KEY` (honest stub without key) |
| R5.1 | Live Cloudflare DNS writes | ✅ Wired — needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` |

## Required production configuration

The app boots in development with safe defaults and honest stubs. For a real
deployment, set these (see `.env.example`, `packages/config/src/env.ts`,
`apps/api/src/config.ts`):

- `NODE_ENV=production`
- `JWT_SECRET`, `NODE_PAIRING_SECRET` — strong unique secrets (min 32 chars). Production refuses weak defaults.
- `DATABASE_URL` + `DB_ADAPTER=prisma` — Postgres persistence (run `pnpm --filter @mc-admin/db db:migrate`).
- `CORS_ORIGIN` — the dashboard origin (never `*`).
- Agent pairing: per-node bearer token (hashed on `AgentNode`); rotate the seeded `dev_agent_token_change_me`.
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` — Cloudflare R2 for offsite backups (without these, backups archive locally / report honest stubs).
- `DISCORD_WEBHOOK_URL` (+ optional `DISCORD_BOT_TOKEN`) — live alert delivery (otherwise alerts are recorded but not sent).
- Optional: `XBOX_API_KEY`/`OPENXBL_API_KEY` (gamertag↔XUID + friend invites), `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` + `PLAY_BASE_DOMAIN` (live DNS for subdomains), `DISCORD_APPLICATION_ID` + `DISCORD_GUILD_ID` (slash commands). Without these, resolution/DNS/slash registration are honest stubs.

## Pre-ship checklist

- [ ] `pnpm install && pnpm --filter @mc-admin/db db:generate`
- [ ] `pnpm lint && pnpm test && pnpm build` all green
- [ ] Provision production secrets above; run DB migrations
- [ ] Pair at least one Go agent to a real BDS host (`-bds-bin`) and verify power + backup + restore round-trip
- [ ] Confirm Discord webhook receives a test alert
- [ ] Restrict `CORS_ORIGIN`; disable `NEXT_PUBLIC_DEV_AUTO_LOGIN`

## Deferred: Wave D (content platform & optional partners)

Per `PROJECT_PLAN.md`, Wave D is explicitly post–Realms-stable and depends on
external accounts/services, so it is **not** implemented here (and must not be
faked per the repo's "no fake stubs" rule):

- Pack / add-on engine, template presets, skins/cosmetics
- First-party marketplace catalog
- Host-partner providers (Pterodactyl, etc.) — interfaces exist and fail honestly until wired
- Round-based / seasonal game modes

These can be built once the relevant credentials/services (host panels, pack
storage, marketplace backend) are available.
