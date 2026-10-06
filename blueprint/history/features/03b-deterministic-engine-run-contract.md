# Feature: Deterministic engine run contract

**From build-plan:** feature 3b
**Status:** complete

## Goal

Add the first versioned execution boundary between Laravel and the stateless Go
engine. Given a canonical seed, ruleset, map, and seat configuration, Go must
produce the same bootstrap state and ordered initialization events every time.
Laravel must be able to call that boundary, validate the response, and classify
unavailable or malformed engine responses without persisting execution yet.

This proves the engine run contract before queue orchestration and gameplay rules
are introduced.

## In scope

- A deterministic Go bootstrap execution function that reuses the existing
  seeded board generator.
- A versioned Go HTTP endpoint at `POST /v1/runs/bootstrap`.
- A canonical request containing seed, ruleset key, map key, and three or four
  ordered seats with `human` or `ai` controller types.
- A versioned response containing execution metadata, canonical bootstrap state,
  and ordered public initialization events.
- Stable validation and JSON error responses for malformed input and unsupported
  configuration.
- A Laravel `GameEngineClient` method that calls and validates the bootstrap
  response.
- Focused Go HTTP/domain tests and Laravel client contract tests.

## Out of scope

- Queue jobs, Redis coordination, retries, or Docker Compose. These belong to
  Features 3c and 3d.
- Persisting commands, events, snapshots, or `current_state`. Feature 3a
  created the storage contract; Feature 3c will orchestrate persistence.
- A public Laravel route that lets an owner start a run. That belongs to 3c.
- Human commands, AI decisions, turn execution, initial placement, or other
  gameplay rules.
- Public or seat-specific state projections. The bootstrap state is an internal
  engine result until a later API feature exposes a safe projection.
- React changes.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files, for review.
4. The user approves the step before the next step or an optional checkpoint
   commit.

`/complete` makes the final feature-level commit. No step should be accepted
without being read and understood.

## Build steps

- [x] **Step 1 - Define the deterministic bootstrap contract in Go** - create a
  small execution/domain package with validated input, deterministic bootstrap
  state, ordered initialization events, schema versions, and typed errors. Reuse
  `board.Generate` rather than duplicating board rules. *Done when:* valid three-
  and four-seat configurations produce identical typed results for repeated
  calls with identical input, invalid seats/configuration return distinguishable
  errors, and `go test ./...` passes.
- [x] **Step 2 - Expose the versioned Go bootstrap endpoint** - register
  `POST /v1/runs/bootstrap` in the existing `httpapi` handler, decode and
  validate the JSON request, convert the domain result to explicit response DTOs,
  and preserve the existing error envelope. *Done when:* Go HTTP tests prove a
  stable `200` JSON response with `execution_schema_version: "1"`,
  `state_schema_version: "state-v1"`, the requested metadata, a deterministic
  bootstrap state, and a first `game_initialized.v1` public event; malformed,
  unsupported, duplicate, and wrongly typed requests return stable errors.
- [x] **Step 3 - Add the Laravel engine client contract** - add a
  `bootstrapRun` method to `GameEngineClient` with response-shape validation and
  the same unavailable/protocol exception boundary used by board generation.
  Add Laravel tests for forwarding the exact payload, accepting a valid response,
  and safely rejecting connection failures, non-success responses, and malformed
  successful responses. *Done when:* focused tests and `composer test` pass, and
  no game or execution record is written by this client-only slice.

## Files / areas

- `services/game-engine/internal/execution/` - new deterministic bootstrap
  domain contract and tests.
- `services/game-engine/internal/httpapi/` - new run request/response DTOs,
  endpoint handler, route registration, and HTTP tests.
- `services/game-engine/internal/board/` - reuse only; do not duplicate board
  generation logic.
- `apps/api/app/Services/GameEngineClient.php` - Laravel bootstrap client method
  and response validation.
