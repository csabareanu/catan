# Accessible delete confirmation modal

**Type:** Fix

**Fixes:** F-19

**Status:** complete

## The problem

The private game library uses the browser's native `window.confirm()` dialog
before deleting a saved game. Its appearance does not match the product, and
the message does not explain that the saved game and its history are permanently
removed. The current deletion request and pagination correction behavior should
remain unchanged.

The change belongs in the React game library and its existing styles and
browser coverage. It does not involve the Laravel delete endpoint, the Go
engine, or game rules.

## The fix

Replace the native confirmation with a styled, accessible modal using the
existing frontend platform and theme:

- open the modal from the selected game's row action;
- identify the game in the title, for example `Delete Game 42?`;
- explain that the saved game and its history will be permanently deleted;
- provide Cancel and clearly destructive Delete game actions;
- move initial focus to Cancel, contain keyboard focus while the modal is open,
  and close on Escape or backdrop cancellation;
- show pending deletion state and prevent duplicate submissions;
- keep the modal open with an inline error if the delete request fails;
- remove the row only after the existing delete request returns successfully;
- restore focus to the originating row action after cancellation, success, or
  failure where that action still exists;
- close the three-dot game action menu when the user clicks outside it or
  presses Escape, returning focus to its trigger when Escape closes it;
- preserve owner authorization, pagination refresh behavior, logout handling,
  responsive layout, and the existing API contract;
- do not add a UI dependency or move deletion logic into another service.

The menu dismissal portion of F-15 is included in this slice. The remaining
cross-menu focus consistency work stays tracked in F-15 for a later review.

## Build steps

### 1. [x] Add the accessible delete confirmation modal

Update the game library component and styles, then add focused browser coverage
for the modal's opening, cancellation, keyboard behavior, pending state, error
state, and successful deletion.

*Done when:* clicking a row's Delete game action opens the themed modal instead
of a browser dialog; the modal names the selected game and explains permanent
deletion; Cancel, Escape, and backdrop dismissal leave the game intact; focus
starts on Cancel and remains within the modal while it is open; Delete game
disables duplicate submission, keeps the modal open on an API error, and removes
the row only after a successful response; focus returns to the row action when
possible. The three-dot game action menu closes on outside pointer interaction
and Escape, with Escape returning focus to its trigger. Existing library
loading, pagination, responsive layout, logout, and owner-scoped deletion
behavior remain intact.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run the focused game library browser tests with
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/game-library.spec.ts`.
- Run the full frontend browser suite with
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- --workers=1`.
- Manually open `/games`, open a game's action menu, and check the modal on a
  desktop and phone viewport. Confirm Cancel, Escape, backdrop dismissal,
  pending deletion, an API error, and successful deletion behave as specified.

## Findings

### accessible-delete-confirmation-modal/F-19 [P3] closed - Delete confirmation uses a generic browser dialog

**File:** apps/web/src/features/games/GameLibrary.tsx:475
**Found:** 2026-10-16 by /audit (scope: full browser UI, user follow-up)
**Why it matters:** The current window.confirm correctly requires confirmation,
but its browser-controlled appearance differs from the product and the message
only asks whether to delete a game ID. It does not explain that the saved game
and its history are permanently removed. The user explicitly requested a
styled confirmation modal as part of the professional UI direction. This is a
presentation refinement, not a missing deletion guard.
**Suggested fix:** Use an accessible modal matching the theme, titled
"Delete Game {id}?", with a concise permanent-deletion explanation, Cancel,
and a clearly destructive Delete game button. Focus Cancel initially, contain
keyboard focus while open, allow Escape/backdrop cancellation before submission,
and return focus to a sensible library control on dismissal. Show pending
progress, prevent duplicate submissions, and retain the modal with an inline
error if deletion fails. Remove the row only after HTTP 204. Use the existing
platform, such as a styled HTML dialog, without requiring a new UI dependency.
**Resolution:** Re-examined 2026-10-16 by /audit (scope: F-19). Confirmed that
the browser dialog is gone and the themed modal names the game, explains
permanent deletion, manages initial focus and keyboard/backdrop dismissal,
prevents duplicate submissions, preserves inline errors, and removes the row
only after a successful delete response. The focused game-library browser test
and the full frontend suite passed, including modal focus containment and
focus restoration. The finding is closed; the related broader menu work stays
open in F-15.
