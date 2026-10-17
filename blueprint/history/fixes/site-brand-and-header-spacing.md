# Site brand and header spacing

**Type:** Fix

**Status:** complete

## The problem

The shared header's tilted C badge feels generic, and the navigation sits too
close to the top edge. The user approved a stronger Catan wordmark and a header
roughly 72px tall. After reviewing the first emblem, the user requested a more
medieval appearance and an active navigation underline closer to its label.

## The fix

- Replace the letter badge with a small original SVG medieval keep with
  battlements and an arched gate, alongside a restrained gold-and-cream
  wordmark using the established theme.
- Increase the shared header height and center its contents vertically for
  more space above and below the navigation and account controls.
- Keep the same brand and header frame across public and authenticated pages,
  with a compact emblem on narrow phones.
- Place the active-page underline at the user-selected `0.9em` offset from
  the navigation text instead of along the bottom edge of the taller header.
- Retain navigation destinations, active markers, account-menu behavior, and
  the observer's usable board area within a single viewport.

## Build steps

### 1. [x] Polish the shared brand and header spacing

Update the shared header markup, brand styles, and header-height token. Allow
the new height in the observer's existing compact-header assertion while
retaining its board-size and no-scroll checks. Check the result in the running
app and use existing browser coverage to verify navigation, responsive geometry,
and observer sizing.

**Done when:** Every header uses the medieval keep emblem and refined wordmark;
navigation has visibly more space above and below it with a nearby active-page
underline; narrow screens have no overlapping controls or horizontal overflow;
menu dismissal and active-page markers still work; and the observer remains
usable without document scrolling.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && npm run test:e2e -- e2e/site-header.spec.ts e2e/game-observer.spec.ts e2e/preview.spec.ts`
- `cd apps/web && npm run test:e2e`
- Inspect `/`, `/login`, `/games`, `/preview`, and a saved game observer at
  desktop and phone widths. Check the account menu and compact phone brand.

## Scope

This is the header polish approved in conversation. Existing ledger findings,
including F-24 session recovery, remain separate work. No dependencies or
backend changes are needed.

## Implementation review

Implemented on `fix/site-brand-and-header-spacing` and approved by the user
on 2026-10-17.

- The shared brand now uses an original gold SVG medieval keep and island tile
  with a cream uppercase wordmark. Phone styles reduce its footprint and use
  the emblem alone at widths up to 384px.
- The header measures approximately 73px with the current theme, adding about
  8px above and below its controls. Observer sizing uses the same height token.
- Active navigation uses a text underline, so its gold marker stays close to
  the label regardless of the shared header height.
- `npm run lint` and `npm run build` passed from `apps/web`.
- The focused shared-header suite passed 3/3 after the medieval emblem and
  underline revision; the full suite passed 66/66 using
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright` and
  `npm run test:e2e -- --workers=4`.
- Chromium screenshots were inspected for desktop and 390px/320px phone
  layouts, including the desktop observer. A header sweep from 320 through
  1024px in 4px increments found no overlap, out-of-bounds controls, horizontal
  overflow, or uncaught JavaScript errors. Account-menu Escape dismissal and
  focus restoration passed. Authenticated visual checks used mocked identity
  and game responses.
- The revised header was inspected at 1440px, 390px, and 320px. The user then
  selected a `0.9em` underline offset for more breathing room. The header
  remained about 73px tall, and outside-click dismissal and Escape focus
  restoration passed without horizontal overflow or uncaught JavaScript errors.
- After applying the final `0.9em` offset, lint, build, and the three focused
  header tests passed again. Desktop and phone inspection confirmed the new
  offset of approximately 11px without horizontal overflow. The full suite
  was rerun against the final approved version and passed 66/66 before commit.
- The observer's compact-header limit now allows the approved taller header;
  its map-size, port visibility, and no-document-scroll assertions still pass.

## Completion

Completed on 2026-10-17 after user approval and `/audit current` of
`78ee2c6..354aff7`. The audit found no new issue. Fresh Chromium checks
covered 19 header widths, keyboard and menu behavior, and desktop/phone
observer sizing. Private identity and replay responses were mocked.

**How to try it:** Open `/` and `/preview` at desktop and phone widths to
compare the shared emblem and spacing. After signing in, switch between
My games and Board demo to inspect the nearby gold underline and account menu.

## Findings

No findings were resolved by this header polish. F-16, F-17, F-18, F-23, and
F-24 remain open in `blueprint/context/findings.md` for separate follow-up work.
