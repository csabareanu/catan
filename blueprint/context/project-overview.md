# Catan - Project Overview

> A learning-first, backend-heavy Catan base-game implementation with a
> deterministic Go engine, a Laravel control plane, and a polished React client.

## Problem

This project builds a technically substantial and enjoyable implementation of the
Catan base game while developing practical experience with domain modeling,
deterministic state transitions, API design, authorization, durable persistence,
replayable history, background jobs, service integration, and a modern frontend.

The application remains operable through its API without the frontend. Visual
feedback arrives early through a browser observer that grows alongside the engine
and later becomes the human player interface.

Success means seeded simulations are reproducible, AI games complete without
illegal transitions, persisted history can reproduce and visually replay a game,
private data stays private, and an authenticated human can complete a base-game
match against two or three AI opponents.

## Users

- **Anonymous visitor** - generates a stateless seeded-board preview without
  accessing user or game data.
- **Authenticated player** - creates private games, controls one human seat
  against two or three AI opponents, completes matches, and reviews or deletes
  owned games.
- **Authenticated API consumer or developer** - starts seeded AI-only runs,
  observes their status, inspects current state and ordered history, and consumes
  results without requiring the browser.
- **Future remote players** - multiple human seats over the internet are an
  architectural consideration, not an MVP user journey.

Anonymous users may register, log in, or generate a stateless board preview
from a supplied seed. A preview creates no game record, is not persisted, and
contains no user or private game data. Stored games, simulations, history,
results, and seat-private views require authentication and are owner-scoped.

## Product and architecture constraints

- Go is the canonical authority for rules, legal actions, deterministic random
  decisions, AI behavior, state transitions, and emitted domain events.
- Laravel owns identity, authorization, game lifecycle, durable persistence,
  queue orchestration, validation at the HTTP boundary, and the public API.
- React renders API-provided state and legal actions. It must not duplicate game
  rules or derive private information belonging to other seats.
- The Go engine is stateless and cannot access PostgreSQL or Redis directly.
- Each accepted command identifies its acting seat and produces a new state plus
  ordered events.
- A seed, ruleset version, initial configuration, and identical command sequence
  must produce the same result.
- Board topology uses configurable hexes, vertices, and edges rather than fixed
  screen coordinates.
- HTTP/JSON contracts are versioned. Rulesets and persisted engine schemas are
  also versioned so completed games remain inspectable.
- The API remains usable without the frontend.
- Future rulesets, maps, and multiple human seats need clear seams, but the MVP
  does not include a generic plugin framework.

## Features

The ordered roadmap is defined by blueprint/build-plan.md. Completed items are
marked complete here; unchecked items remain planned.

1. **Seeded board walking skeleton** - complete. A supplied seed produces a
   reproducible configurable board in Go, exposes it through the versioned
   Laravel API, and renders it as a responsive SVG board in React.
2. **Authenticated private game library** - complete. Users authenticate and
   manage only their own seeded games and API credentials.
   - **2a. Identity and API access** - complete. Registration, authentication,
     Sanctum bearer tokens, identity inspection, and token revocation.
   - **2b. Authenticated game creation** - complete. A seeded game persists one
     human seat, two or three AI seats, configuration, and ownership.
   - **2c. Private game library** - complete. Owners list, inspect, and delete
     only their own games.
3. **Durable queued game execution** - complete. Retry-safe engine work runs
   asynchronously while PostgreSQL stores lifecycle state and history and Docker
   Compose runs the local stack.
   - **3a. Execution persistence contract** - complete. Versioned lifecycle
     state, failure metadata, commands, events, and snapshots are persisted.
   - **3b. Deterministic engine run contract** - complete. Laravel and Go share a
     reproducible versioned bootstrap boundary.
   - **3c. Queued game orchestration** - complete. Laravel dispatches retry-safe
     jobs that call Go and persist lifecycle, state, events, and failures.
   - **3d. Local Docker Compose runtime** - complete. API, worker, engine,
     PostgreSQL, and Redis run together with health checks and smoke verification.
   - **3e. Fast local development workflow** - complete. Source bind mounts and
     reload-friendly processes support ordinary edits without image rebuilds.
