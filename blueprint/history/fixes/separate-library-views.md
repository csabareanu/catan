# Separate saved setups, active games, and history in My games

**Type:** Fix

**Fixes:** F-02, F-08

## The problem

`/games` currently presents every owner-scoped lifecycle status in one
chronological list. Saved setups, active or recoverable runs, and completed
history compete for the same space and use control-plane labels that make the
next player action unclear. Client-side grouping alone would be incorrect
because the API is paginated and a category can be split across pages.

## The fix

- Keep `/games` as the single authenticated library destination and add clear
  Saved setups, In progress, and History views or tabs.
- Define the status mapping at the API boundary: `created` is a saved setup;
  `queued`, `running`, `awaiting_human_input` (persisted currently as
  `awaiting human input`), and `failed` are in-progress or recoverable work;
  `completed` is history.
- Add owner-scoped server-side filtering and complete counts for the views so
  category totals and pagination are based on the full collection, not only the
  page already loaded by React. Preserve the existing durable game model and
  authorization boundary.
- Use contextual player-facing actions: Open setup for saved setups, Open game
  for active work, recovery controls for failed work, and View history for
  completed games. Keep New game and confirmed deletion available in every
  view where they make sense.
- Present the library as two columns of clickable cards on desktop and one
  column on phones. Use status labels and distinct icons with blue for saved
  setups, gold for active games, green for finished games, and coral for games
  needing attention. Each card is the primary setup or Observe link; keep
  deletion, failed-run retry, and the board seed in the overflow menu.
- Keep category controls visible during loading and errors, support keyboard
  navigation, and arrange the controls in two rows on narrow phones.
- Preserve the current shared Observe destination and existing run behavior
  until later gameplay and replay specifications define more specific modes.
  Do not add gameplay rules, human-turn controls, or a separate history route.

## F-08 maintainability follow-up

The library behavior above is implemented, but `GameLibrary.tsx` now combines
view loading, pagination, lifecycle updates, deletion, accessibility handling,
and the full card/menu presentation. Keep the existing behavior and API
contract while separating these responsibilities into focused React modules.
Do not broaden this into a visual redesign or state-management dependency.

## Build steps

### 1. [x] Add a paginated, owner-scoped library view contract

Extend the existing game-list request with a validated view filter and return
counts or pagination metadata for the complete owner collection. Map lifecycle
statuses consistently, keep failed games recoverable, and preserve the current
unfiltered response for existing clients where practical.

**Done when:** Each view returns only the authenticated owner's matching games,
its total reflects all matching records, pagination remains correct, and a
second owner cannot infer or retrieve another owner's games through filtering.

**Evidence:** `GameLibraryTest` passes 12 tests and 96 assertions. The tests
cover all four views, complete counts across multiple pages, the persisted
space-form human-wait status, invalid filters, and owner isolation. Pint and
`git diff --check` also pass.

### 2. [x] Present the library as clear player-facing views

Update `GameLibrary` to switch between Saved setups, In progress, and History
using the API contract. Replace raw lifecycle wording with contextual labels
and actions while retaining the existing new-game entry, deletion modal, load
more behavior, and recoverable error states. Present each game as a clickable
card with status icons, contextual destinations, and secondary actions in its
overflow menu.

**Done when:** A mixed library separates created, active or failed, and
completed records without losing records across pages. Each card opens the
appropriate setup, game, or history view; retry and delete remain available
from its overflow menu; and empty states explain what the player can do next
on desktop and phone layouts.

**Evidence:** Frontend lint and production build pass. The full Playwright
suite passes 96 tests with the live-Compose-only observer check excluded; the
focused library suite passes 26 tests after the final card artwork adjustment.
The library was visually checked at desktop and phone widths, and
`git diff --check` passes.

### 3. [x] Add regression and browser evidence for the library views

Cover API filtering, complete counts, owner scoping, pagination, failed-run
recovery, view switching, actions, deletion, and responsive navigation with
focused PHPUnit and Playwright tests. Run the documented frontend checks and
the API suite.

**Done when:** Mixed-status fixtures and more-than-one-page collections remain
correct after switching views, refreshing, loading more, deleting, and
recovering a failed game, with no console or layout regressions.

**Evidence:** `cd apps/api && composer test` passes 120 tests and 732
assertions. Frontend lint and build pass. Focused Playwright checks pass 48/48;
the full mocked browser suite passes 96/96, and the separate live Compose
observer smoke passes 1/1. A live Compose library check with 21 temporary games
verified the API counts (21 all, 20 saved, 1 in progress), category switching,
loading page two, deletion, and persistence after refresh. At 390px the page
has no horizontal overflow; browser console errors and failed API responses
were both zero. Four stale requests were canceled during filter changes as
expected. Desktop and phone screenshots were inspected, temporary data was
removed, and `git diff --check` passes.

### 4. [x] Extract the game card and its presentation

Move each game's card and overflow menu into a typed `GameLibraryCard`
component. Move card-only status icons, labels, destination text, and summary
formatting alongside it where that makes ownership clearer. Keep API calls,
library pagination, and deletion confirmation in their current owners for this
step; pass the card only the data and callbacks it needs.

**Done when:** `GameLibrary` composes cards without containing their large
markup tree, every lifecycle state retains its current destination and
available actions, and the existing focused library browser tests pass.

**Evidence:** Frontend lint and production build pass. The focused library
Playwright suite passes all 26 tests using Chromium installed under `/tmp`;
desktop (1440px) and phone (390px) screenshots were inspected, and
`git diff --check` passes.

