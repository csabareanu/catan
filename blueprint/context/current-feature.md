# Feature 4b: Browser game access and observer

**From build-plan:** feature 4b, Browser game observer
**Type:** Feature sub-item
**Parent:** Feature 4, Replayable simulation observer
**Status:** ready for review
**Branch:** The implement workflow should create `feature/browser-game-access-and-observer` from `main`.

## Goal

Give a browser user a complete path from account access to a visible persisted
game run. A visitor can register or log in, see only their own games, create a
new human-versus-AI game, start its queued run, and open a read-only observer
that renders the replay API's persisted frame with the existing SVG board.

This expands the browser access seam named by build-plan item 4b so the
observer can be reached through a real user flow. The existing Laravel
authentication, game creation, run, library, detail, and replay endpoints are
the contracts consumed by this feature. No new API or engine behavior is
required.

## User outcome

An anonymous visitor can still use the seeded board preview. From the browser,
the visitor can:

- create an account or sign in;
- remain signed in for the current browser session;
- view an owner-scoped game library;
- delete an owned game after confirming the action;
- create a game with a seed, the base ruleset, the standard map, and two or
  three AI seats;
- start the created game and see queued, running, completed, or failed status;
- open an observer for an owned game;
- see the persisted board context, ordered seats, lifecycle state, latest
  viewer-safe frame position, and public frame data without receiving raw
  canonical state or another seat's private data.

## Design reference

This is a browser workflow feature that extends the existing visual language,
not a replication of a separate mockup. Use the current seeded preview and
board renderer as the visual baseline:

- `apps/web/src/App.tsx`
- `apps/web/src/App.css`
- `apps/web/src/index.css`
- `apps/web/src/features/board/BoardSvg.tsx`

The earlier throwaway prototypes were consumed by Feature 1, so there is no
remaining `prototypes/` reference set to link. Keep the established typography,
panel treatment, spacing, responsive behavior, and board presentation while
adding the authenticated screens.

## In scope

- Add a typed browser API client for the existing authentication, game, and
  replay endpoints.
- Store the bearer token in a namespaced `sessionStorage` entry for the active
  browser session. Never store the password or the raw canonical game state.
- Add lightweight browser routing for the preview, authentication, game
  library, game creation, and observer paths without adding a routing library
  unless implementation evidence shows that the current app cannot support
  the required paths cleanly.
- Add registration, login, logout, session restoration through `/auth/me`, and
  recovery when an authenticated request returns 401.
- Add the owner-scoped game library and creation form using the existing API
  validation contract.
- Add a confirmed delete action for owned games using the existing delete
  endpoint, removing the game from the visible list only after a successful
  response.
- Add the start-run action and lifecycle status handling using the existing
  start and game detail endpoints. Poll while a run is queued or running and
  stop polling for stable states.
- Add a read-only observer that loads `/games/{game}/replay`, uses
  `context.board` as the `BoardData` input to `BoardSvg`, and presents safe
  context and frame metadata.
- Handle loading, empty, validation, authentication, not-found, conflict,
  queue failure, engine failure, and network error states with recoverable UI.
- Add focused Playwright coverage for the browser flows, plus the documented
  lint and build checks.

## Out of scope

- Laravel migrations, new API routes, new authentication mechanisms, password
  reset, email verification, profile editing, or persistent remember-me
  sessions.
- Changes to the existing owner scoping or visibility rules in Laravel.
- Replay timeline controls, event-by-event navigation, snapshot selection,
  arbitrary `at_command_sequence` requests, event pagination controls, or
  client-side state reconstruction. Those belong to 4c.
- Gameplay commands, legal action rendering, human turns, scoring, victory,
  winner presentation, or AI behavior changes. The current bootstrap run is
  the only execution behavior available to this slice.
- A WebSocket or server-sent event transport. Polling is sufficient for this
  local observer milestone.
- Public game sharing, cross-owner viewing, administrator screens, or direct
  access to `current_state`, `result`, command payloads, or private event
  payloads.
- A second board renderer or a React implementation of Go rules.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files, with a short explanation of each changed
   file and the observable done-when.
4. The user reviews and approves the step before the next one. Checkpoint
   commits are optional; `/complete` makes the feature-level commit.

Never accept a step that has not been read. If a diff is too big to review in
one sitting, split the step before continuing.

## Build steps

- [x] **Step 1 - Browser API, session, and route foundation** - extract the
  shared typed request/error handling, define auth, game, and replay contract
  types, add session storage and pathname-based view selection, and preserve
  the anonymous board preview at `/`. *Done when:* an unauthenticated visit to
  `/games` reaches a clear authentication entry state, a stored bearer token
  can be restored through `/api/v1/auth/me`, a 401 clears the session, and the
  existing preview e2e flow still passes.
