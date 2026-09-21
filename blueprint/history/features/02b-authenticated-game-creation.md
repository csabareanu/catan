# Feature: Authenticated game creation

**From build-plan:** feature 2b, under feature 2
**Status:** complete

## Goal

Allow an authenticated user to create a reproducible Catan game with one human
seat and either two or three AI seats. Laravel validates the request, asks the
stateless Go service for the canonical board, persists the game configuration and
seat ownership, and returns the created game resource.

This establishes the durable game and seat identity needed by later execution
and private-library features without starting gameplay or queue work.

## In scope

- A protected versioned `POST /api/v1/games` endpoint.
- Validation of a canonical seed, supported ruleset/map, and an AI seat count of
  two or three.
- Synchronous use of the existing Go board-generation boundary.
- Transactional persistence of one owned `Game` record and its human and AI
  `GameSeat` records.
- A stable created-game JSON resource containing configuration, board snapshot,
  lifecycle status, and seat metadata.
- Eloquent models, relationships, casts, constraints, factories, and focused
  PHPUnit feature coverage.
- Safe mapping of unauthenticated, validation, unavailable-engine, and invalid
  engine responses.

## Out of scope

- Listing, viewing, or deleting games. Those belong to feature 2c.
- Queued execution, Go gameplay state, commands, events, snapshots, retries, or
  AI decisions. Those belong to feature 3 and later gameplay features.
- React registration, login, game-creation screens, or client auth state.
- Multiple human-controlled seats or human-only internet play.
- Random server-generated seeds, custom maps, expansion rules, or arbitrary
  rulesets.
- Idempotency keys or deduplication for repeated create requests.
- Game names, invitations, sharing, permissions beyond owner creation, and
  administration.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); the user reads and understands it.
4. The user approves, then chooses whether to commit a checkpoint or roll
   straight on. `/complete` makes the real feature-level commit at the end.

Never accept a step the user has not reviewed. If a diff is too large to read in
one sitting, split the step.

## Build steps

- [x] **Step 1 - Add game and seat persistence** - create the `games` and
  `game_seats` migrations, Eloquent models, owner and seat relationships,
  JSON casts, factories, foreign-key behavior, and unique seat constraint.
  *Done when:* a fresh test database can migrate these tables, a game belongs to
  its authenticated owner, seats belong to their game, and the model contract
  tests prove the owner and seat relationships plus cascade behavior without
  introducing gameplay fields prematurely.

- [x] **Step 2 - Create a game through the authenticated API** - add the
  versioned Form Request, creation service, controller, resources, protected
  route, and successful persistence flow. The service validates the Go board
  metadata, stores the canonical board response, derives seat count from the AI
  count, and creates seat 1 for the authenticated owner followed by AI seats.
  *Done when:* an authenticated request with two or three AI seats returns HTTP
  201, creates exactly one owned game and the expected ordered seats, stores the
  supplied seed and generated board, and returns the documented resource with
  `lifecycle_status: created`.

- [x] **Step 3 - Harden boundaries and failure paths** - add stable validation,
  authentication, upstream failure, metadata-mismatch, and no-partial-record
  behavior. Confirm the endpoint does not accept a client-supplied owner,
  preserves the board contract, and leaves queue or gameplay state untouched.
  *Done when:* focused tests prove HTTP 401, 422, 502, and 503 behavior, verify
  the Go boundary is not called for invalid input, verify no game or seats are
  persisted when board generation fails, and the focused plus full Laravel
  suites and Pint pass.

## Files / areas

- `apps/api/database/migrations/` for the games and game-seats schema.
- `apps/api/app/Models/Game.php` and
  `apps/api/app/Models/GameSeat.php` for persistence and relationships.
- `apps/api/app/Models/User.php` for owned-game and human-seat relationships.
- `apps/api/database/factories/` for reusable game and seat test data.
- `apps/api/app/Http/Requests/Api/V1/CreateGameRequest.php` for transport
  validation and stable validation errors.
- `apps/api/app/Services/GameCreationService.php` for board orchestration and
  transactional persistence.
- `apps/api/app/Http/Controllers/Api/V1/CreateGameController.php` for the
  authenticated HTTP boundary.
