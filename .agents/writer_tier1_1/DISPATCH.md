# Task: Implement Tier 1 Feature Coverage E2E Tests

## Working Directory
`c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\writer_tier1_1`

## Required Reading
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\TEST_INFRA.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_3\handoff.md`

## Instructions
Expand `packages/e2e/src/tier1-feature-coverage.test.ts` to contain at least 5 comprehensive E2E tests for EVERY feature from R1.1 to R5.3 (90+ tests total).
Import harness mocks from `packages/e2e/src/harness` (`MockAgentServer`, `MockBdsLogStreamer`, `MockXboxService`, `MockDnsProvider`).

Coverage targets:
- R1.1 Database Schema (5+ tests)
- R1.2 HostProvider Abstraction (5+ tests)
- R1.3 REST API Backend & JWT Auth (5+ tests)
- R1.4 WebSocket Agent Tunnel & Gateway (5+ tests)
- R1.5 Next.js Admin Dashboard Data Contracts (5+ tests)
- R2.1 Outbound WSS Go Daemon Agent (5+ tests)
- R2.2 BDS Container & Process Lifecycle (5+ tests)
- R2.3 Telemetry Collection Engine (5+ tests)
- R2.4 RCON Client & Log Streamer (5+ tests)
- R3.1 Save-Hold Live Checkpoint Sequence (5+ tests)
- R3.2 Zero-Disk Streaming Compression (5+ tests)
- R3.3 Integrity Manifest Verification (5+ tests)
- R4.1 Player XUID & Gamertag Tracking (5+ tests)
- R4.2 Persistent Infraction Ledger (5+ tests)
- R4.3 BDS allowlist.json Auto-Sync (5+ tests)
- R5.1 Subdomain & Port Allocation (5+ tests)
- R5.2 Console Player Onboarding (5+ tests)
- R5.3 Automated Setup Pipelines (5+ tests)

## Verification
- Run `pnpm --filter @mc-admin/e2e test` and ensure 100% pass rate.

## Integrity Warning
DO NOT CHEAT. All test implementations must be genuine and execute actual logic or harness calls. DO NOT hardcode trivial passes. Integrity violations WILL be detected.
