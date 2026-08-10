# BedrockOps — Master Project Plan & Product Architecture

## Product Vision & Positioning

BedrockOps is the **operating system for Bedrock Realms**: self-hosted community servers that feel as easy as Realms, with the power of a full admin stack — lifecycle control, backups, console-friendly join, moderation, Discord, security, add-ons, and (later) a content marketplace.

This is **not** a race on RAM pricing against hosts. Competing hosts (e.g. Purpify, Verixen) struggle on specs and margin. BedrockOps wins on **software**: the control plane and operator tools. Hosting partners are optional distribution later — never a dependency for shipping.

### Strategic pillars

| Pillar | Meaning |
|--------|---------|
| **Realms-first (BDS)** | Self-hosted Bedrock Dedicated Server communities. Official Mojang Realms APIs are out of scope. |
| **Self-sufficient** | Own agent, own Postgres, Cloudflare R2 backups, own console onboarding adapters. |
| **Admin OS** | Everything a server operator wants: power, backups, moderation, Discord, security, packs/templates. |
| **Partners later** | Host/reseller relationships after the product is sticky — not before the core loop works. |
| **Rounds later** | Round-based / minigame product surfaces are deferred until Realms ops are reliable. |

### Differentiation vs pure hosting

- Hosts sell capacity (CPU/RAM/disk).
- BedrockOps sells **operations + content + safety**.
- Same machine can run BDS; BedrockOps makes it manageable for non-experts and powerful for staff.

---

## Core Product Principles

1. **Prefer deterministic workflows** — reliable automation over black-box complexity.
2. **Safe by default** — confirmation modals + structured audit logs for destructive actions.
3. **Templates over blank slates** — instant Realms profiles with pinned BDS versions and pack bundles.
4. **Honest stubs** — never pretend start/stop/backup/restore succeeded when host I/O is missing.
5. **One host path first** — ship `DOCKER_AGENT` (outbound WSS agent on machines we control); defer Pterodactyl / partner APIs until Wave D.
6. **Version-aware** — track BDS releases, pack/Script API compatibility; do not build client renderers (Vulkan/RenderDragon are client concerns).

---

## Current State (as of Wave A completion branch)

**`main`:** Phase-0 / M1 prototype baseline + Realms-first plan rewrite.

**Wave A completion branch** (`cursor/wave-a-complete-1b80`): lands A1–A5 without Wave B (M4/M5) — Go agent WSS tunnel, Source RCON codec, R2 streaming backup/restore, Prisma hydrate/flush + migrations, agent auth / honest stubs / upload host allowlist.

**Deferred Wave B draft branches** (do not merge ahead of Wave A ship gate):

| Branch | Intent |
|--------|--------|
| `cursor/moderation-allowlist-m4-ab1c` | Player tracking, GDPR, allowlist sync (M4) |
| `cursor/subdomain-onboarding-m5-ab1c` | Subdomain/ports + console onboarding (M5) |

---

## Workspace Structure

```
.
├── apps/
│   ├── web/           # Next.js admin dashboard (Realms operator UI)
│   ├── api/           # REST + WebSocket control plane
│   ├── worker/        # Scheduled backups, retention, background jobs
│   ├── agent/         # Outbound machine daemon (BDS process, RCON, files) — Go preferred
│   └── discord/       # Webhooks first, then slash-command bot
├── packages/
│   ├── db/            # Prisma/Postgres schema + MemoryDatabase for local/dev
│   ├── ui/            # Shared React components (admin-first, dark mode)
│   ├── config/        # Zod env validation & shared TS config
│   ├── auth/          # JWT + RBAC (OWNER, ADMIN, MODERATOR, VIEWER)
│   ├── audit/         # Structured audit trail
│   ├── bedrock/       # Properties parser, HostProvider, RCON primitives
│   ├── backups/       # Snapshot engine, R2 upload, retention, restore validation
│   ├── moderation/    # Infractions, join/XUID tracking, allowlist sync
│   ├── notifications/ # Discord embed/payload formatters
│   ├── templates/     # Realms templates + pack apply (files + manifests)
│   └── pipelines/     # Setup / onboarding orchestration
├── docker-compose.yml # Postgres 16 & Redis 7
├── PROJECT.md         # Feature inventory & milestone status
├── PROJECT_PLAN.md    # This document
└── AGENTS.md          # Coding standards & package boundaries
```

