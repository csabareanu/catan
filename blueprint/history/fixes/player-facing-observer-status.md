# Player-facing observer status

**Type:** Fix

**Fixes:** F-16, F-24

## The problem

The observer receives a viewer-safe public frame, but the sidebar does not turn
its public state into useful player-facing information. A user cannot see the
current phase, whose turn it is, or the public score and award information that
the replay projection already provides. Generic state details would expose the
shape of the API without explaining what is happening in the game.

## The fix

- Add a small typed presentation boundary for the supported public frame fields
  in `apps/web/src/features/replay`, narrowing untrusted `public_state` values
  before rendering them.
- Render a compact game status section with human-readable phase, turn phase,
  and active player labels resolved from the existing seat context.
- Enhance player cards with available public scores, award labels, and a clear
  active-turn marker. Omit unavailable or malformed optional values rather than
  inventing scores or rules.
- Keep hidden viewer data, resources, development cards, and other seats'
  private information out of the UI. Leave board piece overlays and replay
  stepping for the planned state-stepping and game-rule work.
- Keep the existing API contract, board renderer, history list, responsive
  drawer behavior, and developer details intact.

## Build steps

- [x] **Render public game status and player summaries** - add safe public-state
  mapping, player-facing status and score or award presentation, responsive
  styling, and focused observer coverage.
   - **Done when:** a fixture with public phase, turn, active seat, scores, and
     awards shows readable labels and values; the active player is identified;
     missing optional fields render without errors; private fields remain absent;
     and desktop and mobile observer layouts retain their current viewport and
     drawer behavior.
- [x] **Make optional public-status coverage viewport-aware** - repair the
  missing-field observer test so it exercises a control that is visible at its
  chosen viewport and reaches the intended assertion.
   - **Done when:** the focused observer suite passes, the missing optional
     public-status case verifies its empty state, and the existing desktop and
     mobile drawer coverage remains intact.

## Verify

- Run the focused observer Playwright tests with a representative public frame
  containing multiple seats and public scores.
- Run the focused observer Playwright test for a frame without optional public
  status fields at a viewport where its chosen navigation control is visible.
- Run `cd apps/web && npm run lint` and `cd apps/web && npm run build`.
- Open an authenticated observed game at `/games/:gameId/observe` and confirm
  that the status and player cards explain the saved public state without raw
  field names or private data.

## Findings

### player-facing-observer-status/F-16 [P2] closed - Public game information is displayed as field counts

**File:** apps/web/src/features/replay/GameObserver.tsx:435
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** public_scores becomes "4 visible" instead of actual public
scores, active_seat_number becomes "Seat 2" instead of the player's identity,
and roads/buildings become aggregate recorded counts. The observer receives
useful projected data but presents its structure rather than what is happening
in the game. BoardSvg receives context.board only, so a public road in a frame
does not appear on the map. That static-board boundary is explicit in 4b and
is not a regression; it needs an intentional next-step design before replay.
**Suggested fix:** Render explicit player cards using available public names,
public scores, turn/phase, and awards when supported. Keep hidden VP and other
seats' holdings private. Design piece overlays on stable API edge/vertex IDs
for the relevant board-state feature, alongside planned 4c stepping. Do not
infer missing state or reconstruct game rules in React. Keep generic field
inspection optional for development.
**Resolution:** Closed on 2026-10-18 by `/audit F16`. Re-review confirmed that
the React observer narrows supported public frame fields before rendering
readable phase, turn, active-player, score, and award information. Player cards
identify the active seat and the authenticated human seat when applicable.
Missing or malformed optional values are omitted safely, and private resources,
development cards, and hidden scores remain outside the UI. Board piece
overlays and replay stepping remain deferred to their planned features. The
populated-status assertions passed, and lint and the production build passed.
The separate missing-status browser case exposed an independent fixture issue,
recorded as F-24, because it tried to open a mobile-only control at the default
desktop viewport; that did not reintroduce the original F-16 defect.

### player-facing-observer-status/F-24 [P2] closed - Optional public status coverage uses a hidden desktop control

**File:** apps/web/e2e/game-observer.spec.ts:335
**Found:** 2026-10-18 by /audit (scope: F16)
**Why it matters:** The focused observer suite failed before reaching the
missing-status assertion. The test used Playwright's default Desktop Chrome
viewport, but the `Game details` toggle is hidden above the mobile breakpoint,
so the test waited 30 seconds for a button that could not appear. The optional
public-status behavior therefore had no passing browser evidence in the suite.
**Suggested fix:** Either set a phone-sized viewport for this test so it can
exercise the drawer, or assert the status panel directly at desktop width and
keep drawer interaction in the existing mobile test. Re-run the focused suite
and retain the missing-field assertion.
**Resolution:** Closed on 2026-10-18 by `/audit F24`. Re-review confirmed that
the test asserts the desktop-visible status panel directly instead of clicking
the mobile-only drawer toggle. Its empty-status fixture omits phase, turn,
active-seat, scores, and awards together, so the assertion reaches the intended
empty state. The focused observer suite passes 14/14 tests, and lint, build,
and TypeScript checking pass. Existing mobile drawer coverage remains intact.
