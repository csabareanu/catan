# Board resource encoding and responsive readability

**Type:** Fix

**Fixes:** F-11, F-12

**Status:** complete

## The problem

- The terrain legend in `apps/web/src/features/board/BoardSvg.tsx` reuses SVG
  terrain classes on HTML swatches. Those classes set SVG fill, so the HTML
  swatches render with transparent backgrounds and do not explain the board.
- The board currently relies on small terrain words, number tokens, and text
  port badges. At narrow observer and preview viewports, the complete SVG scales
  down until those labels are difficult to read, and there is no accessible way
  to inspect a board area more closely.
- The visual treatment should remain data-driven and player-facing without
  moving game rules, production calculations, or canonical state into React.

## The fix

- Add typed presentation metadata for the existing terrain and resource values,
  including resource symbols, readable labels, desert's no-production state,
  and explicit colors or patterns for both SVG tiles and HTML guide swatches.
- Update the board tiles, number tokens, ports, and board guide so resource
  identity remains understandable through symbols, text alternatives, and
  subtle terrain treatment rather than color alone. Keep the guide compact and
  secondary to the board while making every swatch visibly meaningful.
- Add a responsive board viewport for the SVG. The board should remain fitted
  and composed by default, while enlarged views pan inside the fixed board
  stage instead of moving the document. Support keyboard controls,
  pointer-centered wheel zoom, mouse dragging, touch panning, pinch zooming,
  double-tap zooming, and a compact fit action without exposing
  implementation details to players.
- Preserve the existing board coordinates, API contract, accessibility titles,
  high-probability token treatment, and observer data boundaries. The client
  may present known values, but it must not calculate legal moves, production,
  scores, or private state.

## Build steps

### 1. [x] Make terrain and resource identity legible

Update the board renderer and its styles so every terrain has a visible guide
swatch, a consistent resource symbol or no-production marker, a text label, and
an accessible description. Use the same visual vocabulary for the tile and its
guide entry, keep port ratios readable, and preserve the existing board data
contract.

**Done when:** the preview and observer show distinct non-transparent guide
swatches, meaningful resource symbols or text alternatives, readable token and
port labels at the supported desktop composition, and focused frontend checks
pass.

### 2. [x] Add scrollable board inspection

Add a fixed board viewport with keyboard-accessible zoom and fit controls,
pointer-centered wheel zoom and dragging for enlarged desktop views, and touch
gestures for narrow preview and observer viewports. Keep the default board
fitted and place the compact controls over the board surface without covering
important content.

**Done when:** desktop and narrow viewport browser checks prove that the board
is visible, the controls are reachable, pointer-centered wheel and double-tap
zoom are observable, dragging and touch pinch can pan the view, fit returns to
the composed view, and terrain, number, and port information can be inspected
without unreadable default labels or document-level overflow.

### 3. [x] Repair mobile gesture and header regressions

Keep wheel zoom cancelable without a passive-listener console warning, and keep
the authenticated observer header readable on narrow phone viewports by
preserving the account control while removing nonessential account text.

**Done when:** the focused browser checks observe wheel zoom without the passive
listener warning, and the observer navigation links do not overlap the account
control at a 412px phone viewport.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run test:e2e -- e2e/preview.spec.ts e2e/game-observer.spec.ts`
- Capture manual browser evidence for the preview and observer at a desktop
  viewport and at a narrow mobile viewport, including the default, zoomed, and
  reset board states.

## Findings

### board-resource-encoding-and-responsive-readability/F-11 [P2] closed - Terrain legend has transparent color swatches

**File:** apps/web/src/features/board/BoardSvg.tsx and apps/web/src/App.css
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The HTML legend swatches reused SVG terrain classes, so
their backgrounds computed as transparent and the legend did not provide a
usable color key.
**Suggested fix:** Give the swatches explicit board-scoped backgrounds and
pair each terrain with its resource meaning so the guide remains useful.
**Resolution:** The board resource encoding step added explicit swatch
backgrounds, resource symbols, and readable output descriptions. Preview and
observer checks confirmed that the swatches are visibly distinct. Closed by
/audit on 2026-10-17.

### board-resource-encoding-and-responsive-readability/F-12 [P2] closed - Full-board labels become unreadable on smaller screens

**File:** apps/web/src/features/board/BoardSvg.tsx and apps/web/src/App.css
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The full board scaled terrain, number, and port labels down
to impractical sizes on narrow viewports, and there was no way to inspect a
board area without scrolling the document.
**Suggested fix:** Combine resource symbols and higher-contrast presentation
with an accessible board viewport that supports focused inspection while
preserving the existing board data boundary.
**Resolution:** The board now uses readable resource and port presentation,
a fixed viewport, keyboard and compact controls, pointer-centered wheel zoom,
dragging, double-tap zoom, and touch gestures. The mobile guide is available
through its details drawer, and the full frontend browser suite passed 61/61.
Closed by /audit on 2026-10-17.