---

## Delivery Waves

Waves replace the old “Phase 1 complete” fiction. Each wave has a **ship gate**: a Realms operator can do the listed jobs on a real (or CI-emulated) BDS without fake success.

### Wave A — Make the Realms loop real (NOW)

*Goal: one operator can provision, power, backup, and restore a BDS instance end-to-end on infrastructure we control.*

| Workstream | Deliverable | Maps to |
|------------|-------------|---------|
| **A1 Persistence** | Prisma as default for staging/prod; migrations; memory only for unit/dev | M1 completion |
| **A2 Agent tunnel** | Outbound WSS Go agent; heartbeat; CMD_EXEC start/stop/restart/status; log + metrics frames | M2 / R2.1–R2.4 |
| **A3 RCON** | Real RCON client (not `[STUB]`); used for power assists + save-hold | M2 / R2.4 |
| **A4 R2 backups** | Save-hold → stream tar/gzip → Cloudflare R2 presigned PUT → SHA256/manifest; restore path | M3 / R3.1–R3.3 |
| **A5 Hardening** | Remove admin password bypass; agent pairing secret; path jails; no fake-success providers | Security branch |

**Ship gate:** Dashboard power actions reach a live agent; backup completes in R2; restore verified; audit events recorded.

**Explicitly deferred in Wave A:** Pterodactyl, partner host APIs, referrals, marketplace, round-based modes.

**Storage decision:** Cloudflare R2 only (zero egress). Do not keep long-lived backup blobs on game disks.

---

### Wave B — People & console Realms (NEXT)

*Goal: staff can run a community Realm — players join from console, moderation sticks, Discord alerts fire.*

| Workstream | Deliverable | Maps to |
|------------|-------------|---------|
| **B1 Player identity** | Join-log XUID/gamertag capture; persistent player records | M4 / R4.1 |
| **B2 Moderation ledger** | WARN/MUTE/KICK/BAN/NOTE + soft-delete/GDPR anonymize; RCON enforce where applicable | M4 / R4.2 |
| **B3 Allowlist sync** | Atomic `allowlist.json` write + reload | M4 / R4.3 |
| **B4 Console onboarding** | Gamertag → XUID; invite UX; pluggable **FriendConnect adapters** (see below) | M5 / R5.2 |
| **B5 Discord** | Real webhook HTTP delivery; then slash commands + channel mapping | Phase 2 Discord |
| **B6 Onboarding wizard** | Sign up → pair agent → create Realm → template → first backup → optional Discord | Phase 2 wizard |

**Discord chat decision (product):** Staff ops alerts stay on webhooks (`apps/discord` / `@mc-admin/notifications`). **Player Discord ↔ in-game Bedrock chat relay is deferred** — Bedrock has no DiscordSRV equivalent; a real bridge needs RCON/say + log ingest or a Script API pack (Wave D-adjacent), not a Sigil merge. Do not fake a chat bridge.

#### Console / FriendConnect strategy

Own the **allowlist + invite pipeline**. Discovery helpers are adapters:

| Adapter | Role | Ownership |
|---------|------|-----------|
| `AllowlistOnboarding` | Source of truth: resolve identity, seed allowlist | First-party (required) |
| `FriendSessionBroadcast` | FriendConnect-style joinable session (MCXboxBroadcast-class) | First-party integration / self-hostable |
| `BedrockConnectDns` | Documented fallback for custom IP entry on console | Optional; prefer self-hosted instance later |

