# Task: Implement Tier 3 Cross-Feature & Tier 4 Real-World E2E Tests

## Working Directory
`c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\writer_tier3_4_1`

## Required Reading
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\ORIGINAL_REQUEST.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\PROJECT.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\TEST_INFRA.md`
- `c:\Users\white\OneDrive\Documents\GitHub\Minecraft Admin\.agents\teamwork_preview_explorer_survey_3\handoff.md`

## Instructions
Expand `packages/e2e/src/tier3-cross-feature.test.ts` and `packages/e2e/src/tier4-real-world.test.ts`:
1. `tier3-cross-feature.test.ts`: Add at least 20 comprehensive pairwise cross-feature interaction tests testing multi-domain integration (setup + lifecycle + backup + notifications, moderation + save-hold + history search + Discord, console onboarding + XUID lookup + allowlist sync + friend bot + join stream, etc.).
2. `tier4-real-world.test.ts`: Add at least 10 realistic end-to-end application scenario tests corresponding to the 10 real-world scenarios specified in `TEST_INFRA.md`.

Import harness mocks from `packages/e2e/src/harness`.

## Verification
- Run `pnpm --filter @mc-admin/e2e test` and ensure 100% pass rate.

## Integrity Warning
DO NOT CHEAT. All test implementations must be genuine. Integrity violations WILL be detected.
