# Findings

> **Generated file.** The findings ledger: findings raised by `/audit` against
> the work in progress, each with a durable ID, severity (P0-P3), and status.
> `/implement` marks repaired findings `fixed`, a later `/audit` pass moves
> them to `closed`, and `/complete` archives resolved findings with the work
> and resets this file.

## Full browser UI and usability review - 2026-10-16

Scope: all existing player-facing routes and project-owned source, styles,
browser tests, and relevant configuration under apps/web, the approved library
prototypes, the active fix, and the product/build plans. The API pagination
caller contract was read to confirm F-08. This is a comprehensive review of the
implemented UI, not a full-project security review or a review of unbuilt game
mechanics. Dependencies, generated builds, caches, unrelated local changes,
and backend/engine internals are excluded.

Branch: fix/browser-library-design-and-responsive-ui. Local comparison base:
main, merge base 1b928d612c9d9998b50898a68f6dcc0898a49839, through
35bb938. The UI working tree was clean before this ledger update.

Evidence: Chromium inspected the running development Compose UI at
1440x900, 1366x768, 1024x768, 768x1024, 620x800, 600x800, 390x844,
844x390, and 320x568, with additional header-boundary checks at 610, 640,
660, and 680px. The anonymous board used the real stateless endpoint and
returned 19 hexes, 72 edges, and 9 ports. Private screens used intercepted,
synthetic owner-scoped responses with this real board geometry. No real
account, owned game, token, or persisted game history was created or changed.
Screenshots are local evidence under /tmp/catan-ui-audit-20261016/; these
temporary artifacts are not durable project assets. The ledger retains the
measurements and reproduction details.

Signals: npm run lint and npm run build passed; the existing Playwright suite
passed 44/44 using PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright.
All six Compose services were healthy. No skipped/focused tests or suppressions
were found in the reviewed UI sources/tests. Inspected pages raised no
uncaught JavaScript errors. This does not prove a real authenticated flow
through Laravel, worker, Go, and PostgreSQL; private browser evidence was mocked.

User-confirmed design direction: the game/history board fills the available
window, with compact controls and a side panel for players/history on desktop;
panels become drawers or bottom sheets on phones. Use a polished board-game
style with resource symbols and subtle terrain art. Game screens should not
require document scrolling between the board and essential controls. Library
and account pages may scroll normally. Retain useful safe diagnostics only as
secondary developer information. These are design requirements for a subsequent
reviewed slice, not authorization to implement during this audit.

Reference material: the official CATAN Universe screenshot at
https://www.catan.com/sites/default/files/2021-05/CATAN_Universe_Screen1.png
shows an illustrative board with player information and resources around it.
Colonist's first-party trade-design article at
https://blog.colonist.io/improving-the-colonist-trade-system/ describes resource
symbols, stable hand placement, and progressive disclosure informed by testing.
These inform recommendations, not proof that a particular design improves this
project's retention. No competitor live match was audited.

Original findings closed this pass: F-01, F-02, F-03, F-04, F-06, F-07.
F-05 reopened. New findings: F-08 through F-18, plus the user-requested
confirmation-modal refinement F-19. P2 design findings below assess
the user's expanded professional-player-UI goal; they are not retroactive
claims that Feature 4b violated its approved technical-observer scope.

### F-23 [P2] open - Board renderer combines presentation and gesture orchestration

**File:** apps/web/src/features/board/BoardSvg.tsx:120
**Found:** 2026-10-17 by /audit (scope: F-11/F-12 re-review)
**Why it matters:** `BoardSvg` now owns board layout construction, SVG
rendering, resource and port presentation, keyboard controls, native wheel
binding, mouse dragging, touch panning, pinch state, double-tap detection, and
zoom math in one roughly 485-line component. The native wheel path also repeats
view-update work that the button and pointer paths perform through separate
closures. This makes future replay interaction changes harder to review and
leaves gesture behavior without an isolated unit boundary.
**Suggested fix:** Extract a focused `useBoardViewport` or equivalent hook for
view state, gesture lifecycle, event binding, and shared transforms. Keep
`BoardSvg` responsible for rendering the board and controls, and add focused
pointer or pinch assertions around the extracted behavior before 4c grows the
interaction surface.
**Resolution:**

### F-24 [P2] open - Public header keeps restoring a session after the account check fails

