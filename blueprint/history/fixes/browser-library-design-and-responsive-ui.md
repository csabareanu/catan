# Fix: Apply browser library design and responsive UI corrections

**Type:** Fix
**Fixes:** F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08
**Status:** ready for review
**Branch:** `/implement` should create a separate fix branch from `main`.

## Design reference

Use the approved static reference in `prototypes/README.md`,
`prototypes/game-library.html`, `prototypes/library.css`, and
`prototypes/theme.css`. The durable visual references are:

- `blueprint/reference/library-desktop.png`
- `blueprint/reference/library-mobile.png`

Port the approved layout and tokens into the React application. Do not ship the
static prototype or duplicate game data in the browser.

## The problem

The browser screens work, but the authenticated library and related screens do
not yet have a consistent page frame or action hierarchy. The library is too far
left on desktop, game metadata can split long seeds, account and game actions
compete with status content, headings are oversized on account forms, mobile
navigation wraps important labels, secondary text is too faint, and the delete
button loses its destructive styling. The prototype defines the agreed visual
direction for these corrections and for the authenticated navigation model.

## The fix

- Make `/games` the authenticated home. The authenticated brand returns to the
  library, the account identity and sign-out action live in one shared account
  menu, and the board demo is available at `/preview` as secondary navigation.
  Keep `/` as a compatibility entry that reaches the preview without changing
  the anonymous board contract.
- Add a centered shared frame and responsive page layout for the library,
  authentication, creation, preview, and observer screens. Separate display
  hero typography from page and form headings.
- Port the prototype's dark teal, gold, terrain, spacing, focus, and readable
  secondary-text treatment into the real stylesheet. Keep the existing SVG
  board renderer and use only decorative, data-free emblems in game rows.
- Redesign game rows around the game ID, lifecycle status, opponent count,
  readable ruleset and map labels, date, and an unbroken seed. Put the primary
  run or observer action in the row and place deletion in a labeled accessible
  actions menu.
- Preserve the current API contracts, owner scoping, session behavior, polling,
  observer privacy, confirmation before deletion, and recovery messages. This
  fix changes presentation and navigation only.

## Build steps

- [x] **Step 1 - Shared navigation and page frame** - update the lightweight browser
   navigation and shared shell so authenticated users have a library anchor,
   `/preview` is the secondary board demo path, and account actions have one
   consistent location. Apply centered frames and page-level heading scales.
   *Done when:* authenticated brand and account navigation behave consistently
   on `/games`, `/games/new`, and the observer; `/preview` renders the existing
   board preview; `/` remains a working anonymous compatibility entry; and
   direct private routes still enforce the existing session rules.
- [x] **Step 2 - Prototype library layout and actions** - reshape the populated and empty
   library views to match the approved desktop and mobile reference, including
   decorative emblems, compact metadata, lifecycle badges, primary row actions,
   and labeled deletion menus. *Done when:* the library is centered at desktop
   widths, long seeds stay intact, the 390px layout has no horizontal overflow,
   game actions retain their current API behavior, and deletion still requires
   confirmation and removes a row only after HTTP 204.
- [x] **Step 3 - Cross-screen visual corrections** - apply the typography, contrast,
   focus, responsive header, helper-text, and destructive-control corrections
   to authentication, creation, preview, library, and observer screens.
   *Done when:* ordinary account names and navigation remain usable on narrow
   screens, secondary text is readable, delete controls retain danger styling
   in normal, hover, focus, and disabled states, and the existing observer board
   remains visible without overflow.
- [x] **Step 4 - Browser regression evidence** - update focused Playwright assertions for
   the new paths and accessible labels, then run the documented web checks and
   inspect the real Compose-backed screens at desktop and mobile widths.
   *Done when:* lint, build, and the full browser suite pass; the real flow can
   authenticate, use the library, create and run a game, open the observer,
   visit the preview, delete the game, and sign out; and no new console errors
   or horizontal overflow are observed.
- [x] **Repair F-08 - Reach older saved games** - consume the existing paginated
   game-list contract, display the saved-game total, and append older games
   through a Load more action. *Done when:* an owner with 21 or more games can
   reach the final page; a failed additional-page request preserves visible
   games and can be retried; pending requests cannot load duplicate pages;
   confirmed deletion updates the total and cannot make pagination skip a game;
   and desktop/mobile controls retain the existing authenticated API behavior.
