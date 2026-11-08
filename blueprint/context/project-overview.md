# Catan - Project Overview

> A learning-first, backend-heavy implementation of the Catan base game, with a deterministic Go engine, a Laravel control plane, and a polished React client.

## Problem

Build a technically substantial and enjoyable implementation of the Catan base game while developing practical experience with domain modeling, deterministic state transitions, API design, authorization, durable persistence, replayable history, background jobs, service integration, and a modern frontend.

The application must remain operable through its API without the frontend. Browser feedback develops alongside the engine: an observer grows into the interface for the human player.

Success means seeded simulations reproduce the same results, AI games complete without illegal transitions, persisted history can reproduce and visually replay a game, private information stays private, and an authenticated human can complete a base-game match against two or three AI opponents.

## Users

- **Authenticated player:** registers, creates and owns private games, controls one human seat against two or three AI opponents, plays through the browser, reviews history, and deletes owned games.
- **Authenticated API consumer or developer:** starts AI-only simulations, checks their status and results, and inspects ordered history without depending on the browser.
- **Anonymous visitor:** generates a stateless board preview from a supplied seed. The preview creates no user or game record.
- **Future remote players:** multiple human seats are an architectural consideration, but online human multiplayer is outside the MVP.

Authentication is required for saved games, simulations, histories, results, and seat-private views. Game data is scoped to its owner.

## Product and architecture constraints

- **Go owns game rules.** It validates legal actions, deterministic randomness, AI decisions, state transitions, and domain events. It has no database or Redis access.
- **Laravel owns application behavior.** It handles identity, authorization, game lifecycle, input validation, persistence, queues, and the public API. It does not duplicate game rules.
- **React presents engine-approved data.** It renders API state and legal actions; it does not decide legality or expose another seat's private information.
- Each accepted player command identifies its acting seat and produces a new canonical state plus ordered events.
- A seed, ruleset version, initial configuration, and identical command sequence must reproduce the same game result.
- Board topology is represented as configurable hexes, vertices, and edges, not fixed screen coordinates.
- HTTP/JSON contracts, rulesets, serialized states, and event schemas are versioned so persisted games remain interpretable.
- PostgreSQL is authoritative for durable user, game, and history data. Redis is limited to queues and transient coordination.
- Keep extension seams for future rulesets, maps, and multiple human seats without implementing a generic plugin framework in the MVP.

### Deferred expansion directions

These are future product directions, not approved MVP features:

- Online human multiplayer, including invitations, synchronization, reconnection, and turn timeouts.
- Alternative maps, scenarios, account-owned custom maps, and compatibility checks between map capabilities and scenario requirements.
- AI training and evaluation after complete, reproducible headless games exist. A future policy may propose actions from structured observations, while Go remains authoritative for legality and transitions. Preserve seeds, ruleset and map versions, commands, events, snapshots, policy versions, and results for possible evaluation datasets. Model training, fine-tuning, GPU infrastructure, and dataset export are not MVP work.
- Advanced AI strategy, personalities, and competitive play.

## Features

Statuses and ordering follow `blueprint/build-plan.md`. The headline outcome is a complete human-versus-AI match, delivered after the engine and core rules are ready.

1. **Seeded board walking skeleton - complete.** Go generates a reproducible configurable board, Laravel exposes it, and React renders it as an SVG.
2. **Authenticated private game library - complete.** Users register, authenticate, create games with two or three AI opponents, and manage only their own games.
   - **2a. Identity and API access - complete.** Registration, credential login, Sanctum access, identity inspection, and token revocation.
   - **2b. Authenticated game creation - complete.** Persist a seeded game's configuration, owner, and one human plus two or three AI seats.
   - **2c. Private game library - complete.** Owners list, inspect, and delete only their games.