**File:** apps/web/src/features/board/BoardLandingScreen.tsx:32
**Found:** 2026-10-17 by /audit (scope: F-14 current change and shared header)
**Why it matters:** The landing passes token presence as `isRestoringSession`.
After `/api/v1/auth/me` returns 503, App sets the session to anonymous with a
recovery message but retains the token, so the header still says Restoring
session and hides Sign in and Create account. The landing never displays the
failure message. Reproduced after the request had completed, with a synthetic
stored token and an intercepted 503 response. `/preview` has the same behavior
through App.tsx:350; that path predates this repair, and the new landing repeats
it. Existing browser tests cover successful restoration and expired credentials
but miss this completed-failure state.
**Suggested fix:** Derive restoration progress from the actual session state
rather than token presence. When restoration fails, stop the progress status
and offer account or retry recovery without discarding a token merely because
of a temporary outage. Cover pending, successful, 401, 503, and network-failure
states on the landing and shared preview header with focused browser tests.
**Resolution:**

### F-16 [P2] open - Public game information is displayed as field counts

**File:** apps/web/src/features/replay/GameObserver.tsx:435
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** public_scores becomes "4 visible" instead of actual public
scores, active_seat_number becomes "Seat 2" instead of the player's identity,
and roads/buildings become aggregate recorded counts. The observer receives
useful projected data but presents its structure rather than what is happening
in the game. BoardSvg receives context.board only, so a public road in a frame
does not appear on the map. That static-board boundary is explicit in 4b and
is not a regression; it needs an intentional next-step design before replay.
**Suggested fix:** Render explicit player cards using available public names,
public scores, turn/phase, and awards when supported. Keep hidden VP and other
seats' holdings private. Design piece overlays on stable API edge/vertex IDs
for the relevant board-state feature, alongside planned 4c stepping. Do not
infer missing state or reconstruct game rules in React. Keep generic field
inspection optional for development.
**Resolution:** Reconfirmed 2026-10-16 against a synthetic four-seat public
frame using the real board fixture. Public scores remain a count of entries,
the active player remains a seat number, and a projected road remains a count
without a board overlay. Keep basic player-facing presentation distinct from
the deferred authoritative replay and piece-overlay work; never invent turns,
scores, hidden VP, or game rules to fill the sidebar.

### F-17 [P2] open - Browser evidence misses realistic board and viewport usability

**File:** apps/web/e2e/game-observer.spec.ts:65
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The observer fixture contains one hex, no edges, and no
ports. Assertions check SVG presence and horizontal scrollWidth only; a tall,
unreadable real 19-hex board still passes. Library fixtures use empty links/meta,
so pagination loss is invisible. The prior Compose visual script also used a
one-hex private fixture with intercepted responses. All 44 tests pass while
F-05 and F-08 through F-12 remain reproducible. Mocked private screenshots do
not prove the active spec's real authentication/create/run/observe/delete flow.
**Suggested fix:** Add representative full-board fixtures and behavioral
assertions for the agreed viewport layout, reachable controls, breakpoint
collisions, pagination, legend meaning, and menu focus. Keep a small real-stack
smoke flow distinct from API-mocked browser tests and record which evidence was
actually obtained. Do not equate CSS nowrap or SVG visibility with usability.
**Resolution:** Re-examined 2026-10-16. The observer now uses an actual
engine-generated 19-hex, 72-edge, 9-port fixture and checks desktop terrain
height, port bounds, token proportions, sidebar scrolling, and the corrected
desktop composition. The focused observer suite passes 10/10 and the serial
full frontend suite passes 55/55. The mocked tests still do not establish the
real-stack flow, do not test 320x568, and do not verify focus restoration for
the phone sheet. Keep open for that broader evidence.

### F-18 [P3] open - All routes retain preview-only browser metadata

**File:** apps/web/index.html:9
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** Login, registration, library, creation, and observer all use
the title Catan · Seeded Board Preview and the description of a stateless board
preview. Browser inspection confirms unchanged titles across routes. Tabs and
history do not identify the active task, and the metadata understates the app.
**Suggested fix:** Set concise route-specific titles, including the game
identifier in observer/replay views, and a product-appropriate default
description. This does not require adding a routing or metadata library.
**Resolution:**

## Observer page composition review - 2026-10-16

Scope: `/games/:gameId/observe`, the active F-09 implementation, its staged,
unstaged and untracked frontend work, and nearby authentication shell, board
renderer, replay client, styles and browser tests. Reviewed the local library
reference for theme consistency. This is a focused page audit, not a full-project
audit. Backend/engine internals, other player-facing routes, dependencies,
generated builds, caches and unrelated files are excluded.

Branch: fix/viewport-sized-game-observer-shell. Comparison base: local main,
merge base 22ab7e96eae37f1cad2b6edadf891dc33a2b0077. Reviewed committed range
22ab7e96eae37f1cad2b6edadf891dc33a2b0077..c4c065b975ecd0cf6f18a107b9dfb8032d6d6df5. No fetch or pull was performed.

