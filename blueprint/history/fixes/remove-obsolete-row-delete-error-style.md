# Remove obsolete row delete error style

**Type:** Fix

**Fixes:** F-20

**Status:** complete

## The problem

`apps/web/src/App.css` still contains the `.library-delete-error` rule from the
old inline row-level delete error. Delete failures now render inside the
accessible confirmation modal, and no JSX element uses that selector. The stale
rule adds dead presentation code to the game library stylesheet.

## The fix

Remove the unused `.library-delete-error` declaration from `apps/web/src/App.css`.
Keep the modal's `.delete-modal-error` styles and all deletion behavior,
accessibility handling, API contracts, and responsive library styling unchanged.
Do not add a replacement selector or refactor unrelated styles.

## Build steps

### 1. [x] Remove the stale library delete error rule

Delete the unused CSS declaration and confirm that no source file still refers
to `.library-delete-error`.

*Done when:* the obsolete selector is absent, the modal error styling remains,
and the game library continues to compile and pass its focused browser tests.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run the focused game library browser tests with
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-library.spec.ts`.
- Run `git diff --check`.

## Findings

### remove-obsolete-row-delete-error-style/F-20 [P3] closed - Obsolete row delete error style remains

**File:** apps/web/src/App.css:898
**Found:** 2026-10-16 by /audit (scope: F-19 re-audit)
**Why it matters:** The `.library-delete-error` selector has no remaining JSX
consumer after delete errors moved into the modal. Keeping the unused rule
leaves stale presentation code that can mislead future changes to the library.
**Suggested fix:** Remove the unused `.library-delete-error` declaration after
confirming no row-level delete error is intended to return.
**Resolution:** Re-examined 2026-10-16 by `/audit` on the active fix branch.
Confirmed that `.library-delete-error` has no remaining source reference, the
modal's `.delete-modal-error` rule remains in use, and the repaired stylesheet
introduces no new issue. Lint, production build, focused game-library tests
(18/18), and `git diff --check` passed. Closed.
