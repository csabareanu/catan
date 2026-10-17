# Welcoming anonymous entry

**Type:** Fix

**Fixes:** F-14

**Status:** complete

## The problem

The root route and `/preview` currently present the same seed-first developer
board generator. A new visitor sees technical setup before understanding how to
create an account or save games, and the real board appears below the setup
content on a narrow screen. The entry has only a Sign in link and does not
provide a clear path toward the authenticated game library.

## The fix

- Make `/` a concise player-facing entry that explains that an account is
  required to create games and follow their history, with visible Create account
  and Sign in actions.
- Use an original painted landscape inspired by the fields, village, sea, and
  evening light in the supplied `1.jpg`, with soft edges blending into the
  dark teal page. Keep the real generated board on
  `/preview`, where its seed and developer details are useful.
- Use calm, welcoming game copy and deliberate spacing between the description,
  account actions, and preview link. Avoid grand claims and slogans on the art.
- Separate the header account actions with clear spacing: a quiet Sign in link
  and an outlined Create account action. Use spacing and backgrounds to separate
  the landing header and footer, without the blue divider lines.
- On phones, position the landscape behind the upper content, with its brighter
  detail to the right and a dark gradient protecting text readability. Extend
  the scene through the full hero and balance the content vertically, avoiding
  a large empty area above the footer. Keep the account actions in the first
  screen and preserve the approved desktop layout.
- Keep `/preview` as the explicit seed-oriented board demo with its current
  developer details, manual generation flow, and reproducibility language.
- Keep the existing authentication routes, anonymous API boundary, board data
  contract, and responsive no-overflow behavior intact.

## Build steps

### 1. [x] Give anonymous visitors a useful first entry

Add the route-specific landing presentation, its responsive styles, and a
decorative landscape illustration. Update focused browser coverage for the root
landing and preserve the detailed `/preview` flow.

**Done when:** `/` explains the account path without promising unimplemented
gameplay, uses inviting game-oriented copy, exposes clear Create account and
Sign in actions, and shows a painted Catan-inspired landscape without requiring
the visitor to understand a seed. `/preview` still exposes the manual seed
generator and developer details, and both routes remain within desktop and
narrow viewport widths with no console errors.
On phones the artwork appears behind the upper content, and the account actions
remain visible without scrolling.

**Artwork:** `apps/web/src/assets/catan-landscape.webp`, generated with the
built-in imagegen tool. The generation prompt is recorded alongside the asset
in `catan-landscape.prompt.md`. The artwork is decorative and does not request
or represent persisted game data.

### 2. [x] Unify the shared site header

Use one shared header frame on the landing, authentication, library, creation,
preview, and observer screens. Give it a consistent height, logo, maximum content
width, gutters, and dark background that blends into the page. Reuse the quiet
Sign in link and outlined Create account action on anonymous screens. Keep
authenticated navigation and the account menu consistent across private screens.
Remove the page-specific header sizing rules and preserve the observer's usable
board area.

**Done when:** At the same viewport size, every route has the same header frame
and brand alignment. The header blends into the page without a separate strip or
divider. Anonymous account actions, authenticated navigation, active-page markers,
and account-menu dismissal and focus behavior work. Phone headers do not wrap or
overlap, and the observer board remains playable without page scrolling.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run test:e2e -- e2e/preview.spec.ts`
- `cd apps/web && npm run test:e2e`
- Manually open `/` at desktop and 390px mobile widths, then open `/preview`
  and confirm the detailed seed demo remains available.

## Review and verification

Both steps approved by the user on 2026-10-17.

- `npm run lint` and `npm run build` passed from `apps/web`.
- `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- --workers=4`
  passed all 66 browser tests.
- Shared header checks covered public and authenticated routes at 1440px,
  390px, and 320px widths, with consistent geometry, active-page markers,
  account-menu dismissal, and keyboard focus restoration.
- Desktop and mobile screenshots were inspected against the approved landing
  direction. A mobile observer check confirmed a 390x844 document without
  horizontal or vertical overflow, outside-click menu dismissal, and no
  uncaught JavaScript errors. Private-screen visual evidence used mocked API
  responses and does not establish a real backend account or game lifecycle.
- F-14 was re-reviewed and closed by `/audit F-14` on 2026-10-17.

## Completion

Completed on 2026-10-17 after user approval and the focused audit of
`394ca2d..58f3e55`. The original F-14 issue is closed. F-24 remains open as a
P2 follow-up in the live ledger, alongside F-16, F-17, F-18, and F-23.

**How to try it:** Open `/` on desktop and phone widths, follow Create account
or Sign in, and use the board link to reach `/preview`. Generate a preview
from seed 42. After signing in, compare the shared header on `/games`,
`/games/new`, `/preview`, and a saved game observer.

## Findings

### welcoming-anonymous-entry/F-14 [P2] closed - First visit introduces a board generator rather than the game

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
**Resolution:** User approved the repair on 2026-10-17. The root route now
introduces the game with calm copy, an original painted landscape, visible
Create account and Sign in actions, and a link to the manual `/preview` demo.
The mobile artwork sits behind the content and the account actions remain in
the first screen. Public and authenticated screens share consistent header
geometry, background, navigation, and account controls. Lint and build passed,
and all 66 browser tests passed, including entry, preview, session, header,
and observer coverage. Private-screen visual checks used mocked API responses.
Re-reviewed and closed on 2026-10-17 by `/audit F-14` against 58f3e55.
Anonymous first entry, account and demo destinations, artwork loading, and
mobile action placement were confirmed in Chromium. The shared header and
manual preview remain functional. The separate session-failure problem found
during this review is tracked independently as F-24 in the live findings ledger.