Evidence: Chromium inspected the running development frontend at 1366x680,
1920x912, 2560x1080, 1024x768, 768x1024, 390x844, 844x390, and 320x568.
Private identity and replay responses were mocked with an engine-generated
standard board fixture and representative three/four-seat public data. No real
account, token, saved game or history was changed. Screenshots are temporary
evidence at /tmp/catan-observer-audit-*.png. No uncaught page errors appeared;
the observed startup ERR_ABORTED replay request corresponds to StrictMode
effect cleanup and was followed by the successful response.

Signals this pass: npm run lint and npm run build passed.
PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e --
e2e/game-observer.spec.ts passed 10/10. A serial full frontend run with
PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e --
--workers=1 passed 55/55. An earlier parallel run had four session-route
failures while the preview web server was unavailable; the serial rerun passed
those tests and no product failure was reproduced. No skipped/focused tests,
unsafe suppressions or TODO/FIXME markers were found in the searched frontend
sources and browser tests. Standards checked: React presentation-only
responsibility, existing versioned replay boundary, feature-scoped changes,
existing theme, and browser evidence for UI behavior.

Ledger changes: F-09 and F-20 closed; F-10 and F-17 updated with current
evidence; F-21 archived with accessible-phone-game-details-sheet; F-22 archived
with consolidate-observer-layout-styles. No new P0/P1 finding was confirmed in
this page scope. Passing automated checks do not establish visual polish.

## Welcoming entry and shared header review - 2026-10-17

Scope: the complete active F-14 change, including every committed branch change,
the new landing component and asset prompt, shared authentication header,
route/session integration, theme and responsive styles, changed browser tests,
and nearby session/API helpers and observer layout affected by the header.
The working tree was clean before this ledger update. This is a focused
frontend review, not a full-project audit.

Branch: fix/welcoming-anonymous-entry. No local remote-default ref was present;
used local main without fetch or pull. Merge base:
394ca2d60d49cd9f876db38abfe2f096b71300cc. Reviewed range:
394ca2d60d49cd9f876db38abfe2f096b71300cc..58f3e555ed16a067769710013db9430d5d6325fd.

Signals: `npm run lint` and `npm run build` passed from apps/web.
`PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- --workers=4`
passed 66/66. `git diff --check` passed. Searches found no skipped, focused,
or placeholder tests, unsafe TypeScript/lint suppressions, or TODO/FIXME markers
in the reviewed frontend sources and browser tests.

Browser evidence: the running development UI was inspected in Chromium at
1440x900, 768x1024, 390x844, and 320x568. The landing artwork loaded at its
1536px natural width, account actions were within the first screen, and no
horizontal overflow or uncaught JavaScript errors appeared. An authenticated
header sweep from 320 through 1024px in 4px increments found no overlapping
or out-of-bounds logo, navigation, or account controls. Outside-click menu
dismissal and Escape focus restoration passed. Private account checks used
synthetic identity responses; the browser suite also uses mocked owned game
and replay data. These checks do not establish a real authenticated backend
lifecycle. The real anonymous preview endpoint returned HTTP 200 and rendered
19 hexes and 9 ports for seed 42 without creating a stored game.

Recovery checks with a synthetic stored token reproduced F-24 on both `/`
and `/preview` after an intercepted 503 response. A network failure on `/`
also left the progress status visible; a 401 correctly cleared the token and
restored both header account links. Screenshots inspected for
desktop and phone landing views and the failed-restoration state are temporary
evidence at `/tmp/catan-f14-audit-*.png` and are not durable project assets.

Standards checked: feature scope, strict TypeScript, shared components and
styles, explicit API/session boundaries, no client-side game rules or private
state inference, responsive usability, and behavior coverage. Excluded:
dependencies, generated build/test artifacts, unrelated application features,
and backend/engine internals. Backend and engine suites were not run because
their code and contracts did not change. No tools were installed and no
network-backed security scan was run.

Ledger changes: F-14 closed; F-24 added as open P2. Existing F-16, F-17, F-18,
and F-23 remain unchanged. No P0/P1 finding was confirmed. Suggested repair
order: address F-24 with a small reviewed session-recovery slice before
wrapping up the current branch.

Completion note: F-14 is archived as `welcoming-anonymous-entry/F-14` in
`blueprint/history/fixes/welcoming-anonymous-entry.md`. All unresolved entries
remain in this ledger at their existing IDs and statuses.
