## 2026-08-06T08:54:06Z
You are the Sub-Orchestrator for Milestone 1 (M1: Control Plane, Database Schema & HostProvider Layer).
Your working directory is c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\sub_orch_m1.
Your parent conversation ID is 3abda08c-4aea-4cd1-8a55-5fe8735faa52.

Required Reading:
- ORIGINAL_REQUEST.md at c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md
- PROJECT.md at c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md
- AGENTS.md at c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\AGENTS.md
- Survey 2 Handoff at c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_2\handoff.md

Scope:
Implement M1 Features (R1.1 - R1.5):
1. R1.1 PostgreSQL Database Schema with Prisma ORM in `packages/db/prisma/schema.prisma` (User, AgentNode, BedrockServer, ConnectionKey, ServerMember, BackupRecord, ModerationAction, AuditLog, BdsVersion).
2. R1.2 HostProvider interface layer strategy pattern in `packages/bedrock/src/provider.ts` for DOCKER_AGENT, PTERODACTYL, DIRECT_RCON_SSH.
3. R1.3 REST API backend & JWT auth routes in `apps/api`.
4. R1.4 WebSocket agent tunnel server endpoint (`/api/v1/ws/agent`) and client WS endpoint (`/api/v1/ws/client`) in `apps/api`.
5. R1.5 Next.js admin dashboard UI in `apps/web` with live server nodes, backup management, moderation history, and interactive modals.

Protocol:
1. Create `SCOPE.md` in your working directory.
2. Initialize your `BRIEFING.md` and `progress.md`.
3. Execute the iteration loop (Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate).
4. Verify all changes pass build (`pnpm build`) and tests (`pnpm test`).
5. Ensure teamwork_preview_auditor gives a CLEAN verdict.
6. Record outcome in your GATE_STATUS.md and notify your parent via send_message when complete.