- [x] **Repair F-05 - Prevent intermediate-width header collisions** - move the
   authenticated header into its compact two-row layout before navigation and
   long account names can compete for horizontal space. *Done when:* the
   authenticated header has separate rows at the audited intermediate widths,
   the account trigger and both navigation links remain inside the viewport with
   no overlap, active navigation states remain correct, and the existing mobile
   and desktop layouts retain their behavior.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run test:e2e`
- With Docker Compose running, manually inspect `/games`, `/games/new`,
  `/preview`, and `/games/{id}/observe` at 1440px and 390px widths.
- Confirm the existing API request payloads, polling states, observer privacy,
  delete confirmation, and session recovery remain unchanged.

## F-08 verification - 2026-10-16

Approved by the user on 2026-10-16. The repair is checked off and F-08 is
marked fixed, pending audit re-review.

- A new regression test failed against the old library because 21 saved games
  were reported as 20. After repair, all 49 Playwright tests passed, including
  final-page access, a pending request, retry after a page failure, session
  expiry, and deletion with 21/41 games and a failed page-range refresh.
- `cd apps/web && npm run lint` and `cd apps/web && npm run build` passed.
- Browser suite: `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e`.
- Focused `/check` reused the development Compose UI at
  `http://127.0.0.1:5173/games`, with a temporary registered account and 21 games
  created through the real API. At 1440x900 and 390x844, Load more fetched page 2,
  retained the first 20 rows, exposed the final game, and disappeared at the end.
  The phone layout had no horizontal overflow.
- Deleting a visible game through the real API changed the total to 20; the
  next Load more refreshed page 1 and exposed the shifted older game. Inspected
  browser flows had no console/uncaught errors or unexpected failed requests.
- The temporary games, token, and account were removed after verification.
  Screenshots are local artifacts under `/tmp/catan-f08-check/`.
- This evidence covers F-08; it does not certify the other audit findings or
  the full queued-execution workflow. No Laravel or Go source changed.

## F-05 verification - 2026-10-16

Approved by the user on 2026-10-16. The repair is checked off and F-05 is
marked fixed, pending audit re-review.

- The authenticated header now enters its compact two-row layout at widths up
  to `42rem`, while the broader mobile-only adjustments remain at `38rem`.
  Account names are constrained in the compact layout so the navigation and
  account trigger retain separate hit areas.
- A focused Playwright regression test uses the audited long name
  `Alexandru Ioan Ionescu` and checks actual navigation/account rectangles at
  610, 620, 640, 660, and 680px for overlap, viewport bounds, overflow, and
  compact row separation.
- The focused test passed, `cd apps/web && npm run lint` passed,
  `cd apps/web && npm run build` passed, and the full browser suite passed with
  50/50 tests.

## Findings

### browser-library-design-and-responsive-ui/F-01 [P2] closed - Game library lacks a centered page frame

**File:** apps/web/src/App.css:275
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** At 1440px, the library panel starts at approximately x=46,
has width 891px, and leaves approximately 503px on the right. The shell replaces
`access-content` with `library-content`, which supplies no centering, while
`library-card` limits the panel width. The resulting asymmetry differs from the
centered creation and authentication screens.
**Suggested fix:** Define a centered outer frame shared by page navigation and
library content. Keep library content top aligned and form panels narrower;
left-align text within those containers.
**Resolution:** The authenticated library now uses the same centered page frame as
the other browser screens, with a wider readable content width and no asymmetric
left anchoring.

Re-reviewed 2026-10-16: the 1440px library and header share x=182px and
width=1075px, with equal outer margins. The original asymmetry is resolved.

### browser-library-design-and-responsive-ui/F-02 [P2] closed - Equal metadata columns split valid game identifiers

**File:** apps/web/src/App.css:440
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** The five equal columns and `overflow-wrap: anywhere` split
the valid seed `9223372036854775807` across two lines even at 1440px. At 390px,
the same seed ends in an isolated `07` on the next line. Narrow metadata cells
make summaries harder to scan and increase card height unpredictably.
**Suggested fix:** Give seeds a full row or sufficiently wide column, preserve
the complete value, and adapt metadata groups before they become cramped.
Present Base game and Standard map as readable labels; keep versions secondary
and available in details rather than repeating them prominently on every card.
**Resolution:** Game rows now keep the seed in its own unbroken metadata line,
with responsive wrapping reserved for surrounding descriptive content.

