# Route metadata and tab branding

**Type:** Fix

**Fixes:** F-18

## The problem

Every browser route currently inherits the preview-only title and description
from `apps/web/index.html`. This makes authentication, the private game
library, game creation, and an observed game difficult to identify in browser
tabs and history. The linked tab icon is also an older geometric C mark rather
than the approved medieval keep and island emblem used by the application
header.

## The fix

- Replace the generic default title and description with concise product-level
  metadata.
- Add a small route-aware metadata helper in the React client that updates the
  document title and description when the pathname changes. Cover the landing,
  sign-in, registration, preview, game library, new-game, and observed-game
  paths. Include the observed game identifier in its title and use a safe
  fallback for unknown paths.
- Replace the existing `/catan-mark.svg` tab asset with a compact standalone
  SVG based on the approved medieval keep, battlements, arched door, island,
  and current dark-gold palette. Keep the existing favicon link working and do
  not introduce an image or icon dependency.
- Leave gameplay, navigation, authorization, and the existing header emblem
  unchanged.

## Build steps

- [x] **Implement route metadata and the approved tab mark** - update the HTML
   defaults, add route-aware title and description behavior, replace the
   linked tab SVG, and add focused browser coverage.
   - **Done when:** each supported route exposes its own title and description
     after direct navigation and client-side navigation, observed-game titles
     include the game ID, unknown paths use the fallback metadata, and the
     favicon link resolves to the new keep mark without console errors.

## Verify

- Run the focused Playwright metadata test against the public, authenticated,
  preview, creation, and observed-game paths.
- Run `cd apps/web && npm run lint` and `cd apps/web && npm run build`.
- Inspect the title, description, and favicon link in browser developer tools
  on desktop and a narrow viewport.

## Findings

### route-metadata-and-tab-branding/F-18 [P3] closed - All routes retain preview-only browser metadata

**File:** apps/web/index.html:9
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** Login, registration, library, creation, and observer all use
the title Catan · Seeded Board Preview and the description of a stateless board
preview. Browser inspection confirms unchanged titles across routes. Tabs and
history do not identify the active task, and the metadata understates the app.
**Suggested fix:** Set concise route-specific titles, including the game
identifier in observer/replay views, and a product-appropriate default
description. This does not require adding a routing or metadata library.
**Resolution:** Closed 2026-10-18 after `/audit F18` re-review on
fix/route-metadata-and-tab-branding. The React client applies route-specific
titles and descriptions, including observed game identifiers and a safe
fallback. The default HTML metadata is product-appropriate, and the linked
catan-mark.svg uses the approved medieval keep and island emblem. Focused
Playwright coverage verifies direct routes, client-side pathname changes, the
favicon asset, and the absence of browser console errors. `npm run lint`,
`npm run build`, and `git diff --check` also pass. No new issue was identified
in this focused scope.