Do not hard-depend on a single public DNS redirect. Product UX: invite link → resolve → allowlist → optional friend broadcast.

**Ship gate:** Console player invited and joins; ban writes ledger + allowlist/RCON; Discord webhook delivers for ban/backup/crash.

---

### Wave C — Security, live ops, analytics

*Goal: operators trust BedrockOps as the day-to-day console.*

- Live WebSocket console + interactive RCON from the dashboard
- Security rules: join floods, suspicious bot patterns, rate-limited destructive actions
- Operational analytics: uptime, backup success rate, player activity
- BDS version matrix: pin version, warn on mismatch, backup-before-update
- Subdomain + UDP port pool (`*.play…`) when DNS is owned (M5 / R5.1)

**Ship gate:** Staff can watch live logs, run confirmed RCON, and see backup/uptime health without SSH.

---

### Wave D — Content platform & optional partners

*Goal: specialized gameplay and distribution without becoming a commodity host.*

| Workstream | Deliverable |
|------------|-------------|
| **D1 Pack engine** | Install/enable behavior + resource packs; world manifest updates; Script API v2 awareness |

**D1 progress:** First-party sample BP/RP catalog, `PackEngine` apply plans, agent `WRITE_PACK_FILES` (path-jailed under `worlds/**/(behavior|resource)_packs` + enable lists), `POST /api/v1/packs/apply`. Script API packs gated by the D matrix (below).
| **D2 Templates** | Game-style presets (survival, creative, minigame stub) pinned to BDS + experiments |

**D2 progress:** Mode templates declare `addonPacks` (wired to D1 catalog). Setup/apply-template installs those packs and patches `level.dat` experiment flags when the agent is online (`experimentsApplied` only after a successful host write).
| **D3 Skins / cosmetics** | Skin/persona pack apply within Bedrock constraints |

**D3 progress:** Cosmetic world resource packs (`category=cosmetic`) via the pack engine. Persona / `.mcpersona` uploads return `409 PERSONA_UNSUPPORTED` — BDS cannot force Xbox Persona skins.
| **D4 Marketplace** | First-party catalog of vetted packs; one-click apply to a Realm |

**D4 progress:** Catalog metadata (category/tags/publisher/vetted), `GET /packs` filters + facets, Plugins marketplace UI with one-click apply. First-party only — not Mojang store. Script API clear-lag remains a blocked stub; `pack_script_hello_bp` applies when the matrix allows.

**Script API matrix:** `SCRIPT_API_MATRIX` in `@mc-admin/templates` + `GET /versions` / `/versions/script-matrix`. Fail-closed for unknown BDS pins.
| **D5 Host partners** | Optional capacity via friends/hosts (Purpify, Verixen, etc.) through `HostProvider` — white-label or reseller, not required to operate |

**D5 progress:** Partner host readiness surface (`getReadiness` / `GET /system/status` hostProviders), both-or-neither env for Pterodactyl + Direct SSH, Settings pills + realm hostProvider editor, `GET /servers/:id/host`. Panel/SSH lifecycle stays honest stub when credentials are set — never fake power/backup success. `DOCKER_AGENT` remains the primary path.
| **D6 Rounds** | Round-based / seasonal mode product surfaces (explicitly post–Realms-stable) |

**Ship gate:** Operator applies a vetted add-on pack from the catalog; Realm restarts cleanly on the pinned BDS version.

---

## Staying current with Minecraft

Vulkan / RenderDragon / Vibrant Visuals are **client rendering**. BedrockOps tracks **server-facing** change:

1. **BDS version catalog** (`BdsVersion` model) — download URLs, `isLatest`, supported pins
2. **`server.properties` + experiments** — versioned known-key sets in `@mc-admin/bedrock`
3. **Script API / creator packs** — Scripting v2 init semantics; pack compatibility tests per BDS build
4. **Changelog CI smoke** — install BDS X → apply sample pack → start → RCON ping → backup to R2