Re-reviewed 2026-10-16: the complete 19-digit seed stays on one line at
320px, 390px, tablet, and desktop widths; surrounding metadata can wrap.

### browser-library-design-and-responsive-ui/F-03 [P2] closed - Account navigation and game actions have inconsistent hierarchy

**File:** apps/web/src/features/games/GameLibrary.tsx:108
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** New game shares its header group with a permanent Session
restored badge that duplicates the signed-in header. Each game reserves a full
bottom row for deletion. Sign out and Return to board preview sit below the
entire list. Sign out is absent from the creation screen, and the shared brand
always returns to the preview. These positions mix account, navigation, and
game actions; with three synthetic games, the phone page reaches 1733px.
**Suggested fix:** Put account identity and sign out in a consistent header;
place New game beside the library title; remove the permanent session badge;
use compact game rows with a quieter, accessible delete action. Make the
library the authenticated navigation anchor and the preview a secondary demo
destination. Reserve future Open/Observe actions for their approved build steps.
**Resolution:** Authenticated navigation now anchors on the library, account
actions share one header menu, New game sits beside the library heading, and
row deletion uses a compact labeled actions menu.

Re-reviewed 2026-10-16: shared authenticated navigation, library anchoring,
New game placement, and compact row actions resolve the original hierarchy
issue. The distinct menu interaction defect is recorded as F-15.

### browser-library-design-and-responsive-ui/F-04 [P2] closed - Hero typography crowds account screens

**File:** apps/web/src/App.css:159
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** Authentication, creation, and library headings inherit the
preview hero's viewport-based size. At 1440px, headings are 57.6px; Sign in to
Catan and Create your account each occupy two tightly spaced lines inside a
553px form panel. The headline dominates the practical controls and the scale
changes substantially between tablet and desktop despite a capped form width.
**Suggested fix:** Separate hero, page, and form heading sizes. Use approximately
28-36px form headings with comfortable line height, shorter copy, and consistent
spacing. Keep the existing creation form structure while simplifying its text
and navigation. Display fixed map/ruleset choices as configuration summaries
instead of disabled selects where no choice is available.
**Resolution:** Form and observer headings use a capped page scale separate from
the preview hero, while descriptions and action links have consistent readable
spacing.

Re-reviewed 2026-10-16: form headings measure approximately 34.6px on desktop
and 29.2px at 390px, independently of the preview display heading. Remaining
setup complexity is a separate issue in F-13.

### browser-library-design-and-responsive-ui/F-05 [P2] closed - Responsive navigation collides at intermediate widths

**File:** apps/web/src/App.css:21
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** At 390px, the preview header wraps Sign in onto two lines
beside the anonymous badge. Longer ordinary account names also create a
multi-line account pill. The mobile adjustments mostly reduce font size rather
than rearranging the competing header elements. The large preview title and
decorative hex-count column further consume the narrow content area.
**Suggested fix:** Preserve single-line primary navigation, hide redundant
status copy on phones, and constrain long display names accessibly. Collapse
decorative preview information before reducing navigation legibility. Validate
the resulting header across the existing screens and narrow widths.
**Resolution:** Mobile headers preserve single-line primary links and account
names, hide redundant anonymous status copy, and collapse the decorative hero
index before it competes with the preview title.

Reopened 2026-10-16: the original 390px wrapping is repaired, but the desktop
three-column header remains active just above 608px while its navigation can
overflow its shrinking grid track. At 620px, "Alexandru Ioan Ionescu" causes
Board demo and the account trigger to overlap by approximately 30.5px; at
610px, "Alexandru Ionescu" also produces a 3.7px overlap. Document scrollWidth
still equals the viewport, so the existing overflow checks miss the collision.
Move the compact-header breakpoint before the content collides or otherwise
reserve the actual minimum width of links and account controls. Verify actual
control bounds and hit targets around the breakpoint, not just page width.

