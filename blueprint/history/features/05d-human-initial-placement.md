# Feature 5d: Human initial placement

- **From build-plan:** feature 5d, Human initial placement
- **Type:** Feature sub-item
- **Parent:** Feature 5, Initial placement phase
- **Status:** complete
- **Branch:** `feature/human-initial-placement`

## Goal

Let the authenticated owner complete each of their two initial placements in the
existing game observer. The owner chooses a legal settlement, then a connected
legal road, previews the pair, and confirms it as one command. Go validates the
command, Laravel persists it with any AI placements that follow, and the engine
stops at the next human decision or `turn_ready`.

## In scope

- Add a versioned Go operation that returns legal settlement-road pairs for a
  supplied canonical setup state. Return only complete legal pairs so the web
  client does not implement distance, connectivity, occupancy, or setup rules.
- Add a versioned Go continuation operation that accepts the persisted setup
  state and one human settlement-road command, validates the human command with
  the existing transition, then runs the existing deterministic AI policy until
  the next human decision or `turn_ready`.
- Expose owner-scoped Laravel endpoints for legal options and placement
  submission. Derive the human seat and current state from the owned game, never
  from client-supplied seat or state data.
- Persist the human command, AI continuation commands, their ordered events,
  and one snapshot per transition atomically. Keep existing lifecycle behavior:
  `awaiting human input` at a human boundary and `running` at `turn_ready`.
- Make command submission retry-safe and reject stale choices when another
  request has already advanced the saved game.
- Add settlement selection, connected-road selection, a pair preview, and an
  explicit confirm action to the existing observer. Enable input only at the
  latest saved human setup boundary after playback reaches that boundary.
- After an accepted command, refresh the saved replay and present the newly
  persisted human and AI setup events until the next human boundary or setup
  completion.
- Provide clear loading, validation, stale-state, and retry feedback, with
  keyboard-accessible board choices and reduced-motion-compatible playback.

## Out of scope

- Normal turn commands such as rolling, building, or trading. Feature 11 owns
  human core turns.
- Human seats beyond the one owner-controlled seat supported by current game
  creation. Online multiplayer and multiple human seats remain deferred.
- Changing setup order, legal placement rules, starting resources, public event
  payloads, or the AI placement policy.
- Editing placements from historical replay frames or changing the existing
  replay response schema and privacy projection.
- Match completion, scoring, victory, or starting the first normal turn.
- A new gameplay route or broad observer redesign. Placement stays on the
  existing `/games/{gameId}/observe` screen and uses the current board styles.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files; you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step you have not read. If a diff is too big to review, split it.

## Build steps

- [x] **Step 1 - Go setup continuation domain operation** - implement legal
  settlement-road pair generation and a domain operation that validates exactly
  one human command before applying deterministic AI commands. *Done when:*
  domain tests cover three- and four-seat states, legal pairs, malformed and
  illegal commands, deterministic continuation, stop at a human boundary or
  `turn_ready`, and globally continuous event sequences.
- [x] **Step 2 - Versioned Go HTTP contracts** - expose legal options and setup
  continuation under new versioned engine operations without changing the
  existing bootstrap or initial-placement run contracts. *Done when:* HTTP
  tests cover valid and malformed requests, response schemas, legal options,
  active-human enforcement, and serialization of human and AI transitions.
- [x] **Step 3 - Owner-scoped API and atomic persistence** - add authenticated
  options and submit endpoints, validate engine responses against the stored
  game and state, and atomically append the human and AI transitions using the
  existing commands, events, and snapshots tables. Handle idempotent retries
  and stale command sequences. *Done when:* Laravel tests prove owner scoping,
  server-derived acting seat, legal-option response validation, rejected and
  stale commands writing no history, a repeated matching idempotency key adding
  no records, a reused key with a different payload conflicting, and accepted
  transitions persisting in order with correct state, lifecycle, and cursors.
