## 2026-08-06T08:57:53Z
<USER_REQUEST>
You are the Implementer Worker agent for Milestone 1 (M1: Control Plane, Database Schema & HostProvider Layer).
Your working directory is c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_worker_m1_1.
Your parent conversation ID is d4bc7d5f-b6c6-450e-893b-cbc1e7cb8869.

Mandatory Inputs - Read these files FIRST:
- c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md
- c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md
- c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\AGENTS.md
- c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\sub_orch_m1\SCOPE.md
- Explorer 1 Handoff: c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_m1_1\handoff.md (and analysis.md)
- Explorer 2 Handoff: c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_m1_2\handoff.md (and analysis.md)
- Explorer 3 Handoff: c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_m1_3\handoff.md (and analysis.md)

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Tasks:
Implement all Milestone 1 features (R1.1 - R1.5):

1. R1.1 Database Schema with Prisma ORM in `packages/db`:
   - Create `packages/db/prisma/schema.prisma` with Prisma ORM models (`User`, `AgentNode`, `BedrockServer`, `ConnectionKey`, `ServerMember`, `BackupRecord`, `ModerationAction`, `AuditLog`, `BdsVersion`, `ServerTemplate`, `Pipeline`, `PipelineRun`).
   - Add `@prisma/client` to dependencies and `prisma` to devDependencies in `packages/db/package.json`.
   - Export Prisma Client singleton from `packages/db/src/client.ts` and maintain `MemoryDatabase` compatibility in `packages/db/src/index.ts`.

2. R1.2 HostProvider Strategy Pattern Layer in `packages/bedrock`:
   - Implement `packages/bedrock/src/provider.ts` with `HostProvider` strategy pattern interface (`ServerMetrics`, `BackupTriggerOptions`, `BackupResult`), concrete strategies (`DockerAgentHostProvider`, `PterodactylHostProvider`, `DirectRconSshHostProvider`), and `HostProviderFactory`.
   - Export host provider interface and factory in `packages/bedrock/src/index.ts`.

3. R1.3 REST API Backend & JWT Auth in `packages/auth` and `apps/api`:
   - Enhance `packages/auth` with JWT signing/verification (`signJwt`, `verifyJwt`) and password hashing (`hashPassword`, `comparePassword`).
   - Add necessary dependencies to `apps/api/package.json` (`express`, `cors`, `ws`, `jsonwebtoken`, `bcryptjs`, `zod`, `@types/...`). Run `pnpm install` if needed.
   - Implement Express backend routes (`/auth`, `/servers`, `/nodes`, `/backups`, `/moderation`, `/audit`), Zod validation, JWT authentication middleware, RBAC middleware, and structured audit logging (`AuditLogger.record`).

4. R1.4 WebSocket Agent & Client Tunnels in `apps/api`:
   - Implement HTTP upgrade router (`apps/api/src/ws/router.ts`).
   - Implement `AgentTunnelGateway` (`/api/v1/ws/agent`) for CGNAT-safe Go daemon outbound WSS tunnel connection with heartbeat monitoring and JSON framing.
   - Implement `ClientStreamHub` (`/api/v1/ws/client`) for real-time dashboard log and metrics streaming.

5. R1.5 Next.js Admin Dashboard UI in `packages/ui` and `apps/web`:
   - Export modular design system components (`Button`, `Badge`, `Card`, `Modal`, `ConfirmModal`, `Table`, `Input`) from `packages/ui/src/index.ts`.
   - Refactor/Build Next.js admin dashboard UI in `apps/web/src/components/` (`ServerCard`, `ServerGrid`, `NodeManagementView`, `BackupManagementView`, `ModerationLedgerView`, `AuditTrailView`, `ConsoleModal`, `RegisterServerModal`, `RegisterNodeModal`).
   - Connect dashboard UI to backend REST and WS endpoints via `apps/web/src/lib/apiClient.ts`.

6. Build & Test Verification:
   - Run unit/integration tests for affected packages.
   - Run `pnpm test` and ensure 100% tests pass.
   - Run `pnpm build` and ensure all packages and apps build with zero errors.

Write your change details in `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_worker_m1_1\changes.md` and complete your handoff report in `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_worker_m1_1\handoff.md`. Send a message to parent when finished.
</USER_REQUEST>
