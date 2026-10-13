# Feature: Queued game orchestration

**From build-plan:** feature 3c, under feature 3
**Status:** complete

## Goal

Let an authenticated game owner start one deterministic bootstrap execution per
game through a retry-safe Laravel queue job. The job calls the versioned Go
engine contract and atomically persists lifecycle state, canonical state, the
bootstrap command, ordered events, an initial snapshot, attempt metadata, and
sanitized failures. A retry reuses the same game and idempotency key; it never
creates a second game or a duplicate canonical bootstrap command.

The queue job completes the bootstrap execution unit, not a full Catan match.
After a successful bootstrap, the game remains `running` with an initialized
state. Later gameplay features will advance it to human input or a terminal
result.

## In scope

- Add an owner-scoped authenticated start-run API action.
- Transition a game safely from `created` to `queued`, then dispatch one queued
  job after the database transaction commits.
- Build the engine request from the persisted game configuration and ordered
  seats without accepting client-owned engine data.
- Claim and execute the job through the existing
  `GameEngineClient::bootstrapRun()` contract.
- Persist the bootstrap command, all returned events, the canonical state, an
  initial snapshot, schema versions, and ordering cursors in one transaction.
- Make duplicate dispatches and queue redelivery harmless through lifecycle
  guards and the existing per-game command idempotency constraint.
- Allow an unfinished game whose bootstrap failed before canonical history was
  committed to be requeued later through the same start action.
- Record execution attempts, start time, stable failure codes, sanitized failure
  messages, and terminal failure time.
- Retry transient engine unavailability and fail permanently on exhausted or
  non-retryable errors.
- Add focused Laravel coverage for dispatch, authorization, success, duplicate
  delivery, rollback, retry, and failure behavior.

## Out of scope

- Docker Compose, Redis service setup, worker images, or health checks. These
  belong to feature 3d.
- Full AI turns, initial placement, human commands, gameplay legality, results,
  or match completion. Those belong to later engine features.
- Public current-state, result, command, event, or snapshot API projections.
  Feature 4 defines those owner-scoped views.
- React routes, polling, replay controls, or UI changes.
- A separate manual retry endpoint, a second concurrent bootstrap, or restarting
  a completed game. The existing start action retries only an unfinished failed
  bootstrap with no committed bootstrap command.
- New database tables or migrations. Feature 3a provides the required storage
  contract and constraints.
- Changes to the Go engine. Feature 3b already provides the bootstrap boundary.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); the user reads it and understands it.
4. The user approves, then chooses whether to commit a checkpoint or continue.
   Checkpoints are optional; `/complete` makes the feature-level commit at the
   end.

Never accept a step the user has not reviewed. If a diff is too large to read in
one sitting, split it.

## Build steps

- [x] **Step 1 - Add the owner-scoped start-run action** - add an authenticated
  `POST /api/v1/games/{game}/run` action that locks an owned game, accepts only
  the `created` state or a `failed` state with no committed bootstrap command,
  changes it to `queued`, and dispatches the job after the transaction commits.
  Repeated requests while the same run is `queued` or `running` return the
  existing game without dispatching a second job. An
  `awaiting human input` game is already saved and returns without dispatching;
  a completed game or a failed game with committed bootstrap history returns a
  stable conflict response. *Done when:* an owner receives HTTP 202 with
  `lifecycle_status: queued` for a new or retryable failed game, exactly one job
  is pushed per active attempt, a foreign or unauthenticated caller cannot
  start the game, concurrent or repeated starts cannot enqueue duplicates, and
  no engine request is made by this step.
- [x] **Step 2 - Persist a successful bootstrap job** - implement the queued
  job and its orchestration service. Make the job unique per game, claim a
  queued or resumable running game, increment
  `run_attempts`, set `started_at`, call Go with the exact persisted seed,
  ruleset, map, and ordered seat payload, then atomically write the
  `bootstrap.v1` system command, returned events, `state-v1` state, and the
  initial snapshot. Advance the game to `running` while leaving `completed_at`
  and `result` null. *Done when:* a job run produces one command, all ordered
  events with preserved visibility metadata, one snapshot at the matching
  command/event position, the canonical state and schema version, correct
  sequence cursors, and a second or stale delivery cannot create duplicates.