3. **Durable queued game execution - complete.** Laravel and Go execute retry-safe jobs, with lifecycle state and ordered history persisted in PostgreSQL and a local Compose stack.
   - **3a. Execution persistence contract - complete.** Persist versioned lifecycle state, failures, commands, events, and snapshots.
   - **3b. Deterministic engine run contract - complete.** Define the versioned Laravel-to-Go bootstrap boundary.
   - **3c. Queued game orchestration - complete.** Run engine jobs and persist their lifecycle, state, events, and failures.
   - **3d. Local Docker Compose runtime - complete.** Run the API, worker, engine, PostgreSQL, and Redis together with health checks.
   - **3e. Fast local development workflow - complete.** Use source mounts and reload-friendly services for ordinary edits.
4. **Replayable simulation observer - complete.** Owners inspect persisted game history and step through board state in the browser without reimplementing rules in React.
   - **4a. Owner-scoped replay API - complete.** Expose safe game context, visible ordered events, snapshot positions, and viewer-safe frames.
   - **4b. Browser game observer - complete.** Provide the browser access seam, private library, run status, and persisted replay frames.
   - **4c. Replay timeline and state stepping - complete.** Navigate visible events and saved snapshots.
5. **Initial placement phase - complete.** Three- and four-seat games support deterministic legal setup, AI placements, observer playback, and human setup placements.
   - **5a. Initial placement rules contract - complete.** Go defines setup order and legal settlement/road transitions without auto-placing a human seat.
   - **5b. Deterministic AI setup execution - complete.** Persist AI setup commands, events, snapshots, and lifecycle transitions through the retry-safe pipeline.
   - **5c. Setup observer projection - complete.** Render viewer-safe setup state and play authorized setup events in order.
   - **5d. Human initial placement - complete.** The owner chooses legal settlement-road pairs; Go validates the command, persists it, then resumes AI setup until the next human input or setup completion.
6. **Core turn economy - planned.** Deterministic dice, resource production, building, and bank or port trading form a legal replayable turn loop.
   - **6a. Turn sequence and production - complete.** Establish normal turn progression, deterministic dice, resource production, and owner-appropriate resource views. A seven enters a robber-required boundary for Feature 7.
   - **6b. Core building rules - planned.** Validate roads, settlements, and city upgrades with their resource costs.
   - **6c. Bank and port trading - planned.** Apply legal fixed-ratio exchanges as replayable transitions.
7. **Robber interactions and first human turn - planned.** Resolve seven, discards, movement, blocked production, and resource stealing for AI seats, then add a one-turn human pilot.
   - **7a. Robber rules and AI resolution - planned.** Apply robber transitions for AI turns with ordered replay events.
   - **7b. Human core-turn pilot - planned.** Let the owner take one core turn in the observer, resolve any required robber decision, and inspect persisted replay before pausing at the next AI turn.
8. **Development cards - planned.** Buying, privately holding, timing, and playing every base-game development card produce legal state changes.
9. **Player trading - planned.** Seats propose, reject, accept, and execute legal resource trades without exposing private holdings.
10. **Complete headless AI games - planned.** Baseline AI, Largest Army, Longest Road, and victory scoring let seeded games finish reproducibly.
11. **Human core-turn loop - planned.** Extend the Feature 7b pilot so one human can take repeated core turns while AI opponents act until the next human decision.
12. **Human development cards and negotiation - planned.** The human uses development cards and negotiates player trades with AI opponents; required robber decisions are established in Feature 7b.
13. **Completed match experience - planned.** Present turns, private resources, scoring, awards, victory, event animation, responsive layouts, and full post-game replay.
14. **Selectable board appearance - complete.** Keep Classic and add the approved Illustrated terrain and coastline treatment; remember the browser's choice across shared board views without changing game data.

## Data model

PostgreSQL is the durable source of truth. The fields below summarize the current persistence contract and the features that use it; exact column constraints and serialization remain defined by migrations and versioned engine contracts.

### User