### 5. [x] Extract library loading and pagination state

Move active-view loading, request cancellation, complete counts, load-more and
retry behavior, and lifecycle/count reconciliation into a feature-local
`useGameLibrary` hook. Keep the page responsible for composing the header,
category controls, empty/error states, cards, and deletion flow. Keep the API
contract unchanged.

**Done when:** the hook has an explicit typed interface, the page no longer
owns list-fetching and pagination mechanics, and view switching, pagination,
status changes, and deletion continue to preserve the tested behavior.

**Evidence:** Frontend lint and production build pass. The focused library
Playwright suite passes all 26 tests, including view switching, pagination
retry, lifecycle cards, and deletion across partially loaded pages.
`git diff --check` passes.

### 6. [x] Isolate the delete confirmation dialog

Move `DeleteGameModal` and its dialog-specific focusable-element helper into a
focused module. Keep the library responsible for opening the dialog, making
the delete request, and restoring focus to the originating card menu trigger
after cancellation or a sensible library action after deletion.

**Done when:** the library page no longer contains dialog markup or its focus
trap implementation; cancel, confirm, outside click, Escape, busy, error, and
focus-restoration behavior remain covered by the existing browser tests.

**Evidence:** Frontend lint and production build pass. The focused library
Playwright suite passes all 26 tests, covering cancel and confirmation,
outside click, Escape, focus containment and restoration, busy/error states,
and deletion across partially loaded pages. Cancel leaves the overflow menu
closed and focuses its trigger. `git diff --check` passes.

## Verify

- `cd apps/api && composer test`
- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- From `apps/web`, run `npm run test:e2e -- e2e/game-library.spec.ts`, then the
  focused run, route, and authentication checks and the documented frontend
  suite.
- Manually inspect `/games` with saved, active, failed, and completed games at
  desktop and phone widths.
- `git diff --check`

## Completion verification

- `cd apps/api && composer test`: passed, 120 tests and 732 assertions.
- `cd apps/web && npm run lint` and `npm run build`: passed during the final
  audit and implementation checks.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-playwright-browsers npm run test:e2e
  -- --grep-invert 'observes a real Compose game'`: passed, 96 tests.
- The default browser command also ran 96 tests successfully, but its separate
  live Compose observer test stopped at its setup guard because this run had no
  configured game token and numeric game ID. Earlier feature verification
  recorded the configured live observer smoke passing 1/1.
- `git diff --check`: passed before completion.

## Findings

### separate-library-views/F-02 [P2] closed - The library does not distinguish setups from active games and history

**File:** apps/web/src/features/games/GameLibrary.tsx:353;
apps/api/app/Http/Controllers/Api/V1/GameController.php:26
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** All six lifecycle statuses shared one chronological list,
one saved-game count, and broadly identical row presentation. A mixed-status
browser fixture showed Created, Completed, Awaiting Human Input, Running, and
Failed records interleaved. The player had to scan status badges to find a
game to enter, an unfinished setup, or history. New saved setups could also
displace active games onto older API pages. Status labels exposed
control-plane terms instead of explaining the player's next action.
**Suggested fix:** Keep one My games destination with clear In progress,
Saved setups, and History views. Present failed work as a recoverable item in
context, rather than requiring another major destination. Use actions such
as Open setup, Open game, and View history; introduce Continue only when
human gameplay actually exists. Keep the same durable game model. Filtering
and counts must cover the complete owner-scoped collection through the API,
not just whichever page React has loaded. Use contextual empty states and
keep New game available. This is separate from the new-game journey in F-01.
**Resolution:** Added a validated owner-scoped `view` filter to the games list
endpoint, with server-side lifecycle mapping, complete category counts, and
pagination for the selected view. Focused API coverage verifies mixed-status
collections, cross-page totals, invalid filters, and foreign-owner exclusion.
The library now presents Saved setups, In progress, and History with
contextual actions. Final API verification passed 120 tests and 732
assertions; all 96 self-contained browser tests passed. The configured live
Compose observer smoke had passed earlier in feature verification.

### separate-library-views/F-08 [P2] closed - GameLibrary concentrates too many responsibilities in one component

**File:** apps/web/src/features/games/GameLibrary.tsx:79
**Found:** 2026-10-18 by /audit (scope: F-02)
**Why it matters:** The 582-line `GameLibrary` component coordinated view
loading and cancellation, pagination and recovery, live status/count updates,
deletion and focus restoration, keyboard tab navigation, and the card/menu
render tree. The file grew from 785 to 1,088 lines in this branch. These
interacting responsibilities made future changes to the library harder to
review and increased the chance that a change to one flow would break
another. This was a maintainability finding; the audited behavior passed its
API, lint, and build checks.
**Suggested fix:** In a focused follow-up, move card/menu presentation into a
small `GameLibraryCard` component and extract the library loading/pagination
state into a hook if that keeps the view component focused. Preserve current
API behavior and browser coverage; avoid a wider refactor.
**Resolution:** Extracted card/menu presentation into `GameLibraryCard`, list
loading and pagination into `useGameLibrary`, and deletion dialog/focus-trap
behavior into `DeleteGameModal`. `GameLibrary` now coordinates the library
view and delete request. Cancel, Escape, and backdrop dismissal keep the menu
closed and return focus to its trigger; successful deletion focuses the New
game action. Final review confirms the page, card, hook, and dialog have
focused roles. API tests, frontend lint/build, and all 96 self-contained
browser tests pass. Closed on 2026-10-18.
