# Cover board keyboard viewport controls

**Type:** Fix

**Fixes:** F-24

**Status:** complete

## The problem

`useBoardViewport` supports keyboard controls on the focusable board viewport,
including zoom, arrow-key panning, page panning, and `Home` to restore the
fitted view. The browser suite covers the board buttons, wheel zoom, pointer
dragging, and touch double-tap zoom, but it does not exercise these keyboard
paths. A regression could therefore weaken keyboard accessibility while the
existing checks continue to pass.

## The fix

- Add one focused Playwright test beside the existing board interaction tests.
- Focus the rendered board viewport, verify keyboard zoom changes the zoom
  status, verify keyboard panning changes the SVG view box, and verify `Home`
  restores the original fitted view.
- Keep the test user-visible and confirm that keyboard interaction does not
  introduce horizontal document or board-shell overflow or browser console
  errors.
- Preserve the existing viewport behavior, board rendering, API contracts,
  game rules, and touch or pointer interactions. Change the hook only if the
  new browser evidence exposes an actual regression.

## Build steps

### 1. [x] Add keyboard viewport browser coverage

Extend the preview or observer browser coverage with keyboard zoom, panning,
and reset assertions against the rendered board. Use the existing deterministic
board fixture and selectors so the test verifies the public interaction rather
than implementation details.

**Done when:** The focused browser test proves that a focused board responds to
keyboard zoom and pan controls, `Home` returns the SVG to its initial fitted
view, no horizontal document or board-shell overflow appears, and no uncaught
console errors are reported. Existing preview and observer interaction tests
remain green.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/preview.spec.ts e2e/game-observer.spec.ts`
- `git diff --check`

## Findings

### cover-board-keyboard-viewport-controls/F-24 [P2] closed - Board keyboard viewport controls lack browser coverage

**File:** apps/web/src/features/board/useBoardViewport.ts:234
**Found:** 2026-10-18 by /audit (scope: current)
**Why it matters:** The extracted hook handles `Home`, `+`, `-`, arrow, and
Page navigation for the focused board viewport, but the current Playwright
suite did not exercise those paths. A regression in keyboard zoom or panning
could therefore pass the build, lint, wheel, pointer, and touch assertions while
weakening the board's keyboard accessibility behavior.
**Suggested fix:** Add a focused browser test that focuses the board viewport,
uses the keyboard zoom and pan controls, verifies the SVG view changes, and
confirms `Home` restores the fitted view. Keep the test next to the existing
preview or observer interaction coverage.
**Resolution:** Repaired on `fix/cover-board-keyboard-viewport-controls` by
adding a Playwright test for keyboard zoom, arrow and page panning, and `Home`
reset against the rendered preview board. Re-reviewed on 2026-10-18 against
the repaired test and `useBoardViewport` keyboard handler. Lint, build, and
the focused preview and observer browser suite pass 28/28. The test confirms
the SVG view changes, `Home` restores the fitted view, horizontal containment
holds, and no console or page errors occur. No regression or new defect was
found in the reviewed scope.