- `id` (bigint primary key), `name` (string), `email` (unique string), `email_verified_at` (nullable timestamp), `password` (hashed string), `remember_token` (nullable string), and timestamps.
- Owns many `Game` records, may control human `GameSeat` records, and has Sanctum personal access tokens.

### PersonalAccessToken

- Sanctum-managed polymorphic token record belonging to a user. Token material is stored hashed; plaintext is returned only when issuing a token.

### Game

- `id` (bigint primary key), `owner_id` (foreign key to `User`), nullable `creation_key` (UUID, unique per owner), `mode`, `ruleset_key`, `ruleset_version`, `seed` (string to preserve its canonical integer representation), `seat_count`, nullable `human_seat_number`, `lifecycle_status`, and timestamps.
- `configuration` and `board_configuration` are JSON. The latter stores the generated board topology.
- Execution fields: nullable `state_schema_version`, `current_state`, and `result`; `last_command_sequence`, `last_event_sequence`, and `run_attempts`; nullable `failure_code`, `failure_message`, `started_at`, and `completed_at`.
- Belongs to one owner and has many seats, commands, events, and snapshots. Games remain until the owner deletes them.

### GameSeat

- `id`, `game_id` (foreign key), `seat_number`, `controller_type`, nullable `user_id`, `label`, and timestamps.
- `seat_number` is unique per game. The MVP has one owner-controlled human seat and two or three AI seats; AI seats have no user owner.

### GameCommand

- `id`, `game_id`, `sequence`, `idempotency_key`, nullable `acting_seat_number`, `command_type`, JSON `payload`, nullable JSON `decision_metadata`, and `accepted_at`.
- Unique constraints prevent duplicate sequence numbers and idempotency keys within a game. Only accepted commands form canonical history.

### GameEvent

- `id`, `game_id`, nullable `command_id`, `sequence`, `event_type`, JSON `payload`, `visibility`, nullable `visible_to_seat_number`, and `occurred_at`.
- Events are ordered per game. Laravel applies visibility rules when returning history; a seat-private event must identify its intended seat.

### GameSnapshot

- `id`, `game_id`, `command_sequence`, `event_sequence`, `state_schema_version`, JSON `state`, and `created_at`.
- A snapshot represents an exact persisted history position and supports recovery and replay without putting game reducers in Laravel or React.

### Data invariants

- Games and their histories are private to their owner; every query and API route must enforce owner scope.
- Seed, ruleset identity and version, initial configuration, and seat order are fixed once execution begins.
- Commands and events append in monotonically increasing per-game order. Accepted state, commands, events, snapshots, and cursors persist consistently.
- Canonical state and private event data may be stored for authority, but API responses contain only public or owner-seat-appropriate projections.
- Redis is disposable and never the sole copy of game lifecycle or gameplay data.
- Owners can delete games; games do not expire automatically.

## Tech stack

- **Laravel 13 and PHP 8.3** - REST API and control plane for identity, authorization, lifecycle, persistence, validation, and engine orchestration.
- **Laravel Sanctum** - first-party authentication and API tokens, subject to the alignment note below.
- **Laravel queue workers** - asynchronous simulation and safe retry processing.
- **Go 1.26 or newer** - stateless canonical rules engine, deterministic simulation, and baseline AI.
- **Versioned HTTP/JSON** - inspectable Laravel-to-Go service boundary.
- **PostgreSQL 18** - durable source of truth.
- **Redis 8.2** - queues and transient coordination only.
- **React 19 with TypeScript** - standalone browser client consuming Laravel's JSON API.
- **Vite and npm** - frontend development and production build tooling.
- **SVG** - addressable rendering for board tiles, edges, vertices, selection, and animation.
- **Docker Compose** - reproducible local development and stable image-based stacks.
- **Monorepo** - Laravel, React, and Go remain in distinct `apps/` and `services/` ownership areas.

RabbitMQ and production orchestration are deferred. Laravel remains the only component that accesses durable application storage.

