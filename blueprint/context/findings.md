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

### F-13 [P2] open - Creating an ordinary game starts with developer configuration

**File:** apps/web/src/features/games/GameCreationScreen.tsx:83
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The first input is a required numeric seed, every new form
defaults to the same fixed seed, and two disabled dropdowns occupy the form for
the only supported ruleset/map. The player must understand reproducibility
before choosing opponents. This makes a simple new-game task look technical
and produces the same board repeatedly unless the user changes the number.
**Suggested fix:** Make opponent count and the primary game action the normal
path. Offer a new board by default and move an optional repeatable board code
to Advanced options. Present fixed Base game/Standard map choices as concise
information rather than unusable controls. Preserve a supplied seed and the
versioned creation contract; do not imply human gameplay is already available.
**Resolution:**

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

### F-14 [P2] open - First visit introduces a board generator rather than the game

**File:** apps/web/src/App.tsx:346
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** Both / and /preview start with Chart a board from a seed,
an empty map panel, technical metadata, and a Sign in link. The prominent
action generates a stateless preview; there is no direct Create account action
or brief path explaining what a new player can do. The generated board begins
at y=1088 on a 390px phone, so even a successful preview is below the visible
window. This is a weak introduction for the user's acquisition goal.
**Suggested fix:** Keep the developer demo reachable, but make the visitor
entry explain the current game experience, show a board promptly, and provide
clear account and demo/help actions. Avoid advertising unimplemented play.
A concise useful entry is sufficient; no elaborate marketing site is required.
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