Do **not** embed a Vulkan/GUI stack in this monorepo.

---

## Milestone crosswalk (`PROJECT.md`)

| Milestone | Wave | Status on `main` | Notes |
|-----------|------|------------------|-------|
| M1 Control plane | A1 | IN_PROGRESS | Schema + API + UI prototype; Prisma not default |
| M2 Go agent | A2–A3 | PLANNED on main | Candidate: `cursor/go-agent-tunnel-ab1c` |
| M3 R2 backups | A4 | PLANNED on main | Candidate: `cursor/streaming-backups-r2-ab1c` |
| M4 Moderation / allowlist | B1–B3 | PLANNED on main | Candidate: `cursor/moderation-allowlist-m4-ab1c` |
| M5 Console / subdomain | B4 + C | PLANNED on main | Candidate: `cursor/subdomain-onboarding-m5-ab1c` |
| M_E2E | Parallel | IN_PROGRESS | Strong mock suite; must gain live-integration tests in Wave A |
| M_FINAL | After A–B | PLANNED | Adversarial / hardening pass |

---

## Interface contracts (unchanged intent)

### HostProvider (`packages/bedrock`)

```typescript
export interface HostProvider {
  type: 'DOCKER_AGENT' | 'PTERODACTYL' | 'DIRECT_RCON_SSH';
  startServer(serverId: string): Promise<boolean>;
  stopServer(serverId: string, force?: boolean): Promise<boolean>;
  restartServer(serverId: string): Promise<boolean>;
  getStatus(serverId: string): Promise<ServerMetrics>;
  executeRcon(serverId: string, command: string): Promise<string>;
  streamLogs(serverId: string, callback: (line: string) => void): () => void;
  triggerBackup(serverId: string, options: BackupOptions): Promise<BackupResult>;
}
```

Wave A implements **`DOCKER_AGENT` only** with a real tunnel. Other types may exist as interfaces but must return honest failures until wired.

### Console onboarding adapters (Wave B)

```typescript
export interface ConsoleJoinAdapter {
  readonly id: 'allowlist' | 'friend_session' | 'bedrock_connect_dns';
  prepareJoin(input: ConsoleJoinRequest): Promise<ConsoleJoinResult>;
}
```

### Agent ↔ API tunnel frames

`HEARTBEAT | CMD_EXEC | CMD_RESP | LOG_LINE | METRICS | BACKUP_START | BACKUP_PROGRESS | BACKUP_COMPLETE | BACKUP_ERROR`

---

## Verification Strategy

| Check | Command / method |
|-------|------------------|
| Unit + package tests | `pnpm test` |
| E2E (mock tiers) | `pnpm --filter @mc-admin/e2e test` |
| Typecheck / build | `pnpm build` |
| Lint | `pnpm lint` |
| Wave A integration | Agent against local/CI BDS; R2 upload+download round-trip; power + restore smoke |
| Manual | `pnpm dev` — web `:3000`, api `:4000`, agent tunnel |

---

## Immediate next actions

1. ~~Land Wave A candidates~~ — agent tunnel, real RCON, R2 backup/restore, Prisma hydrate/flush, and security hardening are on the Wave A completion branch.
2. Merge Wave A to `main` after CI green; run live agent + R2 smoke against staging.
3. Keep Wave B console adapters designed as plugins (FriendConnect/friend-session + allowlist).
4. Do not start marketplace, host-partner APIs, or rounds until Wave A ship gate passes on `main`.
5. Use hosting friendships as **business development after product-market fit**, not as engineering prerequisites.

---

## Out of scope (until explicitly pulled in)

- Official Mojang Realms management APIs
- Java Edition / Geyser as a primary path (Bedrock-only for now)
- White-label Shield marketing module as a separate product SKU
- AI agents / autonomous gameplay operators
- Round-based seasonal game product (Wave D6)
- Competing on cheapest VPS SKUs
