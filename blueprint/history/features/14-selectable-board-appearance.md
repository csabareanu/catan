# Feature: Selectable board appearance

**From build-plan:** feature 14
**Status:** in progress (Step 3 complete)

## Goal

Let players choose between the existing Classic board and the approved
Illustrated board art. Remember the choice in this browser and apply it to every
screen that uses the shared board renderer, without changing the generated
board or game state.

## Design reference

- [Interactive approved prototype](../../prototypes/illustrated-board.html)
- [Desktop board](../reference/illustrated-board-desktop.png)
- [Phone board](../reference/illustrated-board-mobile.png)
- [Terrain detail view](../reference/illustrated-terrain-details.png)
- [Approved terrain atlas](../../prototypes/assets/terrain-atlas.png)
- [Art-generation prompt](../../prototypes/assets/terrain-atlas.prompt.md)

## In scope

- Keep Classic as the default and preserve it as a selectable appearance.
- Add a Settings button to the shared site header for visitors and signed-in
  players. Open a centered dialog on desktop and a bottom sheet on phones, with
  an accessible Classic/Illustrated choice under Board style. Keep appearance
  controls off the map.
- Store the selected appearance in browser `localStorage` so it survives reloads
  and applies consistently to the anonymous preview, new or saved setup, and
  game observer.
- Render the approved top-down terrain art for all six terrain types, with the
  approved visible coast and surrounding water treatment.
- Keep terrain names and resource symbols, number tokens and pips, ports,
  ownership or action overlays, and board controls legible over either style.
- Preserve the existing pan, wheel zoom, pinch zoom, and fit-board behaviour.
- Keep the approved prototype, reference captures, art atlas, and prompt in the
  repository while the production asset is integrated.

## Out of scope

- A standalone settings page, settings beyond Board style, account-synced
  preferences, or server-side appearance data.
- Changes to board topology, seed generation, game rules, API contracts, saved
  game state, or replay state.
- A second board renderer or a replacement of the existing Classic treatment.
- New maps, terrain types, gameplay pieces, or full-match mechanics.
- Reworking the application's global palette, navigation, or unrelated screens.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Shared appearance preference and selector** - add the accessible
  header Settings dialog and persist a validated Classic/Illustrated selection
  in browser storage, defaulting safely to Classic. *Done when:* the dialog is
  available to visitors and signed-in players, works with keyboard and phone
  layouts, and updates every mounted board immediately; the selected value
  survives reload and moving among preview, setup, and observer boards; the map
  has no appearance controls and no API request or game data changes when the
  choice is used.
- [x] **Step 2 - Illustrated terrain and responsive integration** - integrate the
  approved atlas into the shared SVG renderer, add the illustrated coastline
  treatment, and tune the artwork and existing overlays for desktop, phone, and
  zoomed views. *Done when:* all six terrain types use the approved art, Classic
  remains unchanged, board labels/tokens/ports/overlays stay readable, and the
  existing pan and zoom controls work at supported viewport sizes.
- [x] **Step 3 - Optimize the illustrated production atlas (F-10)** - serve an
  optimized WebP or AVIF derivative to the production renderer and board guide
  while preserving the approved source artwork in the prototype/reference
  material. Keep one cached atlas, safe fallback colors, and the Classic path
  unchanged. *Done when:* the production renderer and guide use the optimized
  derivative, its encoded size is materially below the current 3.7 MB PNG, all
  six terrain crops remain visually acceptable at fitted and maximum zoom, and
  the illustrated browser checks, lint, and build pass.

## Files / areas

- `apps/web/src/features/board/BoardSvg.tsx`, its appearance persistence helper,
  and `apps/web/src/features/settings/` for shared preferences and the dialog.
- `apps/web/src/main.tsx` and `apps/web/src/features/auth/AuthShell.tsx` for the
  shared preference provider and header entry.
- `apps/web/src/App.css` and the board's imported terrain atlas asset.
- `apps/web/e2e/settings.spec.ts`, `game-creation.spec.ts`, and
  `site-header.spec.ts` for dialog behavior, shared-route persistence, and header
  layout coverage.
- `prototypes/` and `blueprint/reference/` for the approved design source and
  captures.

## Data / contracts

No API, database, or engine contract changes. Persist one validated appearance
value (`classic` or `illustrated`) in browser `localStorage`; missing, invalid,
or unavailable storage must fall back to Classic.

## Testing

- Use the existing Playwright browser suite to verify the default, selection,
  persistence after reload, and consistency across preview, setup, and observer.
- Inspect desktop and phone screenshots in both appearances, including a zoomed
  view. Verify terrain art and coastline do not obscure tokens, ports, resource
  symbols, or interaction overlays.
- Run the focused browser specs, `npm run lint`, and `npm run build` from
  `apps/web`.
