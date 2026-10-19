# Give the surrounding sea clearer visual identity

**Type:** Fix

**Fixes:** F-07

**Status:** complete

## The problem

The water around the board is a uniform blue rounded rectangle. It separates
from the land, but reads more like a canvas than a body of water.

## The fix

- Add subtle depth through a sea gradient, restrained wave marks, and a light
  shallow-water band along the island's coastline.
- Keep these details decorative and behind the terrain and ports. Derive the
  coastline from the existing board geometry; do not change canonical topology,
  input targets, or game state.
- Apply the treatment in the shared SVG board so preview and observer stay
  consistent. Preserve compact framing and port/resource-label readability at
  desktop and phone sizes.
- Leave alternate illustrated styles and map settings for a future slice.

## Build steps

### 1. [x] Add restrained sea depth and coastline detail

Update the shared SVG renderer and its styles with a layered sea treatment.

**Done when:** The sea reads as water through visible but subtle depth and wave
cues, with a shallow edge around the island; board framing, ports, and resource
labels remain clear when fitted and zoomed on desktop and phone screens.

## Verify

- From `apps/web`, run
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npm run test:e2e -- e2e/preview.spec.ts e2e/game-observer.spec.ts`.
- Run `npm run lint` and `npm run build`.
- Use `/check` to inspect screenshots of the preview and observer boards at
  desktop and phone sizes, including fitted and zoomed views.
- Run `git diff --check`.

## Findings

### surrounding-sea-visual-identity/F-07 [P3] closed - The sea has colour but little visual identity as water

**File:** apps/web/src/features/board/BoardSvg.tsx:137;
apps/web/src/App.css:2008
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** The island sits on a uniformly filled rounded rectangle
using computed colour `rgb(36, 93, 110)`. The sea is distinguishable from
land, but the observer has no visible waves, shoreline, shallow-water band,
or depth cues. At desktop and phone sizes it reads as a board canvas rather
than the body of water requested by the user. This is a visual refinement
against the new art direction, not a broken gameplay or API contract.
**Suggested fix:** Add restrained wave marks, a light coastal/shallow-water
edge, and a deeper-water gradient. Apply a clean treatment to the current
style and a richer treatment to a future illustrated style. Preserve the
current compact island framing and port readability; increasing empty ocean
width would undo the earlier desktop layout improvements. Keep decorative
effects separate from topology, input targets, and canonical state.
**Resolution:** Added a shared SVG sea gradient and wave texture, with a
shallow-water rim derived from tile edges used by only one hex. The decoration
stays behind the terrain and ports and does not change board topology or game
state. Re-audit confirmed the finding is resolved. The preview browser test
verifies the 30-edge standard-board coastline; the preview and observer browser
suites, lint, and production build pass. Desktop and phone browser screenshots
show the sea treatment in both preview and observer views.
