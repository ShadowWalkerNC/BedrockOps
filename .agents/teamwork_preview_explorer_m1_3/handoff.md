# Handoff Report: Milestone 1 (M1) Admin Dashboard UI (R1.5) & Integration Explorer

## 1. Observation

### 1.1 Existing Repository State & Package Boundaries
- **Monorepo Build Status**: `pnpm build` completed with 17/17 packages building successfully with zero errors (`@mc-admin/ui`, `@mc-admin/db`, `@mc-admin/bedrock`, `@mc-admin/api`, `@mc-admin/web`, etc.).
- **Test Suite Status**: `pnpm test` completed with 28/28 tasks and 41/41 E2E tests passing 100%.
- **`apps/web` Structure**: Next.js 14 app (Pages Router in `src/pages/index.tsx`, `_app.tsx`, `_document.tsx`, `api/servers.ts`, `api/backups.ts`, `api/moderation.ts`, `api/servers/[id]/control.ts`).
  - Monolithic single-page layout (`index.tsx` ~581 lines) handling tabs for servers, backups, moderation, discord, templates, referrals.
  - Interactive modals currently present: `isRegisterModalOpen` (server registration) and `isConfirmModalOpen` (dangerous action confirmation).
- **`packages/ui` Structure**: Design system package exporting `UI_THEME` object and `getStatusBadgeStyle(status)` in `src/index.ts`.
- **`packages/db` Schema**: Database schema (`src/schema.ts`) defining `User`, `AgentNode`, `ConnectionKey`, `ServerMember`, `BedrockServer`, `BackupRecord`, `ModerationAction`, `AuditLog`, `BdsVersion`.
- **`packages/bedrock` Controller**: Properties parser/serializer and stubbed RCON controller (`src/index.ts`).

### 1.2 Identified Architectural Gaps for R1.5 & Integration
1. **Missing Atomic UI Components**: `@mc-admin/ui` currently lacks reusable component abstractions (`Button`, `Badge`, `Card`, `Modal`, `ConfirmModal`, `Table`, `Input`).
2. **Client API Layer Abstraction**: `apps/web` currently calls relative Next.js API routes (`/api/servers`, `/api/backups`). For full M1 integration, a unified API client wrapper (`apps/web/src/lib/apiClient.ts`) is required to bridge `apps/web` to `apps/api` REST endpoints (`/api/v1/*`).
3. **HostProvider Integration**: UI forms need explicit HostProvider strategy selection (`DOCKER_AGENT`, `PTERODACTYL`, `DIRECT_RCON_SSH`) and Agent Node assignment.
4. **Go Agent Node Pairing UI**: A dedicated Node Management tab view is required to view registered Go Agent Nodes (`AgentNode` model) and generate pairing connection keys.
5. **Interactive Server Console Modal**: Real-time console log tailing and RCON command execution interface via WebSocket client connection.

---

## 2. Logic Chain

1. **R1.5 Scope Requirement**: R1.5 mandates a Next.js admin dashboard UI in `apps/web` featuring live server nodes, backup management, moderation history, and interactive modals.
2. **Design System Standardization**: Abstracting UI elements into `@mc-admin/ui` (buttons, badges, cards, tables, modals) ensures visual consistency and fulfills `AGENTS.md` standard #6 ("Admin-first aesthetics, clean hierarchy, explicit confirmation modals for dangerous actions").
3. **End-to-End M1 Integration**: `apps/web` must interface cleanly with `apps/api` REST endpoints, `@mc-admin/db` Prisma models, and `@mc-admin/bedrock` HostProvider abstractions.
4. **Safety & Audit Trail Compliance**: Every operational state change triggered from the dashboard (Server start/stop/restart, backup trigger/restore, moderation action, template application) MUST emit a structured audit log event (`AuditLogger.record`).

---

## 3. Caveats