- `apps/api/tests/Feature/` - Laravel-to-engine contract tests using the existing
  HTTP fakes.
- No migrations, Eloquent models, React components, queue jobs, or public game
  routes are expected in this feature.

## Data / contracts

### Go request

`POST /v1/runs/bootstrap` accepts one JSON object:

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

The engine accepts exactly three or four seats, with unique seat numbers from 1
through the seat count. The response and internal state normalize seats in seat
number order. There must be no requirement for a human seat, so AI-only runs
remain possible. User IDs and player labels do not cross this engine contract.

### Go response

Successful responses use the existing `{"data": ...}` envelope:

```json
{
  "data": {
    "execution_schema_version": "1",
    "state_schema_version": "state-v1",
    "seed": "894177203164",
    "ruleset": {"key": "base", "version": "1.0.0"},
    "map": {
      "key": "standard",
      "version": "1.0.0",
      "orientation": "pointy"
    },
    "state": {
      "phase": "initialized",
      "board": {},
      "seats": [
        {"seat_number": 1, "controller_type": "human"},
        {"seat_number": 2, "controller_type": "ai"},
        {"seat_number": 3, "controller_type": "ai"}
      ]
    },
    "events": [
      {
        "sequence": 1,
        "event_type": "game_initialized.v1",
        "payload": {
          "seed": "894177203164",
          "seat_count": 3
        },
        "visibility": "public",
        "visible_to_seat_number": null
      }
    ]
  }
}
```

The `board` value in the real response is the canonical board structure already
returned by the board contract. The example is abbreviated only for readability.
Event sequences start at 1 for this bootstrap response. Laravel owns database
command IDs, idempotency keys, persistence, and lifecycle transitions in Feature
3c; Go only returns deterministic state and events here.

The state and event names are load-bearing contracts. Changes require a new
schema or event version rather than silently changing the meaning of an old
response.

### Error contract

Go keeps the existing JSON error envelope:

```json
{
  "error": {
    "code": "invalid_seats",
    "message": "The bootstrap run must contain three or four unique seats."
  }
}
```

Expected classifications include malformed JSON, wrong JSON field types,
invalid seeds, unsupported rulesets or maps, and invalid seat configuration.
Laravel maps an unreachable engine to `GameEngineUnavailable` and a non-success
or malformed successful response to `GameEngineProtocolException`, without
leaking internal errors to public callers.

## Testing

- Go domain tests cover deterministic equality, three-seat and four-seat valid
  input, AI-only input, canonical seat ordering, and invalid configuration.
- Go HTTP tests use `httptest` and `httpapi.NewHandler()` directly. They cover
  the success envelope, exact version fields, ordered initialization events,
  repeated identical JSON output, malformed JSON, trailing JSON, wrong field
  types, unsupported configuration, invalid seats, and method restrictions.
- Laravel tests use `Http::fake` to verify the exact request sent to Go and the
  client behavior for valid, unavailable, non-success, and malformed responses.
- Run `gofmt` on changed Go files and `cd services/game-engine && go test ./...`.
- Run `vendor/bin/pint --dirty --format agent` and `cd apps/api && composer test`
  after Laravel changes.
- No browser verification is needed because this feature has no UI changes.

## Notes for the AI

- Keep Go domain code independent of HTTP, Laravel, PostgreSQL, and Redis.
- Keep transport DTOs explicit. Do not JSON-encode internal structs directly if
  their field names or optional values differ from the public contract.
- Reuse the existing deterministic board generator and version metadata. Do not
  introduce a second random source or a second board representation.
- Laravel validates transport and response shape; Go remains responsible for
  canonical engine behavior.
- Do not persist anything or dispatch jobs in this feature. Those concerns belong
  to Feature 3c and must not be pulled forward accidentally.
- Preserve the existing board endpoint and error envelope while adding the run
  endpoint.
- If any contract choice blocks a coherent implementation, stop and surface it
  for review instead of inventing a broader abstraction.
