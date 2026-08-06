# BedrockOps — Master Project Plan & Product Architecture

## Product Vision & Positioning
BedrockOps is the operating system for Bedrock Minecraft communities: server control, automated backups, player moderation, Discord workflows, templates, analytics, security, and partner integrations in one scalable, non-technical platform.

- **Bedrock-First**: Purpose-built for Bedrock Dedicated Server (BDS) & community management.
- **Server Ops**: Complete community operations layer, not just hosting.
- **Discord-Native**: Deep Discord chat, alert, and staff permission relay.
- **Product-Led Growth**: Referral-driven virality and shareable community templates.

---

## Core Product Principles
1. **Prefer Deterministic Workflows**: Reliable automation over black-box complexity.
2. **Safe by Default**: Confirmation modals and audit logging for all destructive actions.
3. **Templates Over Blank Slates**: Instant setup with community profiles and addon bundles.
4. **Growth-Aligned Features**: Every feature improves activation, retention, or growth.

---

## Workspace Structure (Monorepo with pnpm + Turborepo)

```
.
├── apps/
│   ├── web/           # Next.js admin dashboard UI (App Router, Tailwind CSS)
│   ├── api/           # Core Backend REST / WebSocket API (Node.js/TypeScript)
│   ├── worker/        # Background job processor (Backups, referral sweeps, scheduled tasks)
│   ├── agent/         # Bedrock Machine Agent daemon (BDS process control, RCON, files)
│   └── discord/       # Discord bot client & webhook notification relay
├── packages/
│   ├── db/            # Schema (Prisma/Postgres) & Memory database repository
│   ├── ui/            # Shared React UI component library & dark mode theme tokens
│   ├── config/        # Zod environment variable validation & TSConfig presets
│   ├── auth/          # Authentication & RBAC role hierarchy (OWNER, ADMIN, MODERATOR, STAFF)
│   ├── audit/         # Audit log recorder & action tracking domain models
│   ├── bedrock/       # BDS process status controller & server.properties parser
│   ├── backups/       # Backup snapshot engine, retention enforcer & restore validator
│   ├── moderation/    # Player lookup, moderation action records (warn/mute/kick/ban/note)
│   ├── notifications/ # Discord Webhook & embed payload generator
│   ├── templates/     # Bedrock server templates & pack applier engine
│   └── pipelines/     # Step-by-step pipeline execution workflows
├── docker-compose.yml # Postgres 16 & Redis 7 services
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Phased Roadmap

### Phase 1: Bedrock Foundation (Completed & Verified)
*Focus: Monorepo infrastructure, data models, domain packages, 100% test coverage, and initial vertical slice.*
- **Scaffolding & Configs**: pnpm workspaces + Turborepo v2, Zod environment validation (`@mc-admin/config`).
- **Domain Logic & Testing**:
  - `@mc-admin/db`: Unified schema and seed defaults (**PASSED**).
  - `@mc-admin/auth`: RBAC permissions hierarchy & dev sessions (**PASSED**).
  - `@mc-admin/bedrock`: `server.properties` parser & status updates (**PASSED**).
  - `@mc-admin/audit`: Structured audit trail recorder (**PASSED**).
  - `@mc-admin/backups`: Snapshot creation, restore engine & retention sweeps (**PASSED**).
  - `@mc-admin/moderation`: Player lookup & moderation action tracking (**PASSED**).
  - `@mc-admin/notifications`: Discord Webhook embeds & alert dispatcher (**PASSED**).
  - `@mc-admin/templates`: Server template generator & applier (**PASSED**).
  - `@mc-admin/pipelines`: Automated setup pipeline orchestrator (**PASSED**).
- **Dashboard UI & Services**: `apps/web` (Next.js dark mode UI), `apps/api`, `apps/worker`, `apps/agent`, `apps/discord`.

### Phase 2: Activation & Discord Workflows (Current Target)
*Focus: Guided onboarding flow, Discord setup wizard, referral engine, and interactive moderation modals.*
- Guided Onboarding Wizard (Sign up -> Server type -> Pairing token -> Optional Discord wizard -> Template apply -> Backups).
- Dual-mode Discord Integration: Instant Webhooks + Interactive Bot slash commands & channel mapping.
- Referral Engine: Referral links, tier progress (extra backup retention, bonus server slots), conversion metrics.
- Moderation UI: Interactive player search modal, infraction timeline, and staff notes.
- Gamification & Setup Quests: Progress checklists, milestone badges, and weekly operational streaks.

### Phase 3: Analytics & Security Rules
*Focus: Live telemetry, incident queues, and automated security checks.*
- Live WebSocket stream for server console output and interactive RCON execution.
- Operational Analytics: Uptime, backup success rates, player activity, referral conversions.
- Security Rules: Suspicious bot activity checks, explicit confirmation modals for stops/restores/bans.

### Phase 4: Partner Integrations & Ecosystem Scale
*Focus: Host partner integrations and creator community distribution.*
- Host Partner APIs (exaroton integration, Apex Hosting backup flows, Shockbyte/Nodecraft/BisectHosting expansion).
- Shareable Creator Templates & Preset Addon Bundles.
- Jaydon Collaboration Modules: Discord setup helpers, deployment recipes, anti-bot security modules.

---

## Verification Strategy
- **Automated Tests**: Run `pnpm test` across all 16 workspace packages using Vitest.
- **Type Safety**: Run `pnpm build` across all packages and apps via Turborepo.
- **Manual Verification**: Run `pnpm dev` to verify Next.js dashboard UI, API routes, and agent endpoints.
