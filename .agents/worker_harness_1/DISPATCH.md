# Task: Build E2E Test Harness Mocks

## Working Directory
`c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\worker_harness_1`

## Required Reading
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\TEST_INFRA.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_3\handoff.md`

## Instructions
Design and build the full E2E test harness mocks in `packages/e2e/src/harness/`:
1. `MockAgentServer.ts`: Simulates Go agent WebSocket server for `apps/agent`. Handles message framing (`HEARTBEAT`, `CMD_EXEC`, `LOG_LINE`, `METRICS`, `BACKUP_START`, `BACKUP_PROGRESS`, `BACKUP_COMPLETE`), container lifecycle states, telemetry generation, and `allowlist.json` atomic file synchronization.
2. `MockBdsLogStreamer.ts`: Simulates BDS stdout log streams. Generates formatted stdout lines for player join/leave (`Player connected: <gamertag>, xuid: <xuid>`), RCON command outputs, and server startup/shutdown logs.
3. `MockXboxService.ts`: Simulates Xbox Live / OpenXBL API endpoints. Resolves Gamertags to 64-bit XUIDs and records dispatches of Xbox Live Friend Bot invitations.
4. `MockDnsProvider.ts`: Simulates Cloudflare DNS allocation. Tracks A and SRV record dispatches for subdomain routing (`abc123.play.bedrockops.io`).
5. `index.ts`: Export all mock services cleanly.

## Testing & Verification
- Compile `packages/e2e` via `pnpm --filter @mc-admin/e2e build`.
- Add a unit test for the harness in `packages/e2e/src/harness/harness.test.ts` and run `pnpm --filter @mc-admin/e2e test`.

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. Integrity violations WILL be detected and your work WILL be rejected.