- `apps/api/app/Http/Resources/Api/V1/GameResource.php` and
  `GameSeatResource.php` for the response contract.
- `apps/api/routes/api.php` for the protected `/v1/games` route.
- `apps/api/tests/Feature/GameCreationTest.php` and model-focused tests for
  behavior and persistence invariants.
- The existing `GameEngineClient` for the Go board-generation boundary; do not
  duplicate HTTP client logic in the controller.

## Data / contracts

### Create request

The endpoint is:

`POST /api/v1/games`

It requires an `Authorization: Bearer <token>` header and accepts:

```json
{
  "seed": "894177203164",
  "ruleset_key": "base",
  "map_key": "standard",
  "ai_count": 2
}
```

Validation rules:

- `seed` is a required canonical non-negative base-10 string in the signed
  64-bit range. It has no leading zeros except `"0"`.
- `ruleset_key` is required and currently must be `base`.
- `map_key` is required and currently must be `standard`.
- `ai_count` is a required integer and must be `2` or `3`.

The client cannot supply `owner_id`, `human_seat_number`, `seat_count`,
controller types, seat user IDs, lifecycle status, or board data. Laravel
derives these from the authenticated user, the validated AI count, and the Go
response.

### Persisted game

The initial `games` row contains:

- `owner_id`: the authenticated user's ID.
- `mode`: `human_vs_ai`.
- `ruleset_key` and `ruleset_version`: the canonical Go response values.
- `seed`: the canonical request seed string.
- `seat_count`: `1 + ai_count`, therefore three or four.
- `human_seat_number`: `1`.
- `lifecycle_status`: `created`.
- `configuration`: immutable JSON options, including `ai_count`, `map_key`,
  `map_version`, and `board_schema_version`.
- `board_configuration`: the complete Go `data` board object containing
  board metadata, hexes, vertices, edges, and ports.

Gameplay state, command/event cursors, snapshots, results, and failure lifecycle
fields are deliberately deferred to feature 3.

### Persisted seats

For `ai_count: 2`, seats are numbered 1 through 3. For `ai_count: 3`,
seats are numbered 1 through 4.

- Seat 1: `controller_type: human`, `user_id: owner_id`, and the owner's
  display name as its initial label.
- Remaining seats: `controller_type: ai`, `user_id: null`, and stable labels
  `AI 1`, `AI 2`, and optionally `AI 3`.
- `game_id` plus `seat_number` is unique.
- Deleting an owner cascades to owned games and their seats. Deleting a future
  human seat user nulls the seat reference rather than changing game ownership.

### Eloquent model shape

`GameSeat` is the stable seat identity used by the engine. It is not a separate
player account and it is not replaced by an AI user record.

The relationships are:

```text
User
  hasMany ownedGames through games.owner_id
  hasMany gameSeats through game_seats.user_id

Game
  belongsTo owner through owner_id
  hasMany seats through game_seats.game_id

GameSeat
  belongsTo game through game_id
  belongsTo user through user_id (nullable for AI seats)
```

The database shape is:

```text
games
  id
  owner_id              -> users.id
  mode                  = human_vs_ai
  ruleset_key
  ruleset_version
  seed
  seat_count
  human_seat_number     = 1 for this feature
  lifecycle_status      = created
  configuration         JSON
  board_configuration   JSON

game_seats
  id
  game_id               -> games.id
  seat_number           1, 2, 3, or 4
  controller_type       human or ai
  user_id               -> users.id, nullable
  label
```

The creation service enforces the cross-field rules that a database check does
not express portably in the SQLite test database:

- Seat numbers are contiguous and start at 1.
- Seat 1 is the authenticated owner, has `controller_type: human`, and has a
  non-null `user_id`.
- AI seats have `controller_type: ai` and a null `user_id`.
- `game_id` plus `seat_number` is unique.
- The `GameSeat` rows, not `human_seat_number`, are the authoritative list of
  human and AI controllers.

For a three-seat game, the persisted relationship looks like this:

```json
{
  "game": {
    "id": 1,
    "owner_id": 7,
    "seat_count": 3,
    "human_seat_number": 1
  },
  "seats": [
    {
      "seat_number": 1,
      "controller_type": "human",
      "user_id": 7,
      "label": "Ada Player"
    },
    {
      "seat_number": 2,
      "controller_type": "ai",
      "user_id": null,
      "label": "AI 1"
    },
    {
      "seat_number": 3,
      "controller_type": "ai",
      "user_id": null,
      "label": "AI 2"
    }
  ]
}
```

### Created response

A successful request returns HTTP 201:

```json
{
  "data": {
    "id": 1,
    "owner_id": 7,
    "mode": "human_vs_ai",
    "seed": "894177203164",
    "ruleset": {
      "key": "base",
      "version": "1.0.0"
    },
    "map": {
      "key": "standard",
      "version": "1.0.0",
      "orientation": "pointy"
    },
    "seat_count": 3,
    "human_seat_number": 1,
    "lifecycle_status": "created",
    "configuration": {
      "ai_count": 2,
      "map_key": "standard",
      "map_version": "1.0.0",
      "board_schema_version": "1"
    },
    "board": {
      "board_schema_version": "1",
      "seed": "894177203164",
      "ruleset": {},
      "map": {},
      "hexes": [],
      "vertices": [],
      "edges": [],
      "ports": []
    },
    "seats": [
      {
        "seat_number": 1,
        "controller_type": "human",
        "user_id": 7,
        "label": "Ada Player"
      },
      {
        "seat_number": 2,
        "controller_type": "ai",
        "user_id": null,
        "label": "AI 1"
      },
      {
        "seat_number": 3,
        "controller_type": "ai",
        "user_id": null,
        "label": "AI 2"
      }
    ],
    "created_at": "2026-09-21T12:00:00.000000Z"
  }
}
```

The board arrays are abbreviated above for readability. The real response
contains the canonical generated board. The response is a snapshot of creation;
it does not imply that turns or AI execution have started.

### Errors

- Missing or invalid bearer token: HTTP 401 with the existing
  `unauthenticated` envelope.
- Invalid request: HTTP 422 with `validation_failed`, a game-creation message,
  and field errors.
- Go service unavailable or timed out: HTTP 503 with
  `game_engine_unavailable`.
- Go response malformed or inconsistent with the request: HTTP 502 with
  `invalid_game_engine_response`.
- Expected upstream failures create no game or seat records. Internal database
  failures must not expose SQL details.

## Testing

- Use PHPUnit feature tests with `LazilyRefreshDatabase`, the existing
  `UserFactory`, and HTTP fakes for the Go boundary.
- Step 1 tests cover migrations, relationships, casts, unique seat numbers, and
  owner deletion behavior.
- Step 2 tests cover authenticated creation with two and three AI seats,
  canonical board persistence, owner derivation, ordered seat labels, response
  status, and `created` lifecycle state.
- Step 3 tests cover missing or invalid authentication, all validation failures,
  unsupported ruleset/map, upstream unavailable and malformed responses,
  response metadata mismatch, no upstream call on invalid input, and no
  persisted records after expected upstream failure.
- Run the focused game-creation tests first, then
  `cd apps/api && composer test`. Run
  `cd apps/api && vendor/bin/pint --dirty --format agent` after PHP changes.
- No browser test is required because this slice adds no React UI.

## Notes for the AI

- Laravel owns authentication, validation, persistence, and API resources.
  Go remains the authority for board generation only.
- Call the Go service before opening the database transaction. The network call
  must not hold a database transaction open; persist the game and all seats
  atomically only after a valid board is available.
- Verify the returned board seed, ruleset key, and map key match the request
  before persistence. Store the Go `data` object without rewriting topology.
- Derive the owner exclusively from `$request->user()`; never trust a client
  owner ID.
- Eager-load seats for the creation response and keep seat order deterministic.
- Use explicit JSON casts and stable API resources. Do not return future
  `current_state` or private gameplay data.
- Keep controllers thin and avoid adding a second board-generation client.
- A repeated valid request intentionally creates another game until a future
  idempotency policy is approved.
- Preserve seams for future human seats, rulesets, maps, and AI strategies
  without implementing them in this slice.