- [x] **Step 2 - Registration, login, and logout screens** - add accessible
  forms for account creation and sign-in, show field and request errors from
  the API, transition successful authentication to the private library, and
  expose logout from the authenticated shell. *Done when:* Playwright can
  register a new user through a mocked API response, reload and restore the
  session, log out, log back in, and see recoverable invalid-credential and
  validation states.
- [ ] **Step 3 - Private library, creation, and deletion** - add the
  authenticated game list, empty state, new-game form, owner-safe game summary
  display, and a confirmed delete action; submit the existing seed, ruleset,
  map, and AI-count contract. *Done when:* the library renders only the
  returned owner summaries, a valid creation request sends `seed`,
  `ruleset_key`, `map_key`, and `ai_count`, the created game appears with its
  lifecycle status, a confirmed delete sends `DELETE /api/v1/games/{id}` and
  removes the game only after HTTP 204, and 404, 422, 503, and network failures
  remain visible without losing the session.
  - [x] **3a - Owner-scoped game library** - load the authenticated owner's
    summaries through `GET /api/v1/games`, render lifecycle metadata and the
    empty state, and keep recoverable list errors visible.
  - [x] **3b - New game creation** - add the `/games/new` form and submit the
    existing seed, ruleset, map, and AI-count contract.
  - [ ] **3c - Owned game deletion** - add confirmation and remove a game only
    after the owner-scoped delete request returns HTTP 204.
- [ ] **Step 4 - Start run and lifecycle status** - add the start action for a
  created game, handle the existing 202, 200, 409, and 503 responses, and poll
  the owner-scoped game detail while the run is queued or running. *Done
  when:* a user can start a created game, see status changes through a mocked
  queued-to-completed or failed sequence, the start action is not duplicated
  while the run is active, and polling is cleaned up when the view unmounts or
  reaches a stable status.
- [ ] **Step 5 - Read-only replay observer** - add the observer path and screen,
  load the replay-v1 response, render `context.board` through `BoardSvg`, and
  show safe seat, lifecycle, event cursor, snapshot index, and selected frame
  metadata. *Done when:* an owned game opens at `/games/{id}/observe`, the
  existing SVG board is visible, a non-null public frame is displayed, an
  empty replay is explained without a blank screen, queued or running games
  refresh until stable, and 401 or 404 responses provide a recoverable path.

## Files / areas

- `apps/web/src/App.tsx` and `apps/web/src/App.css` for the view shell,
  navigation, and authenticated screen composition.
- `apps/web/src/index.css` for shared session and game screen styling that
  belongs at the application level.
- `apps/web/src/lib/` for the shared typed API request helper, API error shape,
  session storage, and minimal browser navigation helpers if those modules are
  needed.
- `apps/web/src/features/auth/` for authentication contracts, forms, and
  session state.
- `apps/web/src/features/games/` for game contracts, library, creation, run
  status, and observer components.
- `apps/web/src/features/board/boardApi.ts` and
  `apps/web/src/features/board/BoardSvg.tsx` only where a shared `BoardData`
  type or observer rendering seam needs to be reused. Do not duplicate the
  renderer.
- `apps/web/e2e/preview.spec.ts` only if route-shell changes require a small
  fixture adjustment, plus a focused authenticated flow spec under
  `apps/web/e2e/`.
- No Laravel, Go, database, Compose, or deployment files are expected to
  change. If an existing API contract proves insufficient, stop and propose a
  separate backend slice instead of silently expanding this feature.

## Data / contracts

The browser consumes existing versioned endpoints. The client must parse
untrusted JSON at the boundary with explicit TypeScript types and guards. It
must use `Accept: application/json`, `Content-Type: application/json` for JSON
bodies, and `Authorization: Bearer <token>` for authenticated requests.

### Authentication

- `POST /api/v1/auth/register` with `name`, `email`, `password`,
  `password_confirmation`, and an optional `token_name` returns HTTP 201 and a
  `data` object containing `user`, `token`, and `token_type`.
- `POST /api/v1/auth/login` with `email`, `password`, and an optional
  `token_name` returns HTTP 200 with the same token envelope.
- `GET /api/v1/auth/me` returns HTTP 200 with `data.user`.
- `POST /api/v1/auth/logout` returns HTTP 204 and clears the current browser
  token.
- Authenticated user data is `{ id, name, email, created_at }`.
- Validation failures use the project's `{ error: { code, message, fields } }`
  shape. Invalid credentials use the generic `invalid_credentials` response.

### Games

- `GET /api/v1/games` returns a Laravel pagination envelope. The browser uses
  `data` for owner-scoped summaries and does not infer ownership from a client
  field.
- A game summary includes `id`, `mode`, `seed`, `ruleset`, `map`, `seat_count`,
  `human_seat_number`, `lifecycle_status`, `configuration`, `created_at`, and
  `updated_at`.
