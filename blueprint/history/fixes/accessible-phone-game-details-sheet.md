# Accessible phone game details sheet

**Type:** Fix

**Fixes:** F-21

**Status:** complete

## The problem

On phone-sized observer screens, the Players and History sidebar becomes a
bottom sheet with a full-screen backdrop. It currently has no dialog semantics,
no internal close control, and no focus management. Opening it leaves keyboard
focus on the covered Game details trigger. Keyboard navigation can reach the
backdrop and controls behind the sheet, and Escape closes the sheet without
restoring focus to the trigger.

The defect is in the React observer shell and its responsive styles. It does
not involve the replay API, board data, or game rules.

## The fix

Make the phone details sheet an accessible modal interaction while preserving
the desktop sidebar:

- mark the open phone sheet as a dialog with an accessible name and modal
  semantics;
- add a visible Close details control inside the sheet;
- move focus to the sheet's close control when it opens;
- keep keyboard focus inside the open sheet and remove the backdrop from the
  tab order;
- close through Escape, the internal close control, or the backdrop;
- restore focus to the Game details trigger after every close path;
- keep the mobile observer header in one row with clear spacing before the
  board;
- keep the existing desktop sidebar, player/history content, board rendering,
  replay polling, and API contract unchanged;
- do not add a UI dependency or implement replay/game rules in React.

## Build steps

### 1. [x] Make the phone details sheet accessible

Update the observer component and responsive styles, then add focused browser
coverage for opening, keyboard navigation, and dismissal.

*Done when:* at a phone viewport the open details sheet exposes dialog semantics,
focus starts inside the sheet, Tab does not move behind the backdrop, Escape,
backdrop click, and the internal Close details control all close it, and focus
returns to the Game details trigger. The back link and game heading remain on
one row with visible spacing before the board. Desktop observer behavior and
the existing board, history, loading, error, and authentication flows remain
unchanged.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-observer.spec.ts`.
- Run the full `cd apps/web && npm run test:e2e` suite.
- Manually open `/games/{gameId}/observe` at a phone-sized viewport, open
  Game details, press Tab and Escape, click the backdrop, and use the internal
  Close details control. Confirm focus never moves behind the sheet and returns
  to the trigger after closing.

## Findings

### accessible-phone-game-details-sheet/F-21 [P2] closed - Phone details overlay leaves keyboard focus behind its backdrop

**File:** apps/web/src/features/replay/GameObserver.tsx:211
**Found:** 2026-10-16 by /audit (scope: observer page and current F-09 work)
**Why it matters:** The phone panel visually behaves as a modal sheet but is
an aside with a full-screen button backdrop and no modal semantics or contained
focus. Opening it leaves focus on the covered toggle. At 390x844, Tab reaches
the backdrop, then the scrollable aside, then the document and obscured brand
link. Escape from the backdrop removes that focused button and leaves focus on
BODY instead of the Game details trigger. The sheet also has no visible internal
close button; its Close details toggle is underneath the backdrop. This is a
new observer interaction defect, distinct from the existing menu finding F-15.
**Suggested fix:** Give the phone sheet appropriate dialog behavior, an internal
Close control, initial focus, keyboard containment and focus restoration to
the trigger on Escape, backdrop or close-button dismissal. A native dialog can
provide the modal behavior without a new dependency. Alternatively make it a
true modeless disclosure without a blocking backdrop. Verify the keyboard path,
not only whether the trigger and panel exist.
**Resolution:** Implemented on the active fix branch. The open phone sheet now
uses dialog and modal semantics, moves focus to its internal Close details
control, traps Tab navigation inside the rendered sheet, excludes the backdrop
from the tab order, and restores focus to the Game details trigger after
Escape, backdrop, and close-button dismissal. The mobile observer header also
keeps its back link and game heading aligned with clear spacing before the
board.

**Re-review:** 2026-10-16 focused observer coverage passed 10/10, including
dialog semantics, initial focus, keyboard containment, Escape, backdrop, and
internal close-button dismissal. Lint, production build, and the serial full
frontend suite passed. This targeted audit confirmed the original defect is
gone and found no new issue in the repaired interaction. Closed.
