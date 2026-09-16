# Catan - Project Overview

> A learning-first, backend-heavy Catan base-game implementation with a
> deterministic Go engine, a Laravel control plane, and a polished React client.

## Problem

This project provides a technically substantial implementation of the Catan base
game while developing practical skill in domain modeling, deterministic state
transitions, authorization, durable event history, background work, and
cross-service integration. It must remain fully operable through its API while
delivering visual feedback early and eventually supporting a complete browser
match between one human and two or three AI opponents.

Success means seeded simulations are reproducible, AI games finish without
illegal transitions, persisted history can reproduce and visually replay a
game, private data stays private, and an authenticated human can complete a
base-game match.

## Users

- **Authenticated player** - creates private games, controls one human seat
  against two or three AI opponents, completes matches, and reviews or deletes
  owned games.
- **Authenticated API consumer or developer** - starts seeded AI-only runs,
  observes their status, inspects current state and ordered history, and consumes
  results without requiring the browser.
- **Future remote players** - multiple human seats over the internet are an
  architectural consideration, not an MVP user journey.

Anonymous access is limited to registration and login. Stored games, simulations,
history, results, and seat-private views are owner-scoped.

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

The roadmap source of truth is `blueprint/build-plan.md`. All items are planned
and ordered by dependency.

1. **Seeded board walking skeleton** - prove the Go to Laravel to React path with
   reproducible board generation and responsive SVG rendering.
2. **Authenticated private game library** - let users authenticate and manage
   only their own seeded games and API credentials.
3. **Durable queued game execution** - run retry-safe engine work asynchronously
   while PostgreSQL stores lifecycle state and history and Docker Compose runs
   the local stack.
4. **Replayable simulation observer** - expose ordered history through the API
   and let users step through state in the browser.
5. **Initial placement phase** - enforce legal three- or four-seat setup and let
   AI seats complete it visibly.
6. **Core turn economy** - add deterministic dice, private resources, building,
   and bank and port trades to the replayable turn loop.
7. **Robber interactions** - add discards, robber movement, blocked production,
   and resource stealing.
8. **Development cards** - add purchasing, private hands, timing restrictions,
   and every base-game development card.
9. **Player trading** - add offers and responses with simple AI evaluation while
   preserving hidden holdings.
10. **Complete headless AI games** - add awards, victory scoring, completion, and
    baseline AI decisions that finish seeded games reproducibly.
11. **Human setup and core turns** - let one human complete setup, roll, build,
    and use bank or port trades while AI opponents act.
12. **Human special actions and negotiation** - let the human resolve robber
    choices, use development cards, and negotiate with AI through legal-action
    guidance.
13. **Completed match experience** - deliver the headline MVP outcome: a clear,
    responsive, animated human-versus-AI match with scoring, victory, privacy,
    and full post-game replay.

## Data model

PostgreSQL is the durable source of truth. Redis contains only disposable queue,
cache, session, lock, and coordination data.

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
- `state_schema_version` (string) - identifies the serialized state shape.
- `seed` (string) - canonical integer representation shared safely by PHP, Go,
  JSON, and TypeScript without numeric precision loss.
- `seat_count` (small integer) - three or four.
- `human_seat_number` (nullable small integer) - null for AI-only simulations.
- `configuration` (JSONB) - immutable game options and map configuration.
- `board_configuration` (JSONB) - generated hex, vertex, edge, port, and token
  topology.
- `lifecycle_status` (string enum) - created, queued, running, awaiting human
  input, completed, or failed.
- `current_state` (JSONB) - latest canonical engine state; never returned
  directly without the Go-owned public or seat-specific projection.
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

The schema permits future human seats without providing multiplayer behavior in
the MVP.

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
- **Laravel Sanctum 4** - secure cookie authentication for the first-party React
  client and hashed API tokens for CLI or external clients.
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
administrative dashboard. It is optimized for desktop and tablet, remains usable
on smaller screens where practical, provides immediate feedback, and never
reveals another seat's resources or cards.

The intended route map is:

- `/register` - create an account.
- `/login` - authenticate.
- `/games` - browse the private game library and current statuses.
- `/games/new` - configure a game, seed, and AI seat count.
- `/games/:gameId` - observe or play the current game with its SVG board,
  players, turn state, legal actions, and important events.
- `/games/:gameId/replay` - inspect ordered history and step through snapshots.

Route names express product intent; the React router and server-state libraries
remain implementation decisions.

The same data-driven SVG board evolves from the first seeded-board view into the
simulation observer, replay tool, and interactive match. Live and replayed state
must remain visually consistent.

## Deployment

The MVP target is a reproducible local Docker Compose environment, not a public
cloud deployment.

Compose must eventually run:

- Laravel API.
- Laravel queue worker.
- Stateless Go engine and simulation service.
- React development server or built web application.
- PostgreSQL 18.
- Redis 8.2.

The React production build outputs through Vite to `apps/web/dist`. Laravel,
React, and Go retain independent build and test commands documented in the root
`AGENTS.md`; there is no combined root verification command yet.

Expected Laravel environment groups include `APP_*`, `DB_*`, `REDIS_*`,
`QUEUE_CONNECTION`, `CACHE_STORE`, and `SESSION_DRIVER`. The Go service
address and health-check contracts will be named when durable queued execution
is specified.

Docker Desktop is visible from WSL, but WSL integration must be enabled before
Compose can be verified. No public host, managed database, production domain,
automatic scaling, high availability, or production operating budget is
selected.

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

- **Visual direction** - choose artwork, typography, color, motion, styling,
  component, routing, server-state, animation, and frontend testing approaches
  when their requirements become concrete. A dedicated prototype can settle the
  visual language before polish-heavy feature work.
- **Commercial distribution** - if pursued later, revisit product naming,
  visual-asset licensing, operating cost, and monetization before changing the
  project's non-commercial scope.
- **Future operations** - choose public hosting, topology, real-time transport,
  observability, and budget only if deployment or internet multiplayer becomes
  approved work.
- **Administrator inspection** - the project plan permits administrator access
  for debugging, but the build plan defines no admin role, API, or interface.
  Treat inspection as out-of-band developer access in the MVP; add it to both
  plans before building product-facing administration.
- **Local orchestration details** - Compose service definitions, engine service
  environment names, and health paths are intentionally deferred to durable
  queued game execution (feature 3).
