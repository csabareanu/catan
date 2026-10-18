# Extract board viewport interactions

**Type:** Fix

**Fixes:** F-23

**Status:** complete

## The problem

`BoardSvg` currently combines board layout and SVG presentation with the full
viewport interaction system: zoom state, fit and pan calculations, wheel
binding, keyboard controls, mouse dragging, touch panning, pinch zoom, and
double-tap detection. The roughly 485-line component repeats view-update logic
across several event paths, which makes interaction changes harder to review
and leaves the behavior without an isolated boundary before replay timeline
work begins.

## The fix

- Extract the viewport state, refs, coordinate transforms, zoom controls, and
  pointer, wheel, keyboard, and double-tap handlers into a focused
  `useBoardViewport` hook under `apps/web/src/features/board`.
- Keep `BoardSvg` responsible for board layout, SVG rendering, accessibility
  labels, controls, and help content. Preserve the current interaction
  semantics, fitted initial view, zoom around the pointer, focus behavior, and
  passive-listener protection.
- Add focused browser evidence for the extracted interaction boundary, including
  a pointer gesture and a touch zoom path, while keeping the existing board
  rendering and observer checks intact.

Do not change API contracts, game rules, replay reconstruction, board geometry,
or the visual design in this fix. Do not add a state-management or gesture
dependency.

## Build steps

### 1. [x] Extract the viewport interaction hook

Move the board viewport state and gesture orchestration into
`useBoardViewport`, then connect its returned ref, view state, controls, and
event handlers to `BoardSvg` without changing rendered behavior.

**Done when:** `BoardSvg` no longer owns the viewport gesture lifecycle or
coordinate update implementation; preview and observer pages still render the
same board; zoom buttons, fit, keyboard navigation, wheel zoom, pointer pan,
pinch zoom, and double-tap zoom retain their current behavior; and the hook
handles board seed changes without stale layout or view state.

### 2. [x] Add focused interaction evidence

Extend the existing Playwright coverage with a small pointer-pan assertion and
a touch zoom assertion against the public board preview or observer board. Keep
the assertions user-visible and verify that the board zoom status or fitted
view changes as expected without page-level overflow or console warnings.

**Done when:** the focused browser tests prove both interaction paths through
the rendered board, the existing wheel and keyboard checks still pass, and no
new passive-listener or uncaught browser errors appear.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/preview.spec.ts e2e/game-observer.spec.ts`
- Inspect the preview and observer board at desktop and phone dimensions to
  confirm the extracted interactions remain usable and the board does not
  introduce document-level overflow.

## Findings

### extract-board-viewport-interactions/F-23 [P2] closed - Board renderer combines presentation and gesture orchestration

**File:** apps/web/src/features/board/BoardSvg.tsx:120
**Found:** 2026-10-17 by /audit (scope: F-11/F-12 re-review)
**Why it matters:** `BoardSvg` now owns board layout construction, SVG
rendering, resource and port presentation, keyboard controls, native wheel
binding, mouse dragging, touch panning, pinch state, double-tap detection, and
zoom math in one roughly 485-line component. The native wheel path also repeats
view-update work that the button and pointer paths perform through separate
closures. This makes future replay interaction changes harder to review and
leaves gesture behavior without an isolated unit boundary.
**Suggested fix:** Extract a focused `useBoardViewport` or equivalent hook for
view state, gesture lifecycle, event binding, and shared transforms. Keep
`BoardSvg` responsible for rendering the board and controls, and add focused
pointer or pinch assertions around the extracted behavior before 4c grows the
interaction surface.
**Resolution:** Repair started 2026-10-18. Extracted the viewport state,
coordinate transforms, wheel binding, keyboard controls, pointer gestures,
pinch zoom, and double-tap zoom into
`apps/web/src/features/board/useBoardViewport.ts`. `BoardSvg` now owns the
board layout, SVG rendering, controls, and accessibility content while
retaining the existing viewport event wiring. Lint, build, and the focused
observer and preview interaction checks pass. Step 2 adds direct pointer-pan
and touch-zoom assertions, and the full preview and observer browser suite now
passes 27/27. The finding remained fixed until this audit re-reviewed the branch.

Re-reviewed 2026-10-18 on `fix/extract-board-viewport-interactions` against
`e9df21b..80bccbc`. `useBoardViewport` now owns the viewport state, coordinate
transforms, wheel binding, keyboard controls, pointer gestures, pinch zoom, and
double-tap zoom. `BoardSvg` retains board layout, SVG rendering, controls, and
accessibility content. Lint, build, and all 27 preview and observer browser
tests pass; the new pointer drag and touch double-tap assertions report no
document overflow or console errors. No regression or new defect was found in
the repaired renderer.
