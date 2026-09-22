# Feature: Execution persistence contract

**From build-plan:** feature 3a, under feature 3
**Status:** complete

## Goal

Establish the durable, versioned persistence contract that later queued execution
will use for lifecycle state, canonical engine state, failures, commands, ordered
events, and snapshots.

This slice prepares PostgreSQL-backed execution history without starting queue
workers, calling the Go engine, or implementing Catan gameplay rules.

## In scope

- Add nullable/versioned execution-state fields to the existing `games` table.
- Add durable `game_commands`, `game_events`, and `game_snapshots` tables.
- Add Eloquent models, casts, ordered relationships, and factories for the new
  records.
- Add uniqueness and foreign-key constraints that protect per-game ordering,
  idempotency keys, and deletion cascades.
- Keep canonical state, event payloads, and snapshots as opaque versioned JSON
  owned by the future Go execution contract.
- Add focused PHPUnit coverage for migrations, casts, relationships, ordering,
  uniqueness, and cascades.

## Out of scope

- Laravel queue jobs, Redis workers, retries, or dispatch endpoints. Those belong
  to feature 3c.
- Go execution endpoints, state-transition logic, AI decisions, or HTTP client
  changes. Those belong to feature 3b and later gameplay features.
- Docker Compose, PostgreSQL/Redis service definitions, health checks, or local
  orchestration. Those belong to feature 3d.
- API resources that expose `current_state`, `result`, commands, events, or
  snapshots. Feature 4 will define owner-scoped status/history projections.
- Full Catan rules, initial placement, human commands, complete AI games, replay
  controls, or browser changes.
- Snapshot cadence or compaction policy. The schema supports snapshots; execution
  decides when to write them later.
- A new authorization model. Existing owner relationships and later worker
  services remain responsible for scoping access.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); the user reads it and understands it.
4. The user approves, then chooses whether to commit a checkpoint or roll
   straight on. `/complete` makes the real feature-level commit at the end.

Never accept a step the user has not reviewed. If a diff is too large to read in
one sitting, split it.

## Build steps

- [x] **Step 1 - Add execution metadata to games** - add a migration for nullable
  state/version/result/failure/timestamp fields, sequence cursors, run attempts,
  and a lifecycle query index; update `Game` fillable attributes and casts without
  exposing the new fields through existing API resources. *Done when:* fresh and
  existing databases migrate successfully, an existing created game keeps its
  current behavior with null/zero execution defaults, JSON and timestamp values
  round-trip as their documented PHP types, and the existing API test suite passes.

- [x] **Step 2 - Add command, event, and snapshot persistence** - create the three
  tables, models, factories, foreign keys, JSON casts, and ordered `Game`
  relationships. *Done when:* a test can persist a versioned command, event, and
  snapshot for one game, retrieve each through ordered relationships, and confirm
  payload/state JSON is returned as arrays without changing any HTTP response.

- [x] **Step 3 - Lock ordering, idempotency, visibility, and cascade invariants** -
  add focused constraint and deletion tests for unique per-game sequences,
  per-game command idempotency keys, event visibility metadata, snapshot
  positions, and game/owner deletion cascades. *Done when:* duplicate protected
  keys fail at the database boundary, valid public and seat-private event
  records preserve their metadata, deleting a game removes all execution records,
  and the focused plus full Laravel suites and Pint pass.

## Files / areas

- A new migration adding execution columns and an index to
  `apps/api/database/migrations/*_add_execution_fields_to_games_table.php`.
- New migrations for `game_commands`, `game_events`, and `game_snapshots`.
- `apps/api/app/Models/Game.php` for execution casts and ordered relationships.
- `apps/api/app/Models/GameCommand.php`,
  `GameEvent.php`, and `GameSnapshot.php`.
- Matching factories under `apps/api/database/factories/`.
- `apps/api/tests/Feature/GameExecutionPersistenceTest.php`.
- Existing `GameResource`, routes, queue configuration, and Go HTTP code should
  remain unchanged in this slice.

## Data / contracts

The following shapes are load-bearing contracts for features 3b, 3c, and 4.

### Game execution fields

Add these fields to the existing `games` record:

| Field | Storage | Contract |
|---|---|---|
| `state_schema_version` | nullable string | Version of the opaque canonical state JSON; null before execution initializes it. |
| `current_state` | nullable JSON | Latest canonical engine state; never returned directly to clients. |
| `result` | nullable JSON | Future terminal result metadata; remains null until execution produces one. |
| `last_command_sequence` | unsigned big integer, default 0 | Latest accepted command position. |
| `last_event_sequence` | unsigned big integer, default 0 | Latest persisted event position. |
| `run_attempts` | unsigned integer, default 0 | Number of orchestration attempts recorded by later queue work. |
| `failure_code` | nullable string | Sanitized stable failure code. |
| `failure_message` | nullable text | Sanitized human-readable failure detail. |
| `started_at` | nullable timestamp | When execution first begins. |
| `completed_at` | nullable timestamp | When execution reaches a terminal state. |

Keep the existing `lifecycle_status` values and add an index suitable for
later status polling and worker selection. Existing feature 2 games must migrate
with `created` status unchanged, null JSON/timestamp fields, and zero
sequence/attempt counters.

### GameCommand

Each accepted command belongs to one game:

| Field | Contract |
|---|---|
| `game_id` | Owning game; cascade when the game is deleted. |
| `sequence` | Strict per-game command order; unique with `game_id`. |
| `idempotency_key` | Retry identity; unique with `game_id`. |
| `acting_seat_number` | Nullable for system commands such as initialization. |
| `command_type` | Versioned command name. |
| `payload` | Opaque validated command JSON. |
| `accepted_at` | Timestamp at which the canonical command is persisted. |

### GameEvent

Each event belongs to a game and may refer to its producing command:

| Field | Contract |
|---|---|
| `game_id` | Owning game; cascade when the game is deleted. |
| `command_id` | Nullable producing command; null is allowed for system events. |
| `sequence` | Strict per-game event order; unique with `game_id`. |
| `event_type` | Versioned domain event name. |
| `payload` | Opaque event JSON. |
| `visibility` | `public` or `seat_private`. |
| `visible_to_seat_number` | Required by the application contract for seat-private events; null for public events. |
| `occurred_at` | Canonical event timestamp. |

The model relationship must return events ordered by `sequence`. The
database protects sequence uniqueness; visibility validation remains an
application invariant until the event-writing service exists.

### GameSnapshot

A snapshot records a canonical state at an exact history position:

| Field | Contract |
|---|---|
| `game_id` | Owning game; cascade when the game is deleted. |
| `command_sequence` | Command position represented by the snapshot. |
| `event_sequence` | Event position represented by the snapshot. |
| `state_schema_version` | Decoder version for `state`. |
| `state` | Opaque canonical state JSON. |
| `created_at` | Snapshot creation timestamp. |

Only one snapshot is allowed for a game at a given `command_sequence`.
Snapshot frequency and replacement policy remain deferred.

All JSON attributes are cast to PHP arrays by Eloquent. These records are
persistence contracts, not HTTP input models; no client may set them directly.
The history models use their explicit contract timestamps rather than adding
implicit timestamp columns that are not part of the documented shapes.

## Testing

- Use PHPUnit feature coverage with `LazilyRefreshDatabase`, existing game/user
  factories, and new command/event/snapshot factories.
- Step 1 tests cover migration defaults, execution casts, timestamps, and
  regression of existing game creation/library behavior.
- Step 2 tests cover model relationships, JSON casts, ordered retrieval, and
  foreign-key ownership.
- Step 3 tests cover duplicate sequence/idempotency/snapshot keys, public and
  seat-private visibility metadata, game deletion cascades, and owner deletion
  cascades.
- Run the focused persistence test first, then
  `cd apps/api && composer test` and
  `cd apps/api && vendor/bin/pint --dirty --format agent`.
- No browser test or running Go service is required because this slice changes
  persistence only.

## Notes for the AI

- Laravel owns the schema and persistence boundary; Go will own the meaning of
  state, commands, and events in feature 3b.
- Use standard Laravel schema types that work in the current SQLite test setup
  and PostgreSQL production target. Do not introduce PostgreSQL-only SQL.
- Preserve owner and game deletion cascades. Execution history must not outlive
  its game.
- Keep `current_state` and `result` out of `GameResource` until a
  Go-owned public or seat-specific projection is defined.
- Do not add queue dispatch, Redis dependencies, engine endpoints, or Docker
  files while implementing this persistence sub-feature.
- Keep sequence and idempotency uniqueness at the database boundary so later
  retries cannot create duplicate canonical history.
- Do not invent gameplay payload fields. Store versioned JSON opaquely until the
  Go execution contract defines them.
- Future AI-only simulations and human-versus-AI games use the same persistence
  contract; `human_seat_number` may remain null for simulation games.
