# Fix: Remove impossible lifecycle status branch

**Type:** Fix
**Fixes:** F-09
**Status:** complete

## The problem

`useGameLibrary` treated `GameSummary.lifecycle_status` as possibly `null` when
reconciling a status update. The TypeScript model requires a valid
`GameLifecycleStatus`, and the API response validator rejects `null`, so the
`previousStatus === null` branch was unreachable. It added dead logic to
lifecycle reconciliation without changing runtime behavior.

## The fix

Remove only the impossible `previousStatus === null` comparison and preserve the
existing equality early return, category-count updates, status filtering, and
polling behavior. Keep the API contract and lifecycle status types unchanged.

## Build steps

- [x] **Remove the unreachable null guard** - simplify the early-return
  condition in `useGameLibrary`. *Done when:* the impossible null branch is gone,
  valid lifecycle transitions retain their current behavior, and the existing
  frontend checks pass.

### Verification - 2026-10-19

- Removed the unreachable `previousStatus === null` comparison while preserving
  lifecycle category updates, status filtering, counts, and polling behavior.
- `cd apps/web && npm run lint`: passed.
- `cd apps/web && npm run build`: passed.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-library.spec.ts e2e/game-run.spec.ts`: 37 passed.
- The user approved the implementation after reviewing the diff and checks.
- `/audit F09`: no new issue found; F-09 closed.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-library.spec.ts e2e/game-run.spec.ts`
- Confirm the library still moves games between status views and updates counts
  when a lifecycle status changes.

## Findings

### remove-impossible-lifecycle-status-branch/F-09 [P3] closed - Lifecycle reconciliation checks for an impossible null status

**File:** apps/web/src/features/games/useGameLibrary.ts:209
**Found:** 2026-10-18 by /audit (scope: F-08 repair)
**Why it mattered:** `GameSummary.lifecycle_status` is a required
`GameLifecycleStatus`, and the API response validator rejects values outside
that status union. The `previousStatus === null` branch could never run,
leaving an unnecessary condition in lifecycle reconciliation.
**Resolution:** Removed the unreachable null comparison. The 37 focused browser
tests, lint, and build passed. The F-09 re-audit on 2026-10-19 confirmed the
branch was gone, surrounding reconciliation was unchanged, and no new issue
was found.
