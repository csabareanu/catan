# Correct the board-preview destination

**Type:** Fix

**Fixes:** F-06

**Status:** complete

## The problem

On `/games/new`, the “Return to board preview” link pointed to `/`, which opened
the welcome page. The board preview is at `/preview`, so the link label sent
players to the wrong destination.

## The fix

- Point the game-creation link to `/preview`.
- Add browser coverage confirming the link opens the board preview.
- Leave the welcome-page route and other navigation unchanged.

## Build steps

### 1. [x] Correct and cover the board-preview link

Update the link in `GameCreationScreen` and add the destination assertion to
the game-creation browser tests.

**Done when:** Clicking “Return to board preview” from `/games/new` opens
`/preview` and displays the board preview.

## Verify

- From `apps/web`, run `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npm run test:e2e -- e2e/game-creation.spec.ts`.
- Run `npm run lint` and `npm run build` from `apps/web`.
- Run `git diff --check`.
- Manually open `/games/new`, click “Return to board preview”, and confirm the
  `/preview` screen loads and can generate a board.

## Findings

### correct-board-preview-destination/F-06 [P3] closed - The creation screen's board-preview link opens the welcome page

**File:** apps/web/src/features/games/GameCreationScreen.tsx:522
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** Return to board preview linked to `/`, while the board
preview lives at `/preview`. Browser navigation confirmed the link went to the
welcome route. The label promised a different destination and added a detour
for someone trying to inspect a board.
**Suggested fix:** Point an explicit board-demo link at `/preview`, or label
the `/` destination Home. Reconsider whether a separate demo escape link is
useful once F-01 provides a preview within game setup. Cover the retained
link's actual destination in the creation browser test.
**Resolution:** Updated the link to `/preview` and added a browser test for
navigation and board generation. Re-reviewed on 2026-10-19: the link opens the
preview screen and the board can be generated there. All 18 game-creation
browser tests passed; no related regression was found.
