# Close the observer browser evidence gap

**Type:** Fix

**Fixes:** F-17

**Status:** complete

## The problem

The observer now uses a representative engine-generated board and has broad
mocked browser coverage, but F-17 remains open because the smallest target
phone viewport is not exercised explicitly and the mocked suite does not prove
the authenticated create, run, observe, and cleanup flow against the Compose
stack. The existing pagination, legend, menu, and desktop composition checks
should remain intact while the remaining evidence is made reproducible.

## The fix

- Add focused observer coverage at 320x568 that checks the real board fixture,
  viewport bounds, reachable details controls, and phone-sheet focus restoration.
- Add a separate opt-in real-stack browser smoke path that uses disposable
  authenticated game data and no API interception. Document what this path
  proves, keep it distinct from the fast mocked Playwright suite, and make it
  fail clearly when the Compose services or observer flow do not work.
- Keep production behavior, API contracts, the existing full-board fixture, and
  the library pagination and legend assertions unchanged unless the new
  evidence exposes a real usability defect. Do not refactor `BoardSvg` or start
  replay navigation work.

## Build steps

### 1. [x] Cover the smallest observer viewport

Extend the focused observer browser tests and make only the responsive changes
needed for the 320x568 case.

**Done when:** the representative 19-hex board is visible at 320x568 without
page-level horizontal overflow; the back and details controls remain reachable;
the details sheet opens, keeps keyboard focus inside, and restores focus to its
trigger after Escape or backdrop dismissal; and the existing observer checks
continue to pass.

### 2. [x] Add a separate real-Compose observer smoke path

Create a documented, opt-in browser smoke command for the running Compose
stack. It should create a disposable account and game, start the game through
the real API and worker, open the real web observer without route interception,
confirm the board and lifecycle state, and clean up the disposable game or
identity when the run completes. Keep this path separate from the default
mocked Playwright suite so local UI tests stay fast and deterministic.

**Done when:** one documented command returns a failing exit status when the
real authenticated observer flow is broken, passes against the development
Compose stack, and states clearly which backend lifecycle and browser rendering
behaviors it verifies.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-observer.spec.ts`
- Run the documented real-Compose observer smoke command.
- Inspect the 320x568 observer viewport and confirm the board and details flow
  remain usable without page-level scrolling.

## Findings

### close-observer-browser-evidence-gap/F-17 [P2] closed - Browser evidence misses realistic board and viewport usability

**File:** apps/web/e2e/game-observer.spec.ts:65
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The observer fixture contains one hex, no edges, and no
ports. Assertions check SVG presence and horizontal scrollWidth only; a tall,
unreadable real 19-hex board still passes. Library fixtures use empty links/meta,
so pagination loss is invisible. The prior Compose visual script also used a
one-hex private fixture with intercepted responses. All 44 tests pass while
F-05 and F-08 through F-12 remain reproducible. Mocked private screenshots do
not prove the active spec's real authentication/create/run/observe/delete flow.
**Suggested fix:** Add representative full-board fixtures and behavioral
assertions for the agreed viewport layout, reachable controls, breakpoint
collisions, pagination, legend meaning, and menu focus. Keep a small real-stack
smoke flow distinct from API-mocked browser tests and record which evidence was
actually obtained. Do not equate CSS nowrap or SVG visibility with usability.
**Resolution:** Re-examined 2026-10-16. The observer now uses an actual
engine-generated 19-hex, 72-edge, 9-port fixture and checks desktop terrain
height, port bounds, token proportions, sidebar scrolling, and the corrected
desktop composition. The focused observer suite passes 10/10 and the serial
full frontend suite passes 55/55. The mocked tests still do not establish the
real-stack flow, do not test 320x568, and do not verify focus restoration for
the phone sheet. Keep open for that broader evidence.

Repair started 2026-10-18. Added a real-browser 320x568 observer test using the
engine-generated 19-hex fixture. It verifies that the board, back link, and
details trigger remain reachable without document overflow, and that the phone
details sheet keeps focus contained and restores focus after Escape and backdrop
dismissal. The focused observer suite passes 15/15, with lint and build also
passing. The real-Compose browser smoke path now passes against the running
Compose stack without API interception. It verifies the authenticated observer,
running lifecycle label, 19 rendered hexes, 9 ports, 3 players, and no API or
browser console errors, then deletes the disposable game and revokes its token.

Re-reviewed 2026-10-18 on `fix/close-observer-browser-evidence-gap` against
`591b5ca..6634790`. The repaired browser evidence is present in the committed
branch delta. The 320x568 observer test passes with no document overflow and
verifies Escape and backdrop focus restoration. The real Compose smoke created
game 64, reached `running`, rendered the authenticated observer without route
interception, passed its board, player, API, and console assertions, and removed
the temporary game afterward. No new defect was found in the reviewed files.