- [x] **Step 4 - Staged placement in the observer** - let the owner select a
  server-listed settlement and one of its server-listed roads, preview the
  complete pair, and confirm one atomic command. Refresh the latest replay and
  continue setup event playback after success. *Done when:* browser coverage
  proves only supplied legal choices are actionable, a road can be chosen only
  for the selected settlement, confirmation submits both IDs once, historical
  frames cannot submit, success reaches the next human boundary or completion,
  and keyboard, loading, stale-state, error, and reduced-motion behavior remain
  understandable.
- [x] **Step 5 - Real-stack setup handoff** - extend the Compose observer smoke
  to play both human setup placements through the real React, Laravel, and Go
  path. *Done when:* the browser can complete a human-versus-AI setup on the
  running development stack, persisted commands/events/snapshots agree with the
  observer, the AI resumes after each human command, the next human boundary is
  available when expected, and the final placement reaches `turn_ready` without
  changing the existing replay contract.

## Files / areas

- `services/game-engine/internal/execution/` - legal pair projection,
  continuation orchestration, and deterministic transition tests.
- `services/game-engine/internal/httpapi/` - versioned request/response types,
  handlers, route registration, and HTTP contract tests.
- `apps/api/routes/api.php` and new API request/controller classes - authenticated
  game options and placement routes.
- `apps/api/app/Services/GameEngineClient.php` and a focused initial-placement
  orchestration service - engine contract validation and atomic persistence.
- `apps/api/tests/Feature/` - owner authorization, engine contract, persistence,
  idempotency, stale-state, and rollback coverage.
- `apps/web/src/features/replay/` - typed placement API calls and observer
  selection, preview, confirmation, and replay refresh behavior.
- `apps/web/src/features/board/BoardSvg.tsx` and `apps/web/src/App.css` -
  selectable legal vertices/edges and focused styling in the existing board.
- `apps/web/e2e/game-observer.spec.ts` and its fixtures - browser interaction
  and observer boundary coverage.
- `scripts/compose-observer-smoke.sh` and
  `apps/web/e2e/compose-observer-smoke.spec.ts` - real-stack placement handoff.

Do not add a database migration unless implementation demonstrates that the
existing command, event, snapshot, and idempotency fields cannot represent this
flow. The existing `game_commands.idempotency_key` and
`decision_metadata` fields should be sufficient.

## Data / contracts

- Keep the existing public replay envelope at `replay-v1`, setup event names,
  `state-v2` snapshots, and `replay-public-v2` / `replay-viewer-v1` projections.
  The browser obtains actionable options from a separate endpoint and refreshes
  replay after submission; legal moves are not added to historical frames.
- Add `POST /v1/initial-placement/options` to the Go engine. It accepts
  the stored `state-v2` and returns a versioned list of pairs shaped as
  `{ settlement_vertex_id, road_edge_id }`, along with setup position metadata
  such as active seat and round, under
  `initial_placement_options_schema_version: "1"`. Laravel adds the persisted
  command sequence to its owner-facing options response. The engine options
  response must not return canonical player resources.
- Add `POST /v1/runs/initial-placement/continue` to the Go engine. It receives
  the persisted canonical state, immutable game configuration, the next event
  sequence, and one command shaped as
  `{ command_type: "place_initial_settlement_and_road.v1", acting_seat_number,
  payload: { settlement_vertex_id, road_edge_id } }`. It returns
  `setup_continuation_schema_version: "1"`, ordered state transitions, and a
  stop reason of `human_input_required` or `turn_ready`. The human command has
  no AI decision metadata; AI transitions retain their existing policy version
  and option ID. The operation accepts a human command only when the active
  seat is human-controlled. Laravel continues to assign database command
  sequences.
- Add authenticated owner-scoped API operations:
  - `GET /v1/games/{game}/initial-placement/options` returns
    `{ schema_version: "initial-placement-options-v1", data: { command_sequence,
    active_seat_number, round, options } }`. It is available only when the
    owned game's current state is awaiting this owner-controlled seat.
  - `POST /v1/games/{game}/initial-placement` accepts
    `{ expected_command_sequence, settlement_vertex_id, road_edge_id }`, plus
    an `Idempotency-Key` header. It returns
    `{ schema_version: "initial-placement-command-v1", data: { replayed,
    lifecycle_status, last_command_sequence, last_event_sequence } }`. Sequence
    values are decimal strings. It does not accept a seat number or game state
    from the client.
