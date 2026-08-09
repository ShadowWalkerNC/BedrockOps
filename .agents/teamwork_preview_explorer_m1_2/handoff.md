# Handoff Report: Milestone 1 Explorer (M1: REST API & Auth R1.3, WebSocket Tunnels R1.4)

## 1. Observation

### 1.1 Existing Codebase & Package Audit
- **`apps/api`** (`apps/api/src/index.ts`, 87 lines):
  - Currently exports `ApiServer` with static stub methods (`getServers`, `createServer`, `triggerManualBackup`, `executeSetupPipeline`) operating directly on `db.servers` in-memory array.
  - `apps/api/package.json` (lines 11-22) imports workspace packages (`@mc-admin/db`, `@mc-admin/auth`, `@mc-admin/audit`, `@mc-admin/bedrock`, `@mc-admin/backups`, `@mc-admin/moderation`, `@mc-admin/notifications`, `@mc-admin/templates`, `@mc-admin/pipelines`) but lacks HTTP server dependencies (`express`, `cors`, `ws`, `jsonwebtoken`, `bcryptjs`, `zod`).
  - `apps/api/src/index.test.ts` (42 lines) tests static `ApiServer` methods against in-memory `db`.

- **`packages/auth`** (`packages/auth/src/index.ts`, 29 lines):
  - Exports `AuthSession` interface (lines 3-8), `hasPermission` function checking role hierarchy `OWNER (4) > ADMIN (3) > MODERATOR (2) > VIEWER (1)` (lines 10-19), and `generateDevSession` (lines 21-28).
  - Lacks JWT signing/verification, password hashing, and token validation functions.

- **`packages/db` & `packages/bedrock` Alignment**:
  - `packages/db/src/schema.ts` defines `UserRole`, `ServerStatus`, `User`, `AgentNode`, `BedrockServer`, `BackupRecord`, `AuditLog`.
  - `packages/bedrock` provides `BedrockServerController` and `HostProvider` strategy interface as designed by Explorer m1_1.

- **Scope & Plan Alignment**:
  - `sub_orch_m1/SCOPE.md` lines 14-15 specify R1.3 (REST API Backend & JWT Auth) and R1.4 (WebSocket Agent Tunnel & Client WS endpoints `/api/v1/ws/agent`, `/api/v1/ws/client`).
  - `AGENTS.md` lines 10-28 enforce monorepo boundaries and explicit code standards.

---

## 2. Logic Chain

1. **REST API & JWT Auth (R1.3)**:
   - *Observation*: `packages/auth/src/index.ts` has role hierarchy checking but lacks cryptographic JWT functions, while `apps/api/src/index.ts` is an un-routed static class.
   - *Deduction*: Adding `signJwt`, `verifyJwt`, `hashPassword`, and `comparePassword` to `@mc-admin/auth` enables secure token issuance and validation.
   - *Deduction*: Upgrading `apps/api` with Express routes (`/auth`, `/servers`, `/nodes`), Zod request validation, JWT authentication middleware (`authenticateJwt`), RBAC middleware (`requireRole`), and structured audit logging (`AuditLogger.record`) fulfills all R1.3 control plane requirements.

2. **WebSocket Agent & Client Tunnels (R1.4)**:
   - *Observation*: Outbound Go agent daemons (R2.1) require a CGNAT-safe WSS endpoint on `apps/api` to communicate with the control plane, while Next.js UI clients (R1.5) require real-time log and metrics streaming.
   - *Deduction*: Adding HTTP upgrade routing in `apps/api/src/ws/router.ts` splits WSS traffic into two dedicated handlers:
     1. `AgentTunnelGateway` (`/api/v1/ws/agent`): Authenticates agent nodes via pairing tokens, manages active agent socket sessions, monitors heartbeats (30s timeout sweep), and routes bi-directional JSON frames (`HEARTBEAT`, `CMD_EXEC`, `CMD_RESP`, `LOG_LINE`, `METRICS`, `BACKUP_*`).
     2. `ClientStreamHub` (`/api/v1/ws/client`): Authenticates admin UI connections via JWT, manages topic subscriptions (`LOGS`, `METRICS`, `STATUS`), and broadcasts agent telemetry to subscribed dashboard clients.

---

## 3. Caveats

- **Dependency Installation**: Implementing Express and WebSocket servers requires adding `express`, `cors`, `ws`, `jsonwebtoken`, `bcryptjs`, and `zod` to `apps/api/package.json` and installing via `pnpm install`.
- **Node pairing secrets**: Initial agent node pairing in R1.4 uses pre-shared node secrets or node pairing tokens signed with `NODE_PAIRING_SECRET`.
- **In-Memory vs Database Persistence**: In R1.3/R1.4 development, `apps/api` routes operate cleanly against `@mc-admin/db` (which exports both Prisma Client and `MemoryDatabase` fallback for Vitest).

---

## 4. Conclusion

The complete technical blueprint for REST API & Auth (R1.3) and WebSocket Agent & Client Tunnels (R1.4) has been formulated and written to `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_m1_2\analysis.md`.

### Summary of Architectural Deliverables in `analysis.md`:
1. **`@mc-admin/auth` Enhancement**: JWT token signing (`signJwt`), token verification (`verifyJwt`), bcrypt password hashing (`hashPassword`/`comparePassword`), and updated `AuthSession` schema.
2. **REST API Routes (`apps/api`)**: Express server initialization with `auth.middleware.ts` (JWT auth & RBAC), `auth.routes.ts` (`/login`, `/me`, `/logout`), `server.routes.ts` (CRUD, power controls, RCON, backup triggers), and `node.routes.ts` (agent node pairing).
3. **WebSocket Tunnels (`apps/api`)**: HTTP `upgrade` gateway (`router.ts`), `AgentTunnelGateway` for CGNAT-safe Go daemon outbound WSS tunnel (`/api/v1/ws/agent`), and `ClientStreamHub` for real-time dashboard log/metrics streaming (`/api/v1/ws/client`).

---

## 5. Verification Method

To independently verify the recommendations and design for R1.3 and R1.4:

1. **Inspect Analysis Blueprint File**:
   - `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_m1_2\analysis.md`

2. **Verify Monorepo Build & Package Types**:
   ```bash
   pnpm build
   ```

3. **Verify API & Auth Test Suites (upon implementation)**:
   ```bash
   pnpm --filter @mc-admin/auth test
   pnpm --filter @mc-admin/api test
   ```

4. **Invalidation Conditions**:
   - Changes to JWT payload schema or role hierarchy without updating `@mc-admin/auth`.
   - Modifying WebSocket frame contract JSON fields without updating Go agent daemon (`apps/agent`) framing.