- [x] **Step 3 - Harden retries and terminal failures** - classify engine
  unavailability, protocol errors, and unexpected exceptions; retry transient
  failures with a bounded queue policy; and persist stable failure metadata only
  after a non-retryable or exhausted failure. Keep transactions all-or-nothing
  so a failed persistence attempt leaves no partial command, event, or snapshot.
  *Done when:* unavailable calls are retried and eventually become
  `failed` with sanitized metadata, malformed or non-success engine responses
  fail without creating history, attempt and timestamp fields are consistent,
  successful games are not overwritten by a late failure callback, the focused
  tests pass, the full Laravel suite passes, and Pint is clean.

## Files / areas

- `apps/api/routes/api.php` for the authenticated start-run route.
- A focused controller and/or action under
  `apps/api/app/Http/Controllers/Api/V1/` for owner lookup and HTTP responses.
- A queued job under `apps/api/app/Jobs/` for retry configuration, claiming,
  engine invocation, and final failure handling.
- A focused orchestration service under `apps/api/app/Services/` for request
  construction and transactional persistence, keeping the job thin.
- `apps/api/app/Models/Game.php` only if a lifecycle scope or helper is needed;
  do not expose canonical state through the existing resources.
- `apps/api/tests/Feature/GameRunTest.php` or an equivalently focused feature
  test covering the route, job, persistence, and failure paths.
- Existing `GameEngineClient`, command/event/snapshot models, and queue
  configuration are reused; migrations, Go files, and React files should remain
  unchanged unless a narrowly evidenced contract gap requires otherwise.

## Data / contracts

### Start-run API

The Laravel route is owner-scoped and uses Sanctum authentication:

```http
POST /api/v1/games/{game}/run
Accept: application/json
```

The request has no JSON body. The server derives all engine input from the
persisted game and seats. The first accepted request returns HTTP 202 and the
existing `GameResource` envelope with `data.lifecycle_status` set to `queued`.
While a run is `queued` or `running`, a repeated request returns the same
resource and does not enqueue another job. A game in `awaiting human input`
returns its saved resource without dispatching; a later gameplay command will
resume it. A `failed` game may be requeued only when no `bootstrap.v1` command
exists; the retry clears the latest failure fields, preserves the same game and
idempotency key, and returns HTTP 202. A completed game, or a failed game whose
bootstrap command already exists, returns HTTP 409 with the existing error shape
and `game_run_not_startable`. A non-owner is indistinguishable from a missing
game and receives the existing `game_not_found` 404 response.

If the application can observe a queue push failure after the lifecycle update,
it records `failed` with `queue_dispatch_failed` and returns a stable 503 error;
the feature does not attempt to solve a process crash between commit and push.

### Lifecycle and attempt contract

| Situation | `lifecycle_status` | Timestamps and counters |
|---|---|---|
| New game | `created` | `run_attempts = 0`, no execution timestamps |
| Accepted dispatch | `queued` | no attempt is counted yet |
| Job claims work | `running` | increment `run_attempts`; set `started_at` on the first attempt |
| Bootstrap persisted | `running` | keep `completed_at` and `result` null; later gameplay owns completion |
| Saved human game | `awaiting human input` | no queue job; later commands use the persisted state |
| Non-retryable or exhausted failure | `failed` | set stable failure fields and terminal `completed_at` |
| Retryable failed bootstrap | `queued` | clear the latest failure fields; preserve cumulative `run_attempts` |
| Finished game | `completed` | terminal; starting again requires a new game |

The `running` result is intentional: a successful bootstrap initializes the
canonical state but does not finish a Catan match. A later spec may transition a
human game to `awaiting human input` once legal commands exist.

### Engine request and persisted command

The job sends the same shape already accepted by Go:

```json
{
  "seed": "894177203164",
  "ruleset_key": "base",
  "map_key": "standard",
  "seats": [
    {"seat_number": 1, "controller_type": "human"},
    {"seat_number": 2, "controller_type": "ai"},
    {"seat_number": 3, "controller_type": "ai"}
  ]
}
```

Seats come from the ordered `game_seats` relationship. The bootstrap command is
a system command with:

- `sequence = 1`;
- deterministic per-game `idempotency_key = bootstrap:{game_id}`;
- `acting_seat_number = null`;
- `command_type = bootstrap.v1`;
- `payload` equal to the canonical request sent to Go.

The idempotency key is load-bearing. It lets a redelivered job safely repeat a
deterministic engine call while PostgreSQL prevents a second canonical command.

### Successful persistence contract

Inside one database transaction, the job stores:

- `state_schema_version` and `current_state` from the engine response;
- every returned event, in sequence order, preserving `event_type`, `payload`,
  `visibility`, and `visible_to_seat_number`, linked to the bootstrap command;
  persistence supplies `occurred_at` because the bootstrap response has no event
  timestamp;
