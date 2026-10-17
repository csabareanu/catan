# Consistent account menu dismissal and focus

**Type:** Fix

**Fixes:** F-15

**Status:** complete

## The problem

The authenticated account disclosure closes on outside pointer interaction and
Escape, but Escape leaves focus on the now-hidden account menu content instead
of returning focus to the account trigger. F-15's game-menu portion is already
repaired by the prior delete-modal fix; this slice addresses the remaining
account-menu focus behavior and keeps disclosure interactions consistent.

The change belongs in the React authenticated header and its existing browser
coverage. It does not involve API contracts, authentication semantics, game
deletion, Go, or Laravel.

## The fix

- retain outside pointer dismissal for the account menu;
- return focus to the account trigger when Escape closes it;
- signal clickable controls consistently with a pointer cursor while preserving
  disabled and loading cursor states;
- ensure clicking outside closes the menu without leaving focus on hidden menu
  content;
- preserve the repaired game-menu outside/Escape dismissal and trigger focus;
- add focused browser coverage for account-menu open, outside dismissal, Escape
  dismissal, and focus restoration;
- do not add a UI dependency or redesign the existing menu.

## Build steps

### 1. [x] Make account-menu dismissal and affordance consistent

Add the account trigger ref and focus restoration to `AuthShell.tsx`, define a
consistent clickable-control cursor in the global styles, make the account
chevron's hover affordance clear, then extend the relevant Playwright coverage.

*Done when:* an authenticated user can open the account menu, clicking outside
closes it, Escape closes it and returns focus to the account trigger, enabled
clickable controls signal their interaction affordance, disabled controls keep
their waiting or unavailable state, and the existing game-menu behavior and
sign-out flow remain intact.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run focused auth/session browser tests, likely:
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/auth.spec.ts e2e/session-routes.spec.ts`.
- Run the focused game-library suite:
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-library.spec.ts`.
- Run `git diff --check`.

## Findings

### consistent-account-menu-dismissal-and-focus/F-15 [P2] closed - Disclosure menus have inconsistent dismissal and focus behavior

**File:** apps/web/src/features/games/GameLibrary.tsx:235
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** Game menus are native details without the account menu's
outside-click/Escape handling. Browser reproduction leaves the delete menu
open after both actions. Separately, focusing Sign out and pressing Escape
closes the account details but leaves document.activeElement on that hidden
button (AuthShell.tsx:76). Multiple destructive menus can remain open, and
keyboard users lose a visible focus location. The menu is no longer clipped;
this is an interaction defect rather than a repeat of the old layout finding.
**Suggested fix:** Apply consistent controlled disclosure behavior: dismiss on
outside interaction and Escape, close a previous game menu when opening another,
and restore focus to the trigger when Escape closes a menu from within it.
Keep deletion confirmation and existing API handling. Test keyboard and pointer
paths without imposing an unnecessary component dependency.
**Resolution:** Repaired 2026-10-16 on the F-15 fix branch. The authenticated
account menu now restores focus to its trigger after Escape, keeps outside
dismissal, and signals enabled clickable controls with a pointer cursor and
clear account-chevron hover state. The existing game-menu dismissal and trigger
focus behavior remains covered by browser tests. Re-audited 2026-10-16: the
related 25-test browser suite passed, lint and build passed, disabled cursor
states remain intact, and no new issue was found in the reviewed files. Closed.
