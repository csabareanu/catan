# Feature 5b: Deterministic AI setup execution

**From build-plan:** feature 5b, Deterministic AI setup execution
**Type:** Feature sub-item
**Parent:** Feature 5, Initial placement phase
**Status:** complete
**Branch:** `feature/5b-deterministic-ai-setup-execution`

## Goal

Run the Go initial-placement policy for each AI seat when it becomes active,
then persist the resulting setup history through the existing queued Laravel
pipeline. A human-controlled game pauses when its human seat becomes active;
the engine never chooses that player's placement.

## In scope

- Add a versioned Go run operation that initializes setup, applies
  `RandomPlacementPolicy v1` for active AI seats, and returns each ordered
  transition with its resulting canonical state and events.
- Stop the run at the first active human seat, or at `turn_ready` if setup has
  no human seat. Do not precompute placements beyond a human turn.
- Have Laravel validate the engine response against the persisted game
  configuration and persist each transition as a command, its events, and a
  snapshot in one database transaction.
- Preserve the setup policy version and selected option ID separately from the
  accepted placement command payload.
- Keep queued execution retry-safe: a failed database transaction leaves no
  partial run history, a retry produces the same choices, and duplicate job
  delivery does not duplicate persisted history.
- Set lifecycle status to `awaiting human input` when setup pauses at the human
  seat. Keep it `running` when setup reaches `turn_ready`, since the match has
  not finished.

## Out of scope

- Human placement submission through Laravel or React. Feature 11 owns that
  command flow and resuming AI execution after a human placement.
- Setup state and event rendering in the observer. Feature 5c owns those public
  projections and browser changes.
- Normal turns, match results, winner calculation, or marking `turn_ready` as a
  completed game.
- Creating new game modes or changing the current placement policy.
- Backfilling games that already have only the earlier bootstrap state. Their
  stored history remains valid under its recorded state schema version.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files; the user reads and understands it.
4. The user approves before choosing whether to commit a checkpoint or continue.
   Checkpoints are optional; `/complete` makes the real feature-level commit.

Never accept a step that has not been reviewed. If a diff is too big to read in
one sitting, split the step before proceeding.

## Build steps

- [x] **Step 1 - deterministic setup runner in Go** - add a domain operation
  that bootstraps a run, begins initial placement, and applies one policy
  decision whenever the active seat is AI. Return each transition's command
  details, optional decision metadata, resulting state, and ordered events.
  Stop at an active human seat or `turn_ready`. Do not assign numeric command
  sequences in Go. *Done when:* repeated calls with identical configuration
  produce identical results; three-seat and four-seat AI-only runs complete
  setup; human-controlled runs stop before choosing for the human; and all
  generated choices pass through the existing legal transition.
- [x] **Step 2 - versioned Go HTTP contract** - expose the setup runner at
  `POST /v1/runs/initial-placement` without changing
  `POST /v1/runs/bootstrap`. Define and test the request, transition list,
  event payload serialization, stop reason, and `setup_run_schema_version`.
  *Done when:* valid three-seat, four-seat, and human-seat requests return the
  documented deterministic response; malformed JSON, invalid seats, and
  unsupported configuration return the established error shape; and the
  existing bootstrap endpoint tests remain green.
- [x] **Step 3 - Laravel engine response contract** - add a client method for
  the new endpoint and reject malformed, incomplete, or game-mismatched
  responses before persistence. Validate transition ordering, state schema
  versions, event sequence continuity, visibility metadata, and the presence
  of decision metadata only for policy-generated AI commands. *Done when:*
  focused Laravel tests accept a valid response and reject each invalid
  contract case without writing game history.
- [x] **Step 4 - atomic queued persistence and lifecycle** - persist the
  bootstrap, system setup-start transition, and AI placement transitions in
  response order. Laravel assigns consecutive command sequences, stores each
  transition state as its snapshot, links its events to the persisted command,
  updates game cursors and canonical state, and uses stable per-transition
  idempotency keys. Add nullable `decision_metadata` to `game_commands` for
  `{ "policy_version": "random_placement.v1", "option_id": "..." }`, leaving
  the accepted placement payload as only its settlement and road IDs. Pause
  human games at `awaiting human input`; keep setup-complete games `running`.
  Update the Compose smoke checks to verify the resulting lifecycle and setup
  history. *Done when:* queued execution persists ordered commands, events,
  and snapshots; a human seat is never given an AI placement; duplicate
  delivery adds no records; and failures leave either the complete transaction
  or no part of its history.

## Files / areas

- `services/game-engine/internal/execution/` - deterministic setup runner and
  focused execution tests.
- `services/game-engine/internal/httpapi/runs.go`,
  `services/game-engine/internal/httpapi/boards.go`, and
  `services/game-engine/internal/httpapi/runs_test.go` - new versioned
  request/response DTOs, route registration, and endpoint tests. Preserve the
  bootstrap endpoint contract.
- `apps/api/app/Services/GameEngineClient.php` - response validation for the
  setup-run contract.
- `apps/api/app/Services/GameBootstrapService.php` - persist ordered setup
  transitions and final lifecycle state atomically.
- `apps/api/app/Models/GameCommand.php` and a migration - nullable policy
  decision metadata.
