# Improve board resource-label contrast

**Type:** Fix

**Fixes:** F-03

**Status:** complete

## The problem

Resource names on forest, hills, and mountain hexes use a pale foreground over
mid-tone terrain. The measured text contrast is about 3:1, below the 4.5:1
target for ordinary text. This is most noticeable when the board is fitted on
a phone. The issue is in the shared SVG board styling, so it affects both
preview and observer screens.

## The fix

- Give those three resource labels a dedicated dark foreground that reaches
  at least 4.5:1 contrast against their rendered tile fills.
- Preserve the terrain palette, resource symbols, number tokens, board
  geometry, and existing zoom behavior. Darken text first; add no backing
  unless implementation proves a readable text color cannot meet the target.
- Keep the change in the shared board style so preview and observer receive
  the same improvement.

## Build steps

### 1. [x] Improve and verify terrain resource labels

Set a sufficiently dark label color for forest, hills, and mountain hexes.
Add browser regression coverage that calculates contrast from the actual
computed SVG label and tile colors. Check the labels in fitted desktop and
phone views and after zooming, without changing other board presentation.

**Done when:** Lumber, Brick, and Ore labels each meet a minimum 4.5:1
computed contrast ratio in the browser; labels remain present and usable in
the fitted and zoomed board views; and the focused frontend checks pass.

**Result:** The measured ratios are 4.77:1 for Lumber, 5.05:1 for Brick,
and 5.07:1 for Ore. The preview browser test covers desktop and phone at
fitted and zoomed sizes.

## Verify

- From `apps/web`, run `npm run test:e2e -- e2e/preview.spec.ts`.
- Visually inspect the preview board at desktop and phone sizes, both fitted
  and zoomed. The observer uses the shared board CSS.
- Run `npm run lint` and `npm run build` from `apps/web`.
- Run `git diff --check`.

## Findings

### board-resource-label-contrast/F-03 [P2] closed - Resource labels have insufficient contrast on three terrain types

**File:** apps/web/src/App.css:2056;
apps/web/src/features/board/BoardSvg.tsx:336
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Pale resource text is placed directly on the brighter
forest, hills, and mountains fills. Contrast calculated from Chromium's
computed SVG colours is approximately 3.01:1 for Lumber, 2.84:1 for Brick,
and 2.83:1 for Ore. The fitted labels rendered at about 9.8 CSS pixels on
desktop and 4.5 pixels on a 390px phone; they are not large text. These
labels convey game information, so the ordinary-text contrast benchmark is
4.5:1. Existing tests check distinct fills and viewport behaviour, but do not
catch these foreground/background combinations. Zoom helps size, but does
not correct the colour contrast. This is distinct from the archived work
that added zoom and resource encoding.
**Suggested fix:** Use sufficiently dark resource text for these fills or
give labels a contrasting backing. Preserve redundant symbols and labels.
Verify actual computed colours and the phone fitted/zoomed states. Carry
the same readability criteria into both future map styles, with numbers,
roads, buildings, and highlights remaining visually clear over artwork.
**Resolution:** Re-examined in the F-03 implementation branch. The original
low-contrast styling is removed; computed contrast is 4.77:1 for Lumber,
5.05:1 for Brick, and 5.07:1 for Ore. The Playwright regression test covers
fitted and zoomed desktop and phone views. All 14 preview browser tests,
frontend lint, and production build pass. The shared CSS selector also
applies to the observer board. Closed by /audit on 2026-10-19 (scope: current).
