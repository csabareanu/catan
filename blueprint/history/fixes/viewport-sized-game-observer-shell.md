# Viewport-sized game observer shell

**Type:** Fix

**Fixes:** F-09

**Status:** complete

## Design reference

The reviewed observer draft in `prototypes/observer.html` and the captured
desktop references in `blueprint/reference/` define the visual target for this
fix. The live screen keeps the existing server-driven board renderer and its
flat terrain palette, while adopting the draft's compact toolbar, centered
viewport frame, single players and history sidebar, and collapsed supporting
details.

## The problem

The authenticated observer uses the shared padded page and card layout. Its
header, board, and stacked information panels make the document much taller
than the viewport, so users must scroll repeatedly to inspect the board and
history. On narrow screens, the secondary information begins below the board
and the observer is not suitable as the foundation for replay navigation.

## The fix

Create a dedicated responsive shell for the current observer and future replay
screen:

- use the available viewport below the authenticated top bar;
- keep a compact observer header and reserve space for future replay controls;
- let the desktop board use the available width and height beside a bounded
  information panel;
- keep desktop navigation and game status compact, remove duplicate board
  headings and nested card padding, and move the board guide into the sidebar;
- fit the complete map and ports without stretching the ocean across the
  entire desktop column; verify rendered map size as well as container bounds;
- keep panel content independently scrollable when it exceeds the available
  height;
- present secondary information through a compact phone-friendly panel or
  disclosure so the board remains the primary view;
- preserve the existing API contract, authentication states, board topology,
  and server-provided data without adding replay logic or game rules to React.

The likely implementation surface is the observer component, its stylesheet,
and focused browser assertions. This fix does not add timeline stepping or
redesign the player-facing information, which remain separate work.

## Build steps

### 1. [x] Fit the observer to the viewport

Update the observer layout and responsive styles, then add focused browser
coverage for the target desktop and phone viewports.

Done when the observer keeps the board and primary controls within the
available viewport, the document does not require page-level scrolling at the
target viewports, any overflow is contained in the intended information panel,
and existing loading, error, authentication, and board-rendering behavior
still works.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run `cd apps/web && npm run test:e2e`.
- Manually inspect `/games/{gameId}/observe` at desktop and phone-sized
  viewports, confirming that the board remains the primary visible surface and
  the information panel is reachable without repeatedly scrolling the document.

## Implementation evidence

- Desktop now uses compact navigation and a single game toolbar. Board help
  moves into a sidebar disclosure, and the ocean keeps the map's proportions.
- Browser screenshots of the running development frontend use an actual
  engine-generated standard board with mocked identity and replay responses.
  At 1366x680, rendered terrain height increased from about 159px to 390px;
  at 1920x912, it increased from about 319px to 555px.
- Desktop assertions cover 1024x768, 1366x680, 1366x768, and 1920x912,
  including terrain size, all nine ports, undistorted tokens, contained
  overflow, and independent sidebar interaction.
- Frontend lint, build, and all 55 Playwright tests pass. The browser command
  uses `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright` in this environment.
- User approved the visual implementation after desktop and portrait review.
- F-09 was re-reviewed and closed by `/audit` on 2026-10-16. The related
  desktop composition finding F-20 was also closed by that audit.

## Findings

### viewport-sized-game-observer-shell/F-09 [P2] closed - Game and observer layout requires document scrolling

**File:** apps/web/src/App.css:905
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The observer inherited the padded form/card shell, a tall
header, nested board panel, and vertically stacked inspection panels. With a
full board and representative public state, the document required repeated
scrolling to inspect the board and history.
**Suggested fix:** Give game/observer/replay routes a dedicated viewport-sized
shell. Fit the board to both available width and height, reserve a compact
toolbar, use a bounded desktop side panel, and use drawers or bottom sheets on
phones while keeping panel overflow independent.
**Resolution:** Closed 2026-10-16 after re-reviewing the committed observer
implementation. At 1366x680, 1920x912, and 2560x1080 the document remains the
viewport height, the board and sidebar share the same bottom edge, and the
measured board-to-sidebar gap is 23px. At 390x844, 844x390, and 320x568 the
board keeps a non-zero, usable aspect-ratio-sized canvas and the details sheet
remains reachable without document scrolling. The sidebar still owns its own
overflow for longer history. Label scale and phone focus behavior remain
tracked separately by F-12/F-21.

### viewport-sized-game-observer-shell/F-20 [P2] closed - Unbounded desktop frame separates the map from its sidebar

**File:** apps/web/src/App.css:2601 (current observer layout; original rules at :1088)
**Found:** 2026-10-16 by /audit (scope: observer page and current F-09 work)
**Why it matters:** The original observer assigned remaining width to a board
column while the SVG preserved the map aspect ratio, leaving large empty gaps
between the map and sidebar on wide screens.
**Suggested fix:** Center a shared content frame around the map and bounded
sidebar, align the toolbar and navigation to it, and size the board from its
aspect ratio and available height.
**Resolution:** Closed 2026-10-16 after browser re-review. The observer now
uses a bounded frame sized from the available viewport height, aligns the
toolbar and navigation to that frame, and keeps the board/sidebar gap at 23px
in the 1366x680, 1920x912, and 2560x1080 checks. The map grows with the
available height without leaving the previous desktop-sized empty gap.