- **Pages Router vs App Router**: `apps/web` is currently configured with Next.js Pages Router (`src/pages`). Component refactoring should maintain compatibility with Next.js 14 Pages Router while organizing code in `src/components/`.
- **Next.js API Routes Proxying**: In local development without `apps/api` running standalone, Next.js API routes in `apps/web/src/pages/api/` serve as local fallback endpoints. The client API client should support configurable backend URLs (`NEXT_PUBLIC_API_URL`).
- **WebSocket Streaming**: Real-time RCON console tailing and telemetry require fallback polling if the client WebSocket connection to `/api/v1/ws/client` is degraded or disconnected.

---

## 4. Conclusion & Technical Specifications

### 4.1 UI Design & Refactoring Specification (`apps/web` & `@mc-admin/ui`)

1. **Design System Package (`packages/ui/src/`)**:
   - `index.ts`: Export theme tokens (`UI_THEME`), badge styling helper (`getStatusBadgeStyle`), and modular components (`Button`, `Badge`, `Card`, `Modal`, `ConfirmModal`, `Table`).

2. **Dashboard UI Component Breakdown (`apps/web/src/components/`)**:
   - `Header.tsx`: Navigation bar, agent node status counter, sync button.
   - `Sidebar.tsx`: Dashboard navigation drawer (`Server Nodes`, `Agent Nodes`, `Backups`, `Moderation`, `Audit Trail`, `Discord Relay`).
   - `ServerCard.tsx`: Card component for Bedrock servers featuring status badge, HostProvider badge (`DOCKER_AGENT`, `PTERODACTYL`, `DIRECT_RCON_SSH`), host:port, slots, and action buttons (`Start/Stop`, `Restart`, `Backup`, `RCON Console`).
   - `ServerGrid.tsx`: Responsive grid for server cards.
   - `NodeManagementView.tsx`: Agent nodes table displaying Go agent status, IP, version, host specs, and pairing key generation button.
   - `BackupManagementView.tsx`: Backup history table with file size, manual flag, SHA256 checksum status, and restore button.
   - `ModerationLedgerView.tsx`: Infraction history table (WARN, MUTE, KICK, BAN, NOTE) with search filter bar and record infraction form.
   - `AuditTrailView.tsx`: Structured operational log history table.
   - `ConfirmModal.tsx`: Explicit red alert confirmation modal for process stops, backup restores, and player bans.
   - `RegisterServerModal.tsx`: Form to register new server node with HostProvider selection.
   - `RegisterNodeModal.tsx`: Form to generate Go agent node pairing token.
   - `ConsoleModal.tsx`: Interactive RCON console and log tailing overlay.

### 4.2 End-to-End M1 Integration Specification

- **REST API Routes (`apps/api`)**:
  - `GET /api/v1/servers`, `POST /api/v1/servers`, `POST /api/v1/servers/:id/power`, `POST /api/v1/servers/:id/rcon`
  - `GET /api/v1/nodes`, `POST /api/v1/nodes/token`
  - `GET /api/v1/backups`, `POST /api/v1/backups`, `POST /api/v1/backups/:id/restore`
  - `GET /api/v1/moderation`, `POST /api/v1/moderation`
  - `GET /api/v1/audit`
- **Database Schema (`packages/db`)**:
  - Expose Prisma Client models: `User`, `AgentNode`, `BedrockServer`, `ConnectionKey`, `ServerMember`, `BackupRecord`, `ModerationAction`, `AuditLog`, `BdsVersion`.
- **HostProvider Interface (`packages/bedrock`)**:
  - Expose `HostProvider` strategy implementations: `DockerAgentProvider`, `PterodactylProvider`, `DirectRconSshProvider`.

---

## 5. Verification Method

1. **Build & Type Check**:
   - `pnpm --filter @mc-admin/ui build`
   - `pnpm --filter @mc-admin/web build`
   - `pnpm build` (100% turbo build pass across all 17 workspaces)

2. **Test Suite Verification**:
   - `pnpm test` (100% pass across all package tests and E2E tiers)

3. **Dashboard Sanity Verification**:
   - `pnpm --filter @mc-admin/web dev`
   - Open browser at `http://localhost:3000`
   - Verify tab navigation between Server Nodes, Agent Nodes, Backups, Moderation, and Audit Trail.
   - Verify modals display correctly and execute actions with audit log output.