- `POST /api/v1/games` accepts `seed` as a canonical non-negative decimal
  string, `ruleset_key: base`, `map_key: standard`, and `ai_count: 2 | 3`. It
  returns the full game resource with `board` and ordered `seats`.
- `POST /api/v1/games/{game}/run` returns the updated game resource with HTTP
  202 when queued or HTTP 200 when the result is already persisted. It can
  return `409 game_run_not_startable`, `503 queue_dispatch_failed`, or the
  existing game-engine error responses.
- `GET /api/v1/games/{game}` returns the owner-scoped full game resource for
  status refresh. A missing or foreign game uses the stable `game_not_found`
  response.
- `DELETE /api/v1/games/{game}` deletes an owned game and returns HTTP 204. A
  missing or foreign game uses the stable `game_not_found` response. The
  browser must confirm before sending this destructive request and must not
  remove a library item optimistically.
- Lifecycle status values are `created`, `queued`, `running`,
  `awaiting_human_input`, `completed`, and `failed`. The browser treats these
  as server state and never invents transitions.

### Replay

- `GET /api/v1/games/{game}/replay` returns the top-level `replay-v1` document
  from Feature 4a, not a Laravel `data` resource envelope.
- `context.board` is the existing `BoardData` shape and is the only board input
  passed to `BoardSvg`.
- `context.seats` contains safe seat metadata. `context.game` contains safe
  lifecycle and configuration metadata.
- `events` are already filtered for the authenticated owner's public and
  authorized seat-private visibility. 4b may show event count or cursor
  metadata, but it does not reconstruct state from events or present timeline
  navigation.
- `snapshot_index` contains positions and schema metadata without snapshot
  state. `frame` is null when no checkpoint is available; otherwise it contains
  the actual checkpoint position, `public_state`, and the optional authorized
  `viewer_state` projection.
- The browser renders only the projected replay fields. It never requests or
  displays `current_state`, raw snapshot state, command payloads, or private
  data belonging to another seat.

### Browser navigation and session behavior

- `/` remains the anonymous seeded board preview.
- `/login` and `/register` are public authentication paths.
- `/games` is the authenticated owner library.
- `/games/new` is the authenticated creation form.
- `/games/{id}/observe` is the authenticated read-only observer.
- Direct access to private paths without a valid session redirects to `/login`
  with a short explanation. A 401 during a private request clears the token and
  returns to the same authentication entry state.
- The token is kept only in `sessionStorage` under an app-specific key. Reload
  restoration calls `/auth/me` before showing private content; there is no
  password or token in the URL.

## Testing

The web project has no separate unit test runner. Use Playwright for browser
behavior and the configured static checks:

- Step 1: keep the existing preview tests green and add coverage for route
  gating, token restoration, and 401 session clearing.
- Step 2: cover registration, login, logout, reload restoration, invalid
  credentials, and field-level validation with mocked API responses.
- Step 3: cover empty and populated libraries, creation payload shape, created
  game display, confirmed deletion, deletion success, validation failures,
  engine unavailability, not-found responses, and network recovery.
- Step 4: cover start response handling, lifecycle polling, completed and
  failed outcomes, duplicate-start prevention, and cleanup on navigation.
- Step 5: cover replay context rendering, the existing SVG board, a public
  frame, a null frame, refresh while active, and unauthorized or missing-game
  recovery.
- Run `cd apps/web && npm run lint` after TypeScript or JSX changes.
- Run `cd apps/web && npm run build` as the web build gate.
- Run `cd apps/web && npm run test:e2e` with Playwright's managed Chromium.

The API and Go test suites are not part of the normal implementation gate
because this feature consumes existing backend contracts. A real-stack `/check`
run should still verify that the browser can use the running Compose services
after implementation.

## Notes for the AI

- Laravel owns authentication, authorization, game lifecycle, persistence, and
  privacy filtering. Do not add a second ownership or visibility decision in
  React.
- Go remains the only authority for rules, state transitions, event generation,
  and AI decisions. React receives and renders server-provided state.
- Keep the existing anonymous board preview working while adding private views.
- Prefer feature-local components and hooks over a large new global abstraction.
- Keep polling cancellable and bounded to active views. Do not poll after a
  terminal lifecycle status or an unmounted component.
- Treat decimal sequence values as strings in TypeScript. Do not convert them
  to JavaScript numbers.
- Do not expose private event payloads in a generic debug panel. The observer is
  a safe rendering surface, not a database inspector.
- Preserve responsive behavior for desktop and narrow screens and use accessible
  labels, headings, status announcements, and keyboard-reachable controls.
- Before changing an existing API contract, stop and surface the mismatch for a
  separate scoped backend decision.