- No unit-test runner is configured; Playwright is the existing frontend test
  runner.

### Step 2 verification - 2026-10-19

- `npm run lint` and `npm run build`: passed.
- Focused illustrated-board checks: 6 passed, covering all terrain crops,
  Classic restoration, wheel zoom, pointer pan, two-finger pinch, and the
  observer and guide at desktop and phone widths.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- --grep-invert 'observes a real Compose game without API interception'`:
  112 passed. The separate Compose smoke test needs a configured token and
  numeric game ID and was not run.
- Production browser check at 1440x900, 390x844, 320x568, and 844x390:
  the bundled artwork loaded, fitted boards stayed within the viewport, and
  no console errors or failed requests were observed. API responses were
  intercepted fixtures; this is frontend evidence, not a new backend
  integration check.
- Review captures: `/tmp/catan-illustrated-desktop.png`,
  `/tmp/catan-illustrated-390.png`, and
  `/tmp/catan-illustrated-390-zoomed.png`.
- After user review, illustrated labels and number tokens moved upward, and
  resource names use normal capitalization with more padding. Lint, build,
  and the 6 focused browser checks passed again; desktop and phone captures
  were inspected. Updated captures:
  `/tmp/catan-illustrated-labels-desktop.png` and
  `/tmp/catan-illustrated-labels-mobile.png`.
- Step 2 was approved by the user after review of the illustrated desktop and
  phone captures.

### Step 3 verification - 2026-10-19

- Replaced the 3.70 MB production PNG copy with a 554 KB WebP derivative at
  quality 85. The approved PNG remains in `prototypes/assets/`.
- `npm run lint` and `npm run build`: passed. The production bundle emits one
  hashed terrain atlas WebP.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/board-appearance.spec.ts e2e/settings.spec.ts e2e/game-observer.spec.ts e2e/site-header.spec.ts`:
  30 passed. The checks cover all six crops, Classic restoration, the guide,
  wheel and touch zoom, pan, and responsive observer views.
- User approved the optimized asset after reviewing its visual detail.

### F-10 repair scope

- F-10 is the open P2 finding in `blueprint/context/findings.md`: the
  illustrated renderer currently downloads the original 3.7 MB PNG atlas.
- The repair is limited to the production asset format and its imports. It does
  not redesign the artwork, change board geometry, add a new dependency, or
  change the Classic appearance.
- Verify the browser requests the optimized asset once when Illustrated is
  selected, requests no atlas in Classic, and keeps the six terrain crops and
  guide swatches correct.

## Notes for the AI

- Follow `blueprint/context/coding-standards.md` and keep board presentation in
  React/SVG; Go remains authoritative for all game data and rules.
- Reuse the shared renderer rather than branching into separate board trees.
- Treat the prototype as a visual reference, not a source of game coordinates
  or rules. Continue rendering the exact API-provided board.
- Keep the browser preference local to this browser, not tied to an account.
- Preserve the current renderer's accessible labels and all viewport gestures.

## Findings

### 14-selectable-board-appearance/F-10 [P2] closed - Illustrated boards download the original 3.7 MB PNG atlas

**File:** apps/web/src/features/board/BoardTerrainPatterns.tsx:1;
apps/web/src/features/board/BoardSvg.tsx:17;
apps/web/src/assets/terrain-atlas.webp
**Found:** 2026-10-19 by /audit (scope: Feature 14/current)
**Why it matters:** The production renderer imports the full 1536x1024
generated PNG, weighing 3,698,688 bytes. A fresh browser downloaded it once
when Illustrated was selected; Classic made no atlas request. Under Chromium
network emulation at 1.6 Mbps and 150 ms latency, the atlas transfer took
18,652 ms, and selection through image decoding took 18,755 ms. This is a
substantial avoidable first-load cost on a constrained connection. These
times are a simulated local measurement, not production user telemetry.
**Suggested fix:** Keep the approved original in the prototype/reference
material, and serve an optimized WebP or AVIF derivative from the production
renderer and guide. Compare all six crops at fitted and maximum zoom before
choosing the compression level. Retain the current single cached atlas and
safe fallback colors; the artwork itself does not need a redesign.
**Resolution:** Replaced the production atlas with a 554,064-byte WebP
derivative at quality 85 and removed the unused production PNG copy. The
approved 3,698,688-byte PNG remains in `prototypes/assets/` as the source
artwork. The renderer and board guide now share the WebP URL, while Classic
still renders without an atlas request. Browser coverage verifies one logical
asset path, no PNG request, all six crops, and the guide; lint and production
build passed. Re-reviewed on 2026-10-19 by `/audit` with the repaired source,
production bundle, and 30 focused browser tests; the original performance
defect is gone and no new issue was found. Closed.
