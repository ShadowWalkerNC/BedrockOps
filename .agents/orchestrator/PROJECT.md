# Project: Minecraft Admin Platform

## Architecture
Monorepo using `pnpm` workspaces and Turborepo.
- `apps/`: agent, api, discord, web (Next.js App Router), worker
- `packages/`: audit, auth, backups, bedrock, config, db, moderation, notifications, pipelines, templates, ui

## Feature Inventory
Every feature from the Survey phase with assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Turborepo & Workspace Fixes | Fix `turbo.json` tasks key, `pnpm-lock.yaml` setup, Zod env validation in `@mc-admin/config` | M0 | Explorer 1, 3 |
| 2 | Bedrock Lifecycle & RCON Protocol | Process management, `server.properties` parser/serializer, RCON socket client, unit tests | M1 | R1 |
| 3 | Backup Safety & Snapshot Engine | Snapshot archiving, restore validation, retention policies, filesystem zip engine, audit logs | M2 | R2 |
| 4 | Moderation & Player Operations | Player search, moderation record tracking (warn/mute/kick/ban/note), RCON integration, audit logs | M3 | R3 |
| 5 | Discord Webhooks & Bot Handlers | Status/backup/moderation embed formatters, real fetch dispatches, Discord bot command handlers | M4 | R4 |
| 6 | Server Templates & Automation Pipelines | Template synthesis engine, dynamic multi-step execution pipeline, setup pipeline | M5 | R5 |
| 7 | Next.js App Router UI & Component System | App Router migration (`apps/web/src/app`), `@mc-admin/ui` components, dangerous action modals, live feeds | M6 | UI / Web |
| 8 | Dual-Track E2E Test Suite & Hardening | Opaque-box E2E test runner, Tiers 1-4 requirement tests, Tier 5 adversarial hardening | M7 (E2E) | Testing |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 0 | Monorepo Configuration & Tooling | `turbo.json` fix, Zod env schemas, `@mc-admin/config` | none | IN_PROGRESS |
| 1 | Bedrock Lifecycle & RCON (R1) | `packages/bedrock`, `apps/agent` | M0 | PLANNED |
| 2 | Backup Safety & Snapshot Engine (R2) | `packages/backups`, `apps/worker` | M0 | PLANNED |
| 3 | Moderation & Player Operations (R3) | `packages/moderation`, `apps/api` | M0, M1 | PLANNED |
| 4 | Discord Webhooks & Bot Operations (R4) | `packages/notifications`, `apps/discord` | M0 | PLANNED |
| 5 | Templates & Automation Pipelines (R5) | `packages/templates`, `packages/pipelines` | M0, M1, M2 | PLANNED |
| 6 | Next.js Admin Dashboard UI & API Integration | `apps/web` (App Router), `packages/ui`, `apps/api` | M1-M5 | PLANNED |
| 7 | Dual-Track E2E Test Suite & Hardening | E2E opaque-box test runner, Tiers 1-5 test suite | M0-M6 | PLANNED |

## Feature Inventory Cross-Check
- Feature 1 -> Milestone M0
- Feature 2 -> Milestone M1
- Feature 3 -> Milestone M2
- Feature 4 -> Milestone M3
- Feature 5 -> Milestone M4
- Feature 6 -> Milestone M5
- Feature 7 -> Milestone M6
- Feature 8 -> Milestone M7
All features assigned. Cross-check PASS.

## Interface Contracts
### Bedrock ↔ Agent / API
- `BedrockServerController`: parse/serialize `server.properties`, RCON command execution, process state management.
- Emits structured Audit Log event (`AuditLogger.record()`) on status change.

### Backups ↔ Worker / API
- `BackupEngine`: create snapshot, restore backup, apply retention policy.
- Emits structured Audit Log event (`AuditLogger.record()`) on backup creation and restore.

### Moderation ↔ API / Bedrock
- `ModerationService`: record moderation action (`warn`, `mute`, `kick`, `ban`, `note`), get player history, player search.
- Emits structured Audit Log event (`AuditLogger.record()`) on action creation.

### Notifications ↔ Discord / API
- `NotificationDispatcher`: format embeds (`serverStatus`, `backup`, `moderation`), dispatch HTTP `fetch()` POST to webhooks.

### Pipelines ↔ Templates / Backups / Audit / Notifications
- `PipelineEngine`: execute dynamic pipeline steps, create template, apply template to server.

## Code Layout
- `apps/web`: Next.js App Router (`apps/web/src/app`)
- `apps/api`: REST / WS server (`apps/api/src`)
- `apps/agent`: Bedrock host daemon (`apps/agent/src`)
- `apps/discord`: Discord bot (`apps/discord/src`)
- `apps/worker`: Job worker (`apps/worker/src`)
- `packages/*`: Domain packages (`audit`, `auth`, `backups`, `bedrock`, `config`, `db`, `moderation`, `notifications`, `pipelines`, `templates`, `ui`)