**Resolution:** The authenticated header now switches to its compact two-row
layout at `42rem`, before the audited intermediate widths can force navigation
and account controls into the same hit area. The existing `38rem` mobile rules
remain separate for general page adjustments, and compact account names use a
bounded single-line treatment. Approved and repaired 2026-10-16. The focused
boundary test passed at 610, 620, 640, 660, and 680px with the audited long
account name; lint, build, and the full 50-test browser suite also passed.
Re-reviewed and closed by `/audit` on 2026-10-16; no new defect was found in
the repaired header or its regression coverage.

### browser-library-design-and-responsive-ui/F-06 [P2] closed - Small secondary text has insufficient visual separation

**File:** apps/web/src/App.css:453
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** Metadata labels and helper text render around 11px using
`--faint`. The measured faint color against the library card's opaque raised
background has a contrast ratio of approximately 4.21:1; against the lighter
surface-soft token it is approximately 3.49:1. Small uppercase labels, faint
helpers, and tiny footer links are difficult to read despite ample surrounding
space. This is a targeted visual observation, not an accessibility certification.
**Suggested fix:** Raise secondary-text contrast, use a readable 13-14px scale
for supporting UI, and establish consistent label/body/helper roles. Check
actual rendered backgrounds, keyboard focus, and narrow-screen legibility.
**Resolution:** Helper, metadata, observer, privacy, generation, footer, and
form-link text now use the muted readable role and a larger support scale.

Re-reviewed 2026-10-16: support text uses the muted role, which contrasts
approximately 7.47:1 against surface and 6.71:1 against surface-soft. Original
faint helper/metadata treatment is repaired. Small SVG labels are a distinct
scaling issue in F-12; this closure is not an accessibility certification.

### browser-library-design-and-responsive-ui/F-07 [P3] closed - Generic button styles override the destructive variant

**File:** apps/web/src/App.css:490
**Found:** 2026-10-15 by /audit (scope: apps/web design)
**Why it matters:** The later `.access-secondary-action` rule overrides the
delete variant's text color. Browser measurements show cream text normally
and gold text/border on hover, despite the intended danger color. Deletion
therefore looks like ordinary navigation and changes to a mixed danger/accent
appearance on hover.
**Suggested fix:** Define destructive button styling after the base variant or
use a deliberate variant selector. Keep normal, hover, keyboard-focus, and
disabled states coherent without depending on accidental stylesheet order.
**Resolution:** The disabled delete state now explicitly retains the danger
color and neutral background alongside the existing normal, hover, and focus
danger states.

Re-reviewed 2026-10-16: delete retains rgb(201, 109, 98) in normal, hover,
keyboard-focus, and pending-disabled states. Keyboard focus has a visible
outline and danger background. Existing pending-delete browser coverage passes.

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

### browser-library-design-and-responsive-ui/F-08 [P1] closed - Older saved games are unreachable through the library

**File:** apps/web/src/features/games/GameLibrary.tsx:45
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The API paginates 20 games per page
(apps/api/app/Http/Controllers/Api/V1/GameController.php:16,29), but listGames
has no page argument and the library retains only response.data. It discards
links/meta and offers no pagination or load-more control. A synthetic response
with total=21 and next page=2 renders "20 saved games", sends only the first
page request, and cannot expose the older game. Returning players can lose
access to saved games/history through the UI despite those records existing.
**Suggested fix:** Support the existing API page contract, retain total/page
metadata, and expose an accessible next-page or load-more action. Preserve
already loaded rows on incremental errors and reconcile deletion with counts.
Test at least 21 games and the final page. No new backend service is needed.
**Resolution:** Re-reviewed and closed by `/audit` on 2026-10-16. The client
validates pagination metadata, requests later pages with the authenticated
relative API path, shows the saved-game total, and appends older games through
Load more. Pending requests cannot load duplicate pages, failed requests
preserve visible rows and can be retried, and deletion refreshes the loaded page
range before extending it so offset shifts cannot skip a game. The focused
library suite passed 17/17 tests, covering final-page access, pending requests,
retry, session expiry, and deletion shifts across 21 and 41 games. Lint, build,
and the full browser suite passed, with 49/49 tests green on the final run. No
new F-08 defect was found.
