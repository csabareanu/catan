# Consolidate observer layout styles

**Type:** Fix

**Fixes:** F-22

**Status:** complete

## The problem

The observer layout in `apps/web/src/App.css` is defined in multiple competing
stylesheet blocks. The later viewport repair rules currently win through CSS
source order, but future edits can easily change the older superseded block and
silently reintroduce layout regressions. The current desktop, tablet, and phone
appearance must remain unchanged.

## The fix

Consolidate the observer shell, content, cards, board, sidebar, and mobile
drawer rules into one clearly owned section of `App.css`. Remove superseded
declarations and keep the observer layout variables, base selectors, and
responsive overrides together. Preserve the existing accessibility behavior,
viewport sizing, board geometry, and phone details-sheet behavior. Do not change
API contracts, replay behavior, or unrelated route styles.

## Build steps

### 1. [x] Consolidate observer CSS rules

- Move the effective observer layout declarations into one coherent section.
- Remove duplicate or superseded observer declarations from the older sections.
- Keep selectors and responsive overrides understandable without relying on
  accidental source-order conflicts.

**Done when:** the observer has one owned CSS rule set, existing observer
behavior is preserved at desktop, tablet, and phone sizes, and no duplicate
competing observer layout rules remain.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-observer.spec.ts`
- `git diff --check`
- Manually inspect the observer at desktop and phone widths, including the
  details sheet and its focus behavior.

## Findings

### consolidate-observer-layout-styles/F-22 [P3] closed - Observer layout is implemented by competing CSS rule sets

**File:** apps/web/src/App.css:905-1376, 2283-2490, 2601-3199
**Found:** 2026-10-16 by /audit (scope: F-09 implementation)
**Why it matters:** The viewport repair appends a second, full observer layout
stylesheet after the original observer rules. Selectors such as
`.observer-shell`, `.observer-content`, `.observer-card`, `.observer-layout`,
`.observer-board`, `.observer-sidebar`, and the mobile drawer rules now occur
in both generations. The later block correctly wins for the checked viewports,
but future edits must understand the cascade order and can easily update the
older superseded block, creating a silent layout regression. This is a
maintainability risk; no current viewport failure was attributed to it in this
audit.
**Suggested fix:** Consolidate the observer rules into one owned section or a
dedicated stylesheet, remove superseded declarations, and keep the desktop and
mobile layout variables beside the selectors they control. Retain the current
browser geometry checks while simplifying the cascade.
**Resolution:** Consolidated the observer layout into one owned CSS section in
`apps/web/src/App.css`, moved the loading/error and board-guide visibility rules
into that section, and removed the superseded observer declarations. The React
component and API contract were unchanged. Lint, production build, focused
observer tests (10/10), serial full frontend tests (55/55), and `git diff
--check` passed. Desktop and phone layouts were manually inspected.

**Re-review:** 2026-10-16 targeted `/audit F-22` confirmed that no observer CSS
rules remain before the consolidated section and that the repaired desktop and
phone layout behavior remains covered. Lint, production build, focused observer
tests (10/10), serial full frontend tests (55/55), and `git diff --check`
passed. No new issue was introduced by the repair. Closed.