- Laravel compares the submitted sequence with the saved game under a
  concurrency-safe write check. It verifies that the authenticated owner is
  controlling the active human seat, asks Go to validate the pair and continue
  AI play, validates the complete response, then writes every returned command,
  event, snapshot, final state, and cursor in one database transaction.
- Use the submitted idempotency key for the human command record; keep stable
  `initial-placement:{round}:{seat_number}` keys for AI commands. Repeating a
  key with the same command reports that it was already applied and does not
  call the engine or add history. Reusing a key for a different payload
  conflicts. A stale expected command sequence conflicts unless the request is
  a retry already recognized by its idempotency key.
- Preserve the existing stop lifecycle mapping. A continuation ending at the
  next human placement sets `awaiting human input`; a continuation ending at
  `turn_ready` leaves the game `running` because normal turns and completion are
  later features.
- The browser may group returned legal pairs by settlement and filter that list
  to show the connected roads for the selected settlement. It may not infer
  adjacency or legality from board geometry. Both selected IDs are submitted
  together only after the owner reviews and confirms the pair.
- Preserve privacy: the options response contains only public board IDs and
  setup position metadata. Current resources continue to come from the existing
  owner-only replay viewer projection; other seats' resources remain private.

## Testing

- Go: add domain and HTTP tests for legal options, invalid state and commands,
  active-human enforcement, deterministic AI continuation, three- and
  four-seat ordering, stop reasons, transition schemas, and continuous event
  numbering. Run `cd services/game-engine && go test ./...`.
- Laravel: add focused engine-client and feature tests for valid and malformed
  options/continuation responses, owner isolation, human-seat derivation,
  stale and illegal commands, idempotent retries, transaction rollback, event
  and snapshot order, lifecycle mapping, and cursor updates. Run
  `cd apps/api && composer test` and `cd apps/api && vendor/bin/pint --dirty --format agent`.
- React: add browser coverage for staged settlement/road choice, preview,
  confirmation, no action at a historical position, replay refresh and event
  playback after acceptance, keyboard operation, reduced motion, and API error
  recovery. Run `cd apps/web && npm run lint`, `cd apps/web && npm run build`,
  and `docker compose --profile test run --build --rm web-e2e`.
- Integration: extend the real Compose observer smoke to submit both human
  placements and observe AI continuation using the actual Laravel and Go
  services. Run `COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-observer-smoke.sh`.
- Keep tests focused on the changed contract and flow. Do not install a test
  runner or add a service or dependency.

## Notes for the AI

- Go is the only authority for legal placement options, command validation,
  state transitions, AI decisions, and setup events. Laravel owns game access,
  request validation, durable sequencing, concurrency, and persistence. React
  only presents the exact legal pairs supplied by the API.
- An owner may act only for the one human seat already recorded on their game.
  Derive that seat and the current canonical state from the owner-scoped game
  record. Never accept client-supplied owner, acting seat, or canonical state.
- The player must choose a settlement first, then one connected road from the
  engine-supplied pairs, review the full pair, and confirm it atomically. Do not
  persist a half-placement.
- Enable placement only when following the latest saved frame, the setup event
  cursor has reached the persisted head, the game is waiting for human input,
  and the active seat equals the owner's human seat. Historical checkpoints are
  view-only.
- A successful continuation can include several AI commands. Persist the
  entire returned sequence or none of it. A failed engine request, stale state,
  invalid response, or database failure must not leave partial history.
- Preserve existing board pan/zoom, Classic and Illustrated appearance,
  observer navigation, and replay playback semantics. Do not introduce a
  separate gameplay route or change unrelated observer information design.
- Before changing Laravel code, read `apps/api/AGENTS.md` and follow its
  relevant Laravel Boost skill instructions.
