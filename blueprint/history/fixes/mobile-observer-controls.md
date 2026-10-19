# Make mobile observer controls compact and clear

**Type:** Fix

**Fixes:** F-11

**Status:** complete

## The problem

On a 320px observer screen, the full zoom toolbar covers a port badge in the
fitted view. The mobile observer also needs a clearer, more descriptive way to
open the side panel without giving the map a separate toolbar row.

## The fix

On mobile, keep the controls over the board so the map keeps its full surface.
Show a compact `Overview` pill in the upper-right corner. Keep the zoom
controls in the lower-right corner, but show only `+` while the board is fitted;
reveal `−` and `Fit` after button, wheel, or touch zooming. Desktop keeps the
existing full control set and layout.

## Build steps

### 1. [x] Restore mobile observer overlays and add browser coverage

Restore the observer controls to the board overlay, add the compact `Overview`
label, and cover fitted, zoomed, reset, touch, desktop, and narrow viewport
behaviour in browser tests.

**Done when:** At 320x568, `Overview` and the single fitted-view `+` do not
overlap any visible port badge; zooming reveals `−`, `Fit`, and `+`; fitting
the board hides the secondary controls again; the fitted board remains at
least as large as before; touch gestures and desktop observer behavior
continue to work without page overflow.

## Verify

- `cd apps/web && npm run lint` passed.
- `cd apps/web && npm run build` passed.
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npx playwright test e2e/game-observer.spec.ts --grep-invert 'Compose game'` passed, 15 tests.
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npx playwright test --grep-invert 'Compose game'` passed, 99 tests.
- The 320x568 fitted observer screenshot was captured and inspected at `apps/web/test-results/game-observer-keeps-the-ob-af4bc-st-supported-phone-viewport-chromium/observer-320.png`.

## Findings

### mobile-observer-controls/F-11 [P3] closed - Mobile board controls overlap a port label

**File:** apps/web/src/App.css:2268; apps/web/src/features/board/BoardSvg.tsx:197
**Found:** 2026-10-19 by /audit (scope: F-07 board renderer)
**Why it matters:** The fitted mobile zoom toolbar covered part of a coastal
port badge, hiding trade-ratio information.
**Suggested fix:** Choose a responsive toolbar placement or compact layout that
keeps port labels visible at supported phone widths while preserving access to
the zoom controls.
**Resolution:** Closed by /audit on 2026-10-19 after the fitted mobile view
was rechecked with browser geometry assertions and the 320x568 screenshot.