## Monetization

The MVP is a non-commercial learning and portfolio project. It has no payments, subscriptions, advertisements, or premium content.

## UI/UX

The browser should feel like a polished strategy game rather than an administrative dashboard. It is optimized for desktop and tablet, remains usable on smaller screens where practical, gives clear feedback about the turn and available actions, and never reveals another seat's private resources or cards. Phone-first gameplay is not an MVP requirement.

Current browser screens include:

- `/` - welcome page and account actions.
- `/preview` - anonymous seeded-board preview.
- `/register` and `/login` - account creation and authentication.
- `/games` and `/games/new` - private game library and seeded game creation.
- `/games/:gameId/observe` - the shared board observer for setup, saved replay frames, and visible event history. Human setup placement is available at the owner's legal setup decision; Feature 7b adds a one-turn core-action pilot, and Feature 11 adds AI continuation between human turns.

Classic and Illustrated appearances share board data and controls. The appearance preference is browser-local and does not change a game's seed, rules, replay position, or saved state. The exact broader theme, typography, motion language, and component approach remain open for reviewed design work.

Persist full command and event history. During active human games or AI-only viewing, the future product experience may show bounded recent activity; full player-facing replay navigation is reserved for completed matches. The policy is not implemented yet, and current API behavior remains unchanged until specified. Human-game replay uses the permitted seat perspective; AI-only spectator replay is public. Pause and playback speed affect presentation, not engine execution. Actual completion must come from Go's game state, not completion of an initialization job.

## Deployment

The MVP is a local Docker Compose application with the Laravel API and worker, Go engine, React client, PostgreSQL, and Redis. There is no approved public cloud or production target.

- Development stack: `docker compose -f compose.yaml -f compose.dev.yaml up -d`.
- Stable image-based stack: `docker compose up --build -d`.
- Default host endpoints: React `http://127.0.0.1:5173`, Laravel `http://127.0.0.1:8000` (`/up`), Go `http://127.0.0.1:8080` (`/healthz`).
- `APP_PORT`, `WEB_PORT`, and `ENGINE_PORT` override published host ports. Services use internal Compose names and ports for inter-service traffic.
- PostgreSQL is durable storage; Redis is private transient infrastructure. The stable Compose configuration keeps PostgreSQL private.
- The React production build outputs to `apps/web/dist`. Laravel queues require a running worker; no scheduled task or cron job is specified.
- Build, test, dependency refresh, and smoke commands are documented in the root `AGENTS.md`. There is no combined root Verify command or CI workflow.

Public hosting, production domains, managed databases, real-time transport, observability, scaling, and operating budget remain undecided and outside the MVP.

## Open questions and plan gaps

- **Feature-list alignment:** completed Feature 14, Selectable board appearance, is in `build-plan.md` but is not explicitly listed in the project plan's MVP features. Align the user-owned plans when the roadmap is next revised.
- **Authentication alignment:** the project plan specifies Sanctum cookies for the first-party React app and tokens for external clients, while the current browser implementation uses bearer tokens held in `sessionStorage`. Keep the approved implementation until a reviewed decision reconciles it with the plan.
- **Feature 5d outline:** `5d` is currently formatted as a top-level checklist item rather than indented under Feature 5's `5a`-`5c` items. Its number and description identify it as part of initial placement; fix the indentation during a future roadmap edit.
- **Visual direction:** Classic and Illustrated board appearances are approved, but the full theme, typography, motion language, and component choices remain open.
- **Administrator inspection:** the project plan allows administrators to inspect games for debugging, but neither an administrator role nor an inspection workflow appears in the build plan. Treat this as out-of-band developer access until product scope is added.
- **Commercial distribution:** revisit product naming, visual-asset licensing, operating costs, and monetization before any broader release.
- **Future operations:** choose public hosting, production topology, real-time transport, observability, and budget only if that work becomes an approved goal.