- an initial `GameSnapshot` with `command_sequence = 1`, the last event
  sequence, the state schema version, and the returned state;
- `last_command_sequence = 1` and `last_event_sequence = max(event.sequence)`;
- `lifecycle_status = running`, with failure fields still null for this first
  accepted run.

The response remains an internal engine result. Existing `GameResource` and
`GameSummaryResource` must not expose `current_state`, private event payloads,
or snapshots in this feature.

The client validates `execution_schema_version` at the Go boundary. Feature 3a
does not provide a separate game column for it, so this slice persists the
state schema version and the versioned command/event names that are load-bearing
for later decoding.

### Failure contract

Failure details are durable but not public yet. Use stable codes and sanitized
messages, for example:

- `game_engine_unavailable` for an unavailable or timed-out engine after the
  queue retry limit;
- `game_engine_protocol` for a non-success or malformed successful response;
- `game_execution_failed` for an unexpected terminal exception;
- `queue_dispatch_failed` if the application can observe that the queue rejected
  the post-commit dispatch.

Transient `game_engine_unavailable` errors are rethrown for bounded queue
retries. `game_engine_protocol` errors are deterministic and fail without
another engine call.

No stack trace, request secret, or raw internal exception detail is persisted in
`failure_message`. A failure transaction must not leave partially written
history. A late `failed()` callback must not overwrite a game whose successful
bootstrap transaction already committed. Retrying a failed bootstrap reuses the
same game and command idempotency key; this slice does not maintain a separate
attempt-history table.

## Testing

- Use PHPUnit feature coverage with `LazilyRefreshDatabase`, existing user/game
  factories, `Queue::fake()` for dispatch assertions, and `Http::fake()` for
  engine responses.
- Step 1 tests cover authentication, owner scoping, HTTP 202, lifecycle locking,
  duplicate starts, retrying a failed game without bootstrap history, saved
  `awaiting human input` games, and the absence of an engine call before the job
  runs.
- Step 2 tests cover the exact engine payload, command/event/snapshot writes,
  JSON casts, sequence cursors, schema versions, visibility metadata, and
  duplicate job delivery.
- Step 3 tests cover unavailable-engine retries, protocol failures, malformed
  responses, unexpected exceptions, transaction rollback, attempt counts,
  timestamps, queue-dispatch errors, and late failure callbacks.
- Run the focused run/orchestration test first, then
  `cd apps/api && composer test` and
  `cd apps/api && vendor/bin/pint --dirty --format agent`.
- No Go test or browser test is required because this slice does not change the
  Go service or React application. The existing Laravel-to-Go contract tests
  remain the boundary evidence for the client.

## Notes for the AI

- Laravel owns authorization, lifecycle, queueing, and persistence. Do not add
  game rules or random decisions to the job or service.
- Scope every route lookup through the authenticated owner's relationship; never
  trust a client-supplied owner ID.
- A user may own many independent games. The queue uniqueness key is the game id,
  so one user can start or resume several games without cross-game locking.
- Dispatch only after the `created -> queued` transaction commits so a worker
  cannot observe an uncommitted game. The job must still guard against stale or
  duplicate deliveries.
- Keep the queue driver agnostic. Database queues may be used in tests and the
  current local configuration; Redis and Docker wiring belong to feature 3d.
- Use database transactions for the command, events, snapshot, state, and
  lifecycle update so accepted execution is never partially visible.
- Make the job unique per game and keep the deterministic command idempotency
  key as a database backstop. A retry of the same job may resume a `running`
  game when the bootstrap command is absent; a delivery that finds the command
  already persisted must exit without another engine call or write. Prefer
  Laravel's `ShouldBeUnique` contract keyed by the game id, with the database
  idempotency constraint as the durable backstop.
- Treat the Go response as canonical and preserve its version and visibility
  metadata. Do not expose opaque canonical state through the existing library
  resources.
- Do not add a new run table, outbox, manual retry endpoint, or gameplay
  abstraction in this slice. If dispatch-failure recovery needs more durable
  coordination than the current schema supports, stop and surface it for a
  separate design decision rather than hiding it in Redis.
- There is a small crash window between the committed `created -> queued`
  update and the after-commit queue push. Handle observable push errors as
  `queue_dispatch_failed`, but do not invent an outbox in this feature.
  Eliminating that window is a separate persistence design decision.
- Review the load-bearing choices before implementation: the route shape,
  conflict behavior for terminal games, retrying only failed games without a
  committed bootstrap command, the deterministic bootstrap command key, and
  the decision that bootstrap success remains `running`.