4. **Replayable simulation observer** - active. The API and browser expose
   persisted history and a viewer-safe board frame; timeline stepping remains
   in 4c.
   - **4a. Owner-scoped replay API** - complete. An authenticated owner receives
     safe game context, visible ordered events, snapshot positions, and a
     viewer-safe replay frame.
   - **4b. Browser game observer** - complete. The React client provides
     authentication, game creation, the private library, confirmed deletion,
     run status, and a persisted replay frame using the existing board renderer.
   - **4c. Replay timeline and state stepping** - next. Users will move
     through visible events and available snapshot frames without duplicating game
     rules in React.
5. **Initial placement phase** - planned. Three- or four-seat games enforce
   deterministic legal setup while AI seats complete placement visibly.
6. **Core turn economy** - planned. Dice, resource production, roads, settlements,
   cities, and bank or port trading form a legal replayable turn loop.
7. **Robber interactions** - planned. Discards, robber movement, blocked
   production, and resource stealing work for AI seats and appear in replay.
8. **Development cards** - planned. Purchasing, private hands, timing, and every
   base-game development card are supported.
9. **Player trading** - planned. Seats propose, reject, accept, and execute legal
   resource trades while private holdings remain hidden.
10. **Complete headless AI games** - planned. Awards, victory scoring, completion,
    and baseline AI decisions allow seeded games to finish reproducibly.
11. **Human setup and core turns** - planned. One human can complete setup, roll,
    build, and use bank or port trades while AI opponents act.
12. **Human special actions and negotiation** - planned. The human resolves robber
    and discard decisions, uses development cards, and negotiates legal trades.
13. **Completed match experience** - planned. The browser delivers a clear,
    responsive, animated human-versus-AI match with scoring, victory, privacy,
    and full post-game replay.
14. **Selectable board appearance** - planned. Players can keep the current
   Classic board or choose the approved Illustrated terrain artwork. The choice
   is remembered in the browser and applies across shared board views without
   changing game data or controls.

## Data model

PostgreSQL is the durable source of truth. Redis contains only disposable queue,
cache, session, lock, and coordination data.

A generated-board preview is an ephemeral API response, not a stored record.
Authenticated game creation persists its board configuration on the owning game.

The model below is the logical persistence contract. Feature specifications own
the exact migrations, indexes, and enum implementation.

### User

- `id` (bigint) - primary key.
- `name` (string) - display name.
- `email` (string, unique) - login identity.
- `password` (string) - hashed credential.
- `created_at`, `updated_at` (timestamps).
- Has many owned `Game` records.
- Has many optional `GameSeat` records for human-controlled seats.
- Has many Sanctum `PersonalAccessToken` records.

### PersonalAccessToken

Sanctum owns the token schema. Tokens belong polymorphically to a `User`, are
stored hashed, and support authenticated API clients. Plaintext tokens are shown
only when issued.

### Game

- `id` (bigint) - primary key.
- `owner_id` (bigint, foreign key to `User`) - authorization and retention
  owner.
- `mode` (string enum) - `simulation` or `human_vs_ai`.
- `ruleset_key` (string) - identifies the base game or a future ruleset.
- `ruleset_version` (string) - pins the engine contract used by the game.
- `state_schema_version` (nullable string) - identifies the serialized state
  shape once execution initializes.
- `seed` (string) - canonical integer representation shared safely by PHP, Go,
  JSON, and TypeScript without numeric precision loss.
- `seat_count` (small integer) - three or four.
- `human_seat_number` (nullable small integer) - null for AI-only simulations.
- `configuration` (JSONB) - immutable game options and map configuration.
- `board_configuration` (JSONB) - generated hex, vertex, edge, port, and token
  topology.
- `lifecycle_status` (string enum) - created, queued, running, awaiting human
  input, completed, or failed.