- `apps/api/tests/Feature/GameEngineClientTest.php` and
  `apps/api/tests/Feature/GameRunTest.php` - response, persistence, retry, and
  duplicate-delivery coverage.
- `scripts/compose-smoke.sh` and
  `apps/web/e2e/compose-observer-smoke.spec.ts` - update real-stack expectations
  for persisted setup history and the human-wait lifecycle status.
- No React application component or public replay projection changes are
  expected in this feature.

## Data / contracts

- New engine endpoint: `POST /v1/runs/initial-placement`. Its request uses the
  bootstrap configuration fields: `seed`, `ruleset_key`, `map_key`, and
  `seats`.
- The response identifies `setup_run_schema_version: "1"`, the seed, ruleset
  key and version, map key, version and orientation, a `stop_reason` of
  `human_input_required` or `turn_ready`, and an ordered `transitions` list.
  Each transition contains `command_type`, nullable `acting_seat_number`, the
  accepted `payload`, nullable `decision_metadata`, `state_schema_version`,
  resulting `state`, and that transition's ordered `events`.
- Transition command types are `bootstrap.v1`,
  `begin_initial_placement.v1` for the system setup-start transition, and
  `place_initial_settlement_and_road.v1` for AI decisions. The setup-start
  system command has no acting seat and an empty object payload. A policy
  decision contains `policy_version` and `option_id`; explicit game commands
  retain the 5a payload shape with only `settlement_vertex_id` and
  `road_edge_id`.
- Setup events preserve the 5a payloads and visibility: the start event carries
  `seat_order`, `round`, and `active_seat_number`; settlement and road events
  identify their seat and board IDs; a second-round resource event carries the
  receiving seat and granted counts; and the completion event carries
  `seat_order` and `next_phase`. These events are public as defined by 5a.
- The response has no numeric command sequence. Laravel assigns command
  sequences in transition order. Event sequences are global across the whole
  run: `game_initialized.v1` is sequence 1 and setup events continue from
  sequence 2.
- Persist one snapshot after each transition at that command's sequence. The
  first snapshot uses `state-v1`; setup snapshots use `state-v2`. The final
  canonical state stays internal to Laravel persistence and is not added to a
  public game response by this feature.
- Store policy provenance in nullable `game_commands.decision_metadata`, not
  inside `payload`. This keeps accepted command input distinct from the AI's
  choice record and preserves the 5a command contract.
- The full database write for one setup run is atomic. The existing bootstrap
  idempotency key remains the marker that the whole initial run was persisted;
  setup start uses `initial-placement:start`, and each AI placement uses
  `initial-placement:{round}:{seat_number}` as its stable per-transition key
  within that game. The existing Compose smoke creates a human-versus-AI game,
  so it should finish at `awaiting human input` with at least the bootstrap and
  setup-start commands, plus any AI placements before the human turn.
- `turn_ready` means setup is complete, not that the match is complete. For an
  AI-only run, lifecycle remains `running` until later turn features execute.

## Testing

- Go: focused runner and HTTP tests cover deterministic repetition, seeded
  three-seat and four-seat setup order, complete AI-only setup, stopping before
  a human decision, legal policy choices, globally ordered events, response
  serialization, and invalid requests. Run
  `cd services/game-engine && go test ./...`.
- Laravel: focused client tests cover valid and malformed contracts and game
  identity mismatches. Feature tests cover persisted command/event/snapshot
  order, policy metadata, lifecycle, transaction rollback, engine failure and
  retry, duplicate job delivery, and no history duplication. Run
  `cd apps/api && composer test`.
- Compose: update `scripts/compose-smoke.sh` to wait for
  `awaiting human input` and verify the persisted setup command, event, and
  snapshot sequence. The observer smoke should accept the new lifecycle label
  while continuing to check that the real replay API and browser load without
  request or console errors.
- Verify the cross-service contract on both sides with the Go HTTP tests and
  Laravel client tests. Before closing the feature, run a real API-to-engine
  queued-run smoke using the documented Compose development stack, then run
  `scripts/compose-observer-smoke.sh` for the real browser/API path. Feature 5c
  owns setup-specific observer rendering and public setup projections.

## Notes for the AI

- Go owns setup order, policy choices, legality, state transitions, and events.
  Laravel owns queue lifecycle, command numbering, authorization, persistence,
  and transport validation. Do not copy placement rules into PHP or React.
- Keep `POST /v1/runs/bootstrap` backward-compatible. The new setup-run
  response is a separate contract.
- `BeginInitialPlacement` is a system transition, not a player placement. Its
  persisted command uses a null acting seat so the event and snapshot have a
  stable history position.
- The engine must stop as soon as the active seat is human. It may finish both
  setup rounds only when every seat is AI-controlled.
- Policy metadata is internal provenance. Do not include it in the accepted
  command payload or public replay projection.
- Keep resource counts in canonical `state-v2` private. The replay projection
  remains viewer-safe; Feature 5c adds the public setup state fields it needs.
- Do not mark setup completion as match completion. Feature 6 owns the first
  normal turn after `turn_ready`.
- Follow existing queue idempotency and sanitized failure handling. Keep the
  Go engine stateless and use only the existing Laravel, PostgreSQL, Redis,
  and Go services.
