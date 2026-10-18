# Preview and start a game in one journey

**Type:** Fix

**Fixes:** F-01

**Status:** complete

## The problem

Game creation saves a board but discards the returned board and seats, then
returns the player to My games. Unstarted rows provide Start run without a
way to inspect the board. Starting leaves the player in the library until
they separately choose Observe. The journey splits one player task across
several screens and gives no opportunity to review a board before starting.

Creation is also distinct from queue dispatch. Run retries protect an existing
game ID, but creation currently has no request identity. Losing a successful
creation response can cause a retry to create another game.

## The fix

- Make `/games/new` a setup screen showing an automatically generated board
  preview and the choice of two or three AI opponents. Reuse `BoardSvg`, the
  stateless board-generation endpoint, and the existing visual theme.
- Offer Generate another board as a secondary action. Advanced seed editing
  remains available with an explicit way to apply the seed and refresh the
  preview. Only a successful preview for the current selection can be saved
  or started; stale responses must not replace a newer board.
- Start is the primary action. It saves the chosen game once, queues the
  existing run endpoint, and opens `/games/{id}/observe` on authoritative
  acceptance or an already-started state. Pending work and recovery stay
  visible beside the board rather than returning the player to the library.
- Preview generation, regeneration, and leaving an untouched setup create
  no durable game. Save setup is an explicit secondary action that persists
  the selected configuration without starting it.
- Reopen saved and existing unstarted games at `/games/{id}/setup`, using the
  owner-scoped game detail endpoint. Starting a saved setup reuses its ID.
  Saved configuration is read-only in this fix; generating a different board
  belongs to a new temporary setup. Already-started games open the observer.
- Add an optional UUID `creation_key` to the existing v1 creation request.
  PostgreSQL enforces uniqueness per owner for non-null keys. Replaying the
  same key and configuration returns the same game and seats; reusing a key
  with different creation input returns a stable 409 JSON error. Calls without
  a key retain their existing behaviour. This key is transport metadata,
  separate from engine command idempotency and player-visible configuration.
- Keep an unresolved creation intent and its key across retries and same-tab
  refreshes, scoped to the authenticated owner. Once the game ID is known,
  all start recovery uses that ID. Do not offer a fresh create request as an
  automatic response to an uncertain save or queue outcome.
- Verify that the persisted board matches the preview before dispatching a
  run. If it differs, present the authoritative board for explicit review
  instead of silently starting a different board. Go remains the authority
  for generation; React does not generate or change canonical topology.

Use the existing header, typography, colours, and board controls. Arrange a
large board with compact setup controls on desktop and a readable stacked
layout on phones. This is a functional setup screen, not a palette or artwork
redesign. Start still invokes the current initialization pipeline; copy must
not promise complete playable AI matches or fabricate turns and results.