- `current_state` (nullable JSONB) - latest canonical engine state; never
  returned directly without a viewer-safe public or seat-specific projection.
- `last_command_sequence`, `last_event_sequence` (big integers) - ordering
  cursors.
- `run_attempts` (integer) - orchestration attempt count.
- `failure_code`, `failure_message` (nullable strings) - sanitized terminal
  failure information.
- `result` (nullable JSONB) - winner, final scores, and completion metadata.
- `started_at`, `completed_at` (nullable timestamps).
- `created_at`, `updated_at` (timestamps).
- Belongs to one owner and has many seats, commands, events, and snapshots.

Games are retained until their owner deletes them. Owner scoping is mandatory on
every query and route.

### GameSeat

- `id` (bigint) - primary key.
- `game_id` (bigint, foreign key to `Game`).
- `seat_number` (small integer) - stable engine identity and turn position.
- `controller_type` (string enum) - `human` or `ai`.
- `user_id` (nullable bigint, foreign key to `User`) - populated for the MVP
  human seat and null for AI seats.
- `label` (string) - player-facing seat name.
- `created_at`, `updated_at` (timestamps).
- Unique on `game_id` plus `seat_number`.

The schema permits future human seats and AI-only simulations without providing
multiplayer behavior in the MVP.

### GameCommand

- `id` (bigint) - primary key.
- `game_id` (bigint, foreign key to `Game`).
- `sequence` (big integer) - strict per-game command order.
- `idempotency_key` (string) - prevents a retry from accepting the same command
  twice.
- `acting_seat_number` (nullable small integer) - null only for system commands
  such as initialization.
- `command_type` (string) - versioned engine command name.
- `payload` (JSONB) - validated command input.
- `accepted_at` (timestamp) - when the canonical transition was persisted.
- Unique on `game_id` plus `sequence`, and on `game_id` plus
  `idempotency_key`.

Only accepted commands form canonical history. Rejected requests return
consistent API errors without changing game state.

### GameEvent

- `id` (bigint) - primary key.
- `game_id` (bigint, foreign key to `Game`).
- `command_id` (nullable bigint, foreign key to `GameCommand`) - command that
  produced the event.
- `sequence` (big integer) - strict per-game event order.
- `event_type` (string) - versioned domain event name.
- `payload` (JSONB) - serialized event data.
- `visibility` (string enum) - public or seat-private.
- `visible_to_seat_number` (nullable small integer) - required for
  seat-private events.
- `occurred_at` (timestamp).
- Unique on `game_id` plus `sequence`.

Visibility metadata originates from the Go engine. Laravel enforces it when
serializing history, and React never receives another seat's private payload.

### GameSnapshot

- `id` (bigint) - primary key.
- `game_id` (bigint, foreign key to `Game`).
- `command_sequence`, `event_sequence` (big integers) - exact history
  position represented by the snapshot.
- `state_schema_version` (string) - decoder version.
- `state` (JSONB) - canonical engine state at that position.
- `created_at` (timestamp).
- Unique on `game_id` plus `command_sequence`.

Snapshots provide recovery and replay frames without requiring React to apply
game rules. Snapshot frequency is a feature-level performance decision.

### Replay and snapshot boundary

The completed replay API returns immutable board and seat context once, a
bounded page of visible ordered events, snapshot positions without raw state,
and one selected viewer-safe frame. A frame reports the actual persisted
checkpoint position; Laravel does not apply later events to invent an exact
state at an unsaved command. Private victory points and another seat's hidden
state must remain outside the public projection.

Snapshot frequency is an execution policy rather than a replay API promise.
One snapshot per accepted command can provide simple exact replay initially.
If snapshots become sparse, reconstruction belongs in Go by replaying accepted
commands from a checkpoint. Laravel and React must not implement game reducers.
State, command history, events, selected snapshots, and cursors must be
persisted atomically; retries must preserve idempotency.

