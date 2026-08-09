# Task: Implement Tier 2 Boundary & Corner Cases E2E Tests

## Working Directory
`c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\writer_tier2_1`

## Required Reading
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\TEST_INFRA.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_3\handoff.md`

## Instructions
Expand `packages/e2e/src/tier2-boundary-corner.test.ts` to contain at least 5 boundary, edge case, and error handling tests for EVERY feature from R1.1 to R5.3 (90+ tests total).
Import harness mocks from `packages/e2e/src/harness` (`MockAgentServer`, `MockBdsLogStreamer`, `MockXboxService`, `MockDnsProvider`).

Coverage targets:
- Boundary cases, null/empty values, malformed inputs, error conditions, duplicate XUIDs, soft-delete filtering, port pool exhaustion (19132-19999 limits), invalid RCON responses, corrupted backup manifests, network disconnects/reconnects, expired bans/mutes, invalid JWT tokens, missing permissions, etc.

## Verification
- Run `pnpm --filter @mc-admin/e2e test` and ensure 100% pass rate.

## Integrity Warning
DO NOT CHEAT. All test implementations must be genuine. Integrity violations WILL be detected.