Keep `/games/{id}/observe` as the shared read-only destination in this fix
for unfinished and finished executions. Do not introduce separate Play,
Watch, or Replay modes or change history-access policy here. The future
distinction between recent live activity and finished-match replay is
recorded in the
[project plan](../project-plan.md#play-watch-and-replay-direction) and must
be revisited for 4c and later gameplay work. A completed initialization
execution must not be presented as a finished match.

Scope is F-01. Library task views and server-side filtering (F-02), terrain
contrast and control overlap, palette changes, ocean artwork, selectable map
appearances, settings, and replay timeline work remain separate. Preserve
owner scoping, existing game records, deletion, API clients, and run history.
Do not add dependencies, services, gameplay rules, or a general draft system.

## Build steps

### 1. [x] Make explicit game saves safe to retry

Extend creation validation, persistence, and the JSON contract with optional
`creation_key`. Store it durably with a per-owner uniqueness constraint and
handle concurrent requests without duplicate games or seats. The first save
returns 201; a matching replay returns 200 with the same resource. Reject a
different payload using the same key with a stable 409. Add focused PHPUnit
coverage for replay, changed input, owner isolation, and unkeyed compatibility.

**Done when:** Repeating one keyed creation returns one game ID with one set
of seats, including when the previous response was lost. Another owner cannot
retrieve or affect that game using its key. Old records and clients without
keys continue to work. The database uniqueness guard and API tests pass.

**Implementation evidence:** Implemented on
`fix/preview-and-start-game`. Failing-first creation tests confirmed the missing
behaviour. The focused creation suite now passes 22/22 with SQLite and 22/22
in an isolated PostgreSQL test database; the full `composer test` gate passes
118/118. Pint and `git diff --check` pass. The nullable-column migration is
applied to the running development PostgreSQL database and its compound
unique index was inspected. The temporary PostgreSQL test database was
removed. Coverage includes owner isolation, changed input, equivalent UUID
case/numeric input, invalid keys, interleaved saves, database uniqueness,
unkeyed compatibility, and recovery after engine unavailability. The step is
complete.

### 2. [x] Show a temporary board preview beside the setup controls

Replace the creation form's first interaction with an initial fresh-seed
preview, opponent selection, optional regeneration, and advanced manual seed
application. Reuse the canonical board client and renderer. Provide loading,
validation, and retry feedback while protecting the selected preview from
out-of-order responses. Add browser coverage for preview and regeneration.

**Done when:** Opening setup displays the selected board before any save,
regeneration changes the visible selection, and manual seed application is
clear. No game-create or run request occurs just from previewing or changing
opponents. Missing, failed, pending, or outdated previews cannot be persisted.
Desktop and phone layouts preserve navigation and board inspection controls.

**Implementation evidence:** Implemented on
`fix/preview-and-start-game`. `/games/new` now generates a temporary preview
on entry, supports regeneration and explicit seed application, keeps stale
responses from replacing the selected preview, and leaves game creation and
run endpoints untouched. The focused creation browser suite passes 6/6,
including desktop and phone viewport checks. The regular frontend suite passes
76/76. React lint, production build, and `git diff --check` pass. The complete
suite's real Compose observer smoke requires the running Docker stack plus a
`COMPOSE_OBSERVER_TOKEN` and numeric `COMPOSE_OBSERVER_GAME_ID`, so it was not
used as the frontend gate. Shared board zoom controls now use high-contrast
light icons on the dark map surface, with visible muted disabled states across
the setup, public preview, and observer maps. The focused preview, creation,
and observer browser suites pass 34/34 after the styling adjustment.

### 3. [x] Start the selected board and enter its observer directly

Connect the primary Start action to keyed creation and the existing run
endpoint. Lock the submitted configuration and retain its request identity
until the outcome is resolved. Verify the saved board, reuse the resulting
ID, and navigate directly to its observer when execution is accepted or
already active/completed. After a failed or uncertain run request, refresh
authoritative status before offering a retry on that same game. Cover duplicate
clicks, lost creation responses, a refreshed pending intent, queue failure,
board mismatch, and normal successful navigation in browser tests.

**Done when:** From New game, the player reviews a board and presses Start
once to reach its observer without a library detour. Busy controls prevent
competing saves. Recovery never creates another game for the same intent or
restarts a completed execution. Network errors preserve the board and a clear
recovery action; the existing status polling remains authoritative.

**Implementation evidence:** Implemented on
`fix/preview-and-start-game`. Start now persists a per-owner session intent
with a UUID `creation_key`, locks the reviewed setup, retries uncertain saves
with the same payload, stores the returned game ID before queueing, verifies
the persisted board, and opens the observer directly after accepted or already
active execution. Failed or uncertain run requests require an authoritative
status refresh before retrying the same game. A persisted intent resumes after
same-tab refresh without creating or running a second game. Board mismatches
show the authoritative board for explicit review. The focused creation browser
suite passes 11/11; the related creation, run, preview, and observer suites
pass 50/50. React lint, production build, and `git diff --check` pass.

### 4. [x] Save and reopen setups without creating another game

Connect Save setup to the same keyed persistence path, then show the saved
board at `/games/{id}/setup` with explicit success feedback. Add private route
handling and an Open setup action for `created` library rows, including records
that predate this fix. A saved setup can be started directly from its board;
if its status has advanced, navigate to the observer instead. Retain existing
failed-run recovery. Add browser evidence for saving, reopening, starting the
same ID, inaccessible records, and existing library/observer regressions.

**Done when:** Save setup creates one unstarted game and no run request.
Reopening it, refreshing its setup route, and then starting all preserve that
ID and board. Existing created games gain a discoverable preview/start entry.
Loading another owner's or a deleted game's setup reveals no private data and
provides recovery. Library grouping remains unchanged for the later F-02 fix.

**Implementation evidence:** Implemented on
`fix/preview-and-start-game`. New game now offers Save setup beside the primary
Start game action, using the same per-owner keyed request identity and preserving
the reviewed board through uncertain save retries. Saved games open at
`/games/{id}/setup` through the owner-scoped detail endpoint, render the
authoritative board with read-only configuration, and preserve the same ID when
started. Active or completed games redirect to Observe, while missing games
show a recovery path without board data. Created library rows expose Open setup.
The focused creation suite passes 16/16; the documented frontend suite passes
88/88. React lint, production build, `git diff --check`, and a running-app
Save, reopen, start, and observer check pass. Step 4 is complete.

## Verify

- For API changes: focused `GameCreationTest` coverage, then
  `cd apps/api && composer test`.
- Format modified PHP using
  `cd apps/api && vendor/bin/pint --dirty --format agent`.
- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- From `apps/web`, run the focused creation, run, library, route, and observer
  Playwright checks first, then the regular UI suite:

  ```sh
  PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/auth.spec.ts e2e/game-creation.spec.ts e2e/game-library.spec.ts e2e/game-run.spec.ts e2e/game-observer.spec.ts e2e/preview.spec.ts e2e/session-routes.spec.ts e2e/site-header.spec.ts e2e/site-metadata.spec.ts
  ```

- Observe the running app at desktop, laptop, and phone sizes. Confirm that
  preview-only navigation leaves My games unchanged; Start opens the exact
  reviewed board; Save setup can be reopened and started; and save/start
  failures preserve a recoverable intent without duplicate records. Use
  controlled response interception for uncertain network outcomes, and a
  real-stack happy path with disposable test data for final integration proof.
- `git diff --check`

## Findings

### preview-and-start-game/F-01 [P2] closed - New-game creation breaks the preview and start journey

**File:** apps/web/src/features/games/GameCreationScreen.tsx:39;
apps/web/src/features/games/GameLibrary.tsx:386;
apps/web/src/features/games/useGameRun.ts:85
**Found:** 2026-10-18 by /audit (scope: project UI)
**Why it matters:** The create response already contains the generated board
and seats, but the screen discards the response and navigates to `/games`.
The new row offers Start run and deletion, with no board-opening link while
the status is `created`. Starting updates the row but leaves the player in the
library, requiring another Observe/View run action to reach the board.
Browser reproduction confirmed zero board tiles after creation and after
starting. Direct navigation to an unstarted game's observer renders all 19
tiles, but has no start action. The necessary information and actions exist
on disconnected screens, so the player cannot inspect and start a board in
one continuous journey.
**Suggested fix:** Design New game as one setup screen containing opponents,
a stateless board preview, optional regeneration, and the primary Start
action. Use the existing Go-generated board contract. Start should persist
the chosen configuration and enter the game screen while queueing is visible.
The user explicitly chose persistence only on Start, with a separate optional
Save setup action. Preserve existing saved setups. A failed queue submission
must retain the created game ID and retry that game; uncertain creation
responses also need deliberate duplicate-prevention behaviour. Preview seed,
ruleset, and configuration must match the game eventually saved. Reuse the
authoritative API and retry-safe run boundary rather than deriving rules in
React. The current engine only initializes games; label that limitation
honestly until actual play is implemented.
**Resolution:** Closed on 2026-10-18 by `/audit` after reviewing the F-01
branch delta from `e554f92` through `75a5d8f`. The setup screen now preserves
the generated preview, starts the same keyed game directly in Observe, and
offers Save setup with owner-scoped reopen and same-ID start recovery. The API
and browser evidence passed: `composer test` 118/118, the documented
Playwright suite 88/88, React lint, and the production build. No new finding
was confirmed in the reviewed F-01 files.