Redis replay caching is deferred until measurements justify it. A later cache
must remain disposable, separate public and owner-private frames, and fall
back to PostgreSQL checkpoints and Go reconstruction. Go remains stateless;
Laravel owns cache coordination. The latest durable current state may support
a later projected frame without requiring a snapshot at every command.

The detailed consistency and deferred cache decisions are preserved in
[Feature 4a](../history/features/04a-owner-scoped-replay-api.md).

### Locked data invariants

- `seed`, ruleset identity, ruleset version, initial configuration, and seat
  order are immutable after execution begins.
- Commands and events are append-only and monotonically ordered per game.
- State, commands, events, and results are committed consistently so an accepted
  transition is never partially visible.
- Redis is never the only copy of game lifecycle or gameplay data.
- Serialized engine state and event contracts carry versions.
- Private engine state is persisted for authority but exposed only through
  authenticated, owner-scoped, seat-appropriate projections.

## Tech stack

- **Laravel 13 on PHP 8.3** - REST control plane for identity, authorization,
  lifecycle, persistence, validation, and engine orchestration.
- **Laravel Sanctum** - hashed bearer tokens for the current browser and API
  clients. The project plan's first-party cookie-authentication intent remains
  an alignment question; Feature 4b approved session-scoped bearer access.
- **Laravel queue workers** - asynchronous simulation orchestration and safe
  retries.
- **Go 1.26 or newer** - stateless canonical rules engine, deterministic
  simulations, and simple AI.
- **HTTP/JSON** - initial versioned Laravel to Go boundary, chosen for clarity and
  easy inspection.
- **PostgreSQL 18** - sole durable source of truth.
- **Redis 8.2** - queues and transient coordination only.
- **React 19 with TypeScript** - standalone browser client consuming the Laravel
  API.
- **Vite and npm** - frontend development and production build tooling.
- **SVG** - addressable and responsive board rendering for tiles, edges,
  vertices, highlights, interaction, and animation.
- **Docker Compose** - reproducible local orchestration for every application and
  infrastructure service.
- **Monorepo** - `apps/api`, `apps/web`, and `services/game-engine` preserve
  explicit ownership boundaries while keeping the learning project cohesive.

RabbitMQ is deferred unless Go later consumes work independently or the product
needs richer cross-language messaging.

## Monetization

There is no MVP monetization. This is a non-commercial learning and portfolio
project with no payments, subscriptions, advertisements, or premium content.

## UI/UX

The interface should feel like a modern strategy game rather than an
administrative dashboard. It is optimized for desktop and tablet, remains
usable on smaller screens where practical, provides immediate feedback, and
never reveals another seat's resources or cards.

Current browser routes:

- `/` - player-facing welcome page with account actions and a board-demo link.
- `/preview` - secondary seeded-board demo.
- `/register` and `/login` - account creation and authentication.
- `/games` - authenticated home, owner-scoped game library, run status, and
  confirmed deletion. Older games load through the existing paginated API.
- `/games/new` - seeded game creation with two or three AI opponents.
- `/games/:gameId/observe` - read-only persisted replay frame and visible
  history metadata. Timeline controls remain planned in 4c.

The browser currently uses lightweight routing, native browser controls, and
Playwright coverage. React renders API state and never applies game rules.
Current queued execution is a deterministic bootstrap; completed runs do not
yet represent complete playable matches.

All screens share a dark header with a gold medieval keep emblem, cream
wordmark, and consistent height, content width, and brand alignment. Public
headers expose Sign in and Create account; authenticated headers expose
My games, Board demo, and the account menu. A gold underline near the navigation
label identifies the active page.

The approved library design reference lives in `blueprint/reference/`, with
desktop and mobile images there. Its dark teal, gold, typography,
and centered frame guide the active UI fix. The full UI audit in
`blueprint/context/findings.md` records remaining refinements and the agreed
future board direction: fill the available window, use a desktop side panel
and phone drawers or bottom sheets, and combine resource symbols with subtle
terrain art. These board refinements require their own reviewed slices.

