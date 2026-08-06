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
- Respect phased delivery targets in `PROJECT_PLAN.md`.
- Phase 1 scope is strictly enforced. Do not auto-implement Phase 2 or Phase 3 features (Java support, White-labeling, Shield security module, AI agents) during Phase 1 tasks.
