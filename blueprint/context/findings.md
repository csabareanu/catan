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

## Site brand and header spacing review - 2026-10-17

Scope: the complete current fix on fix/site-brand-and-header-spacing,
including every committed change from the merge base through HEAD, the active
spec, and nearby shared header, navigation, responsive layout, and browser
coverage. The working tree was clean before this review. This is a focused
frontend audit, not a full-project audit.

Base: local main, used because no locally recorded remote-default ref was
available. No fetch or pull was performed. Merge base:
78ee2c6e9b222ce78a188584e85a7ab52665ca01. Reviewed commit range:
78ee2c6e9b222ce78a188584e85a7ab52665ca01..354aff7d326fd2e8e840d9bfbc7952e706478bb2.
There were no staged, unstaged, or untracked source changes to add to the review.

Files reviewed: apps/web/src/features/auth/AuthShell.tsx, the changed brand and
navigation styles and affected observer layout in apps/web/src/App.css,
apps/web/src/index.css, apps/web/e2e/game-observer.spec.ts, the active spec,
and nearby site-header/session browser coverage and test/build configuration.
The emblem remains in the shared header, decorative SVG content stays out of
the accessibility tree, and the brand link retains an accessible destination
label when the phone wordmark is hidden. Removed badge styles have no remaining
callers. No new dependencies, auth logic, API contracts, or game rules were added.

Automated signals inspected: the recent `npm run lint` and `npm run build`
results and the 66/66 passing browser run against the final approved product
code, before its commit as 354aff7. The command was
`PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- --workers=4`
from apps/web; test-results/.last-run.json also records passed with no failed
tests. These unchanged suites were not rerun during this review. A fresh
`git diff --check` passed. Searches found no skipped, focused, or placeholder
tests, unsafe TypeScript/lint suppressions, or TODO/FIXME markers in the
reviewed frontend sources and browser tests.

Fresh browser evidence: Chromium checked the running development UI at 19
widths from 320 to 1440px, including 383/384/385/386/387/388px and
671/672/673px. No header controls overlapped, extended beyond the viewport,
or caused horizontal document overflow. Header height was 72.95px, the wordmark
hid at 384px and returned at 385px, and the active underline used the approved
0.9em offset. Public and authenticated keyboard tab order passed. Enter opened
the account menu; Escape closed it and restored focus; outside-click dismissal
also passed. No uncaught JavaScript errors appeared.

The observer rendered the representative 19-hex, 9-port board without document
scrolling at 1366x680, 844x390, and 390x844. On the compact laptop viewport,
the combined site header and game toolbar ended at 126.70px and terrain height
was 374.88px, above the existing 55-percent minimum. Increasing the compact
header assertion from 120 to 136px matches the approved taller header; board
size, port visibility, and viewport-bound assertions remain intact. Inspected
screenshots are temporary evidence at /tmp/catan-current-header-audit-*.png.

Authenticated identity and replay responses in the browser review were mocked.
This does not prove a real backend account/game lifecycle. Backend and engine
internals, unrelated product features, dependencies, generated builds, caches,
and test output were excluded from code review. Unchanged backend/engine suites
and network-backed security scans were not run. No tools were installed.

Standards checked: feature scope, strict React/TypeScript presentation
boundaries, reuse of the shared header and theme, responsive geometry,
accessible branding and keyboard controls, removal of unused styles, and
meaningful observer coverage. No new confirmed finding or unverified risk
was identified in this slice. No finding IDs or statuses changed; F-16, F-17,
F-18, F-23, and F-24 remain open. No P0/P1 finding blocks completion.

Next action: `/complete` for this approved header fix. Existing findings remain
separate follow-up work, including F-24 session recovery; none was accepted or
silently resolved by this audit.

## Session restoration failure recovery review - 2026-10-18

Scope: the complete committed F-24 repair, including the active fix spec,
session bootstrap in `apps/web/src/App.tsx`, the public landing and preview
surfaces, recovery styles, focused browser coverage, and nearby shared-header
and browser-session helpers. The working tree was clean before this ledger
update. This was a focused frontend audit, not a full-project audit.

Base: local `main`, used without fetch or pull. Merge base:
`fd7e88d54132f59db461a042b12234d6f3b953f0`. Reviewed commit range:
`fd7e88d54132f59db461a042b12234d6f3b953f0..51f7002`.

Files reviewed: `apps/web/src/App.tsx`,
`apps/web/src/features/board/BoardLandingScreen.tsx`, the recovery styles in
`apps/web/src/App.css`, `apps/web/e2e/session-routes.spec.ts`,
`apps/web/src/features/auth/AuthShell.tsx`,
`apps/web/src/lib/browserSession.ts`, `apps/web/src/lib/apiClient.ts`, the
active fix spec, and the changed findings entry. The public header now receives
the request state rather than token presence. Temporary failures retain the
token while exposing public account actions and an accessible recovery message;
401 responses clear the token; successful responses restore the authenticated
header. No API contract, authorization boundary, game rule, or private data
path changed.

Automated signals: `npm run lint`, `npm run build`, focused session and shared
header browser tests (11/11), and `git diff --check` all passed. No tools were
installed. The reviewed frontend sources and tests contain no skipped or
focused tests, unsafe TypeScript or lint suppressions, or TODO/FIXME markers.

Fresh Chromium evidence against the running development frontend covered both
`/` and `/preview` for pending, successful, 401, 503, and network-failure
responses. Pending requests showed the restoration status until released;
successful responses showed the authenticated header; 401 removed the stored
token and restored public links; 503 and network failures removed the progress
status, showed the recovery message and public links, and retained the token.
The checks used 390px and 1440px viewports, found no horizontal overflow or
uncaught page errors, and used synthetic tokens and identities only.

Standards checked: strict TypeScript, session and API boundary ownership,
accessible status and alert semantics, preservation of transient credentials,
shared header reuse, responsive rendering, and focused browser evidence.
Backend and engine suites, real account lifecycle coverage, generated output,
dependencies, and network-backed security scans were excluded because this
repair changes only frontend session presentation.

Ledger changes: F-24 moved from `fixed` to `closed` after re-review. No new
finding or unverified risk was added. Remaining open findings are F-16, F-17,
F-18, and F-23; none is a P0 or P1 blocker.

Suggested repair order: continue with the remaining user-facing UI findings,
starting with F-16 if player-facing observer information is the next priority,
then reassess F-23 before replay timeline work in 4c.
