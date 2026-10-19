# Fix: Make seed validation feedback announce once

**Type:** Fix

**Fixes:** F-10

## The problem

When board generation rejects a seed with a validation response, the game
creation screen renders the same failure in two assertive `role="alert"`
regions: the setup note and the board feedback panel. Assistive technology may
announce the error twice, even though the detailed setup note already tells the
player to open Advanced options.

## The fix

Keep the detailed seed validation message as the single assertive alert. Render
the matching board-panel message as a polite status update for seed validation
responses, while preserving an assertive alert for service and unexpected
generation failures. Add browser coverage for both paths and preserve the
visible error text, retry action, collapsed Advanced options summary, and form
state.

## Build steps

- [x] Separate assertive seed errors from polite board status.
  **Done when:** a rejected seed produces exactly one visible `role="alert"`,
  the board panel uses a polite status role for that same validation response,
  non-validation generation failures remain assertive alerts, and the existing
  creation flow tests continue to pass.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npx playwright test e2e/game-creation.spec.ts`

## Findings

### seed-validation-feedback-announcement/F-10 [P3] closed - One seed rejection exposes two alert regions

**File:** apps/web/src/features/games/GameCreationScreen.tsx:161, 328, 467
**Found:** 2026-10-19 by /audit (scope: current)
**Why it matters:** A seed 422 updated both the setup callout and the board
failure panel, each with `role="alert"`. The browser confirmed both alert
regions were present for the same failure. Screen readers could announce the
generic board error and the detailed seed error back-to-back; the exact impact
varied by assistive technology and was not tested with a screen reader.
**Suggested fix:** Verify the flow with a screen reader. If the two alerts are
announced redundantly, keep the exact setup error as the alert and expose the
board-panel status as a polite status update for seed validation failures.
**Resolution:** 2026-10-19 implementation approved and marked `fixed`. Seed
validation responses now keep the detailed setup feedback as the single
assertive alert while exposing the matching board-panel message as a polite
status update. Service and unexpected generation failures remain assertive
alerts. Browser coverage verifies the one-alert behaviour and both error
paths; the focused creation suite passed 18/18 tests, the broader frontend
suite passed 99 tests, and lint, build, and diff checks passed. A later
`/audit F-10` re-reviewed the repaired component and browser coverage on
2026-10-19. The focused creation suite passed 18/18 tests, lint and build
passed, and no new issue was found in scope. Closed by `/audit F-10`.