The Illustrated board artwork and coastline treatment are approved for
Feature 14. The existing Classic rendering remains available; both appearances
use the shared renderer and board data. The selector preference is browser-local
and does not change a game's seed, topology, rules, replay position, or saved
state. Desktop and phone reference captures are in `blueprint/reference/`.

The same data-driven SVG board grows into the replay tool and interactive
match. Player controls, private hands, and legal actions appear only when
supported by real API state.

### Play, Watch, and Replay direction

Keep `/games/:gameId/observe` as the shared read-only destination during the
current bootstrap stage, including the F-01 preview/start fix. Future human
play uses current state, legal actions, and bounded recent activity; active
AI-only games use a spectator Watch experience with recent activity. Reserve
full player-facing replay navigation for finished matches, while continuing
to persist the complete history. Laravel must enforce the historical-access
policy when it is introduced; existing endpoints remain unchanged for now.

AI-only simulations may finish without being watched. Replay pause and speed
control presentation rather than engine execution. Replay remains seat-safe
for human games and public for AI-only spectators. A completed bootstrap job
is not an actual finished match. Revisit these boundaries for 4c and later
human gameplay work. The durable decision and details are in
[Project plan: Play, Watch, and Replay direction](../project-plan.md#play-watch-and-replay-direction).

## Deployment

The MVP runs locally through Docker Compose with Laravel API and worker,
the stateless Go engine, React, PostgreSQL 18, and Redis 8.2. Public hosting,
managed databases, production domains, high availability, and automatic
scaling remain outside the MVP.

- Development: `docker compose -f compose.yaml -f compose.dev.yaml up -d`.
  Source bind mounts and container-managed dependencies support ordinary
  edits without image rebuilds; Go edits require an engine restart.
- Stable image-based workflow: `docker compose up --build -d`.
- Default host endpoints: React at `http://127.0.0.1:5173`, Laravel at
  `http://127.0.0.1:8000` with `/up`, and Go at
  `http://127.0.0.1:8080` with `/healthz`.
- Development PostgreSQL is available on `127.0.0.1`, using
  `POSTGRES_HOST_PORT` or port 5432. The stable configuration keeps it
  private. Redis remains private in both workflows.

Laravel reaches PostgreSQL, Redis, and the engine by Compose service name.
The React production build outputs to `apps/web/dist`. Independent build,
test, dependency-refresh, and smoke commands are documented in the root
`AGENTS.md` and `README.md`; no combined root Verify command or CI exists.
Docker Desktop with WSL integration provides the current local runtime.

## Explicit non-goals

- Human-only internet multiplayer or multiple human-controlled seats.
- Real-time synchronization between remote players.
- Expansion rules, alternative maps, or Seafarers-style scenarios.
- Advanced AI, AI personalities, or machine learning.
- Native mobile applications or phone-first board gameplay.
- RabbitMQ or a broader microservice topology.
- Public cloud deployment, high availability, or automatic scaling.
- Monetization or commercial distribution.

## Open questions and plan gaps

- **Authentication alignment** - the project plan describes first-party
  Sanctum cookies, while completed Feature 4b explicitly approved bearer
  tokens in `sessionStorage`. Keep the current implementation until a reviewed
  slice resolves that plan-level intent; do not silently switch mechanisms.
- **Visual direction** - the library theme and Feature 14 board artwork are
  approved. Motion, component choices, and any additional frontend libraries
  remain implementation decisions for reviewed slices. The project plan still
  carries its broader visual-design open question.
- **Commercial distribution** - revisit naming, visual-asset licensing,
  operating costs, and monetization before changing the non-commercial scope.
- **Future operations** - choose public hosting, topology, real-time
  transport, observability, and budget only if deployment or internet
  multiplayer becomes approved work.
- **Administrator inspection** - the project plan permits debugging access,
  but the build plan defines no admin role or product interface. Treat it as
  out-of-band developer access until both plans approve more.
