# Feature 6a: Turn sequence and production

**From build-plan:** Feature 6a, Turn sequence and production
**Status:** in progress

## Goal

Start the normal turn loop from the completed setup state. Go deterministically rolls the dice, applies resource production, advances turns, and exposes the owner's private resources through the existing replay boundary. Laravel persists each accepted command and its ordered history. A seven stops at a versioned robber-required phase for Feature 7 to resolve.

## Design reference

This is a rules and replay-contract slice, not an observer redesign. Reuse the existing observer layout and styles; do not redesign the right panel or add browser turn controls here. The board's existing appearance references remain [Illustrated board](../../prototypes/illustrated-board.html) and [shared theme tokens](../../prototypes/theme.css). The application already defines its global theme tokens in `apps/web/src/index.css`.

## In scope

- Add a versioned Go normal-turn state and transitions from the current `state-v2` `turn_ready` handoff. The new state starts the regular-turn phase with the robber on the desert and includes the city collection needed by later production and building rules.
- Establish the first normal turn from the persisted setup seat order. The first regular turn belongs to `seat_order[0]`.
- Support versioned `roll_dice.v1` and `end_turn.v1` commands. The engine derives both dice from the immutable game seed and turn number; clients cannot submit dice values.
- On rolls other than seven, allocate production to adjacent settlements and cities using the board's terrain and number tokens. A settlement receives one matching resource and a city receives two. Keep individual resource holdings private.
- On a roll of seven, record the public roll and enter `robber_required`; do not discard, move the robber, steal, or end the turn in this feature.
- Add an authenticated, owner-scoped Laravel command endpoint for these actions. Derive the acting seat and canonical state from the owned game, and persist accepted commands, events, snapshots, state, and cursors atomically.
- Project turn metadata publicly and the authenticated human seat's resource inventory privately. Keep the top-level replay envelope stable and teach the web replay client to accept the new frame projection version.
- Add readable timeline descriptions for turn start, dice roll, production visible to the owner, and turn end using the existing observer presentation.
- Prove the roll and persistence path against the real Compose services with a fixed human-first seed.

## Out of scope

- Building roads, settlements, or cities. Feature 6b owns those commands and their costs.
- Bank and port trading. Feature 6c owns fixed-ratio exchanges.
- Resolving discards, robber movement, blocked production, or stealing. Feature 7a owns AI rules; Feature 7b adds the human decision path.
- Browser controls for rolling or ending a turn. Feature 7b adds the one-turn human pilot in the existing observer.
- AI turn decisions or continuation. Feature 11 extends the pilot through AI turns; Feature 10 completes headless AI games.
- Development cards, player-to-player trades, victory scoring, or match completion.
- A broad observer/sidebar redesign or database migration.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on. Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you have not read. If a diff is too big to review, split it.

## Build steps

- [x] **Step 1a - `state-v3` handoff and first roll** - convert the completed `state-v2` setup state when `seat_order[0]` rolls, initialize the robber and cities, derive the first dice result, apply settlement/city production, and stop at the seven boundary. *Done when:* domain tests prove the first regular seat follows `seat_order[0]`, repeated seed/state/command inputs produce identical dice and events, settlement and city deltas are correct, a seven produces no resources and requires robber resolution, and invalid setup handoffs leave the input unchanged.
- [x] **Step 1b - Subsequent rolls and turn progression** - accept `roll_dice.v1` and `end_turn.v1` against `state-v3`, advancing the active seat, round, and turn number. *Done when:* domain tests prove three- and four-seat order and round wrap, clear the previous roll for the next seat, reject wrong-seat/out-of-phase commands without mutating input, and preserve deterministic dice and event ordering.
- [x] **Step 2 - Versioned Go HTTP contract** - expose one normal-turn command operation for `roll_dice.v1` and `end_turn.v1` and validate `state-v2`/`state-v3` inputs. *Done when:* HTTP tests cover valid transitions, malformed and unsupported requests, wrong active seat, wrong phase, unsupported state schema, deterministic response fields, and continuous event sequences.
- [x] **Step 3 - Owner-scoped Laravel command persistence** - add a Form Request, controller, and focused orchestration service for `POST /v1/games/{game}/turn-commands`; validate the Go response and atomically persist the human command, returned events, snapshot, latest state, lifecycle, and cursors. *Done when:* feature tests prove owner isolation, server-derived seat/state, stale sequence conflicts, matching idempotent retries without duplicate history, conflicting key reuse, rejection without partial writes, and correct persistence for a normal roll, roll of seven, and end turn.
- [ ] **Step 4 - Versioned replay privacy and client compatibility** - project `state-v3` frames with public turn/roll metadata and the owner-only resource view; update the TypeScript replay contract and existing event descriptions. *Done when:* Laravel tests prove no other seat's resource counts or production deltas leak, browser coverage loads a `state-v3` frame and displays the permitted turn events, and `replay-v1` pagination and snapshot navigation remain compatible.
- [ ] **Step 5 - Real-stack turn handoff smoke** - extend the existing Compose observer smoke to submit one human roll after setup and inspect its persisted replay. *Done when:* a fixed seed makes the owner the first regular player and produces a non-seven roll; the smoke proves the command, ordered events, snapshot, private resource view, and latest replay agree across React, Laravel, Go, and PostgreSQL.

## Files / areas

- `services/game-engine/internal/execution/` - `state-v3`, turn and resource-production transitions, deterministic dice, and domain tests.
- `services/game-engine/internal/httpapi/` - versioned turn-command request/response types, handler, route, and contract tests.
- `apps/api/routes/api.php` and new turn-command request/controller/service classes - owner-scoped command entry and atomic persistence.
- `apps/api/app/Services/GameEngineClient.php` - validate the new engine transition contract.
- `apps/api/app/Services/GameReplayProjection.php` and `apps/api/tests/Feature/` - public/private frame projection and authorization/persistence coverage.
- `apps/web/src/features/replay/replayApi.ts` and `GameObserver.tsx` - accept the new frame projection and describe permitted turn events without adding action controls.
- `apps/web/e2e/game-observer.spec.ts` and `scripts/compose-observer-smoke.sh` - browser compatibility and real-stack command-to-replay evidence.

## Data / contracts

- Keep `replay-v1` as the top-level replay envelope. Introduce canonical `state-v3` for regular turns and `replay-public-v3` for the public frame fields added for turn number, round, turn phase, and the last public dice result. Keep `replay-viewer-v1` if its existing `{ seat_number, resources }` shape is unchanged.
- `state-v3` retains board, seats, setup seat order, and player resources and structures. Each player has `settlements`, `roads`, and `cities` collections; cities start empty and are included now so Feature 6b can add city upgrades without another state schema change. The state adds `phase: "normal_turn"`, `round`, `turn_number`, `active_seat_number`, `turn_phase`, `robber_position` (the board hex ID), and nullable `last_roll` (`die_one`, `die_two`, `total`, each die from 1 to 6). Initialize the robber position to the board's desert hex. `turn_phase` is `awaiting_roll`, `action`, or `robber_required` in this slice.
- The first accepted `roll_dice.v1` from `state-v2` `turn_ready` starts `turn_number: 1`, `round: 1`, and the active seat at `seat_order[0]`. Later `end_turn.v1` commands end the current turn, advance through the persisted order, increment the round after it wraps, start the next turn in `awaiting_roll`, and clear `last_roll`.
- The engine derives dice statelessly from the canonical seed and current turn number using a named, stable derivation owned by the ruleset. The command payload is empty; the caller cannot select the result. The first roll transition emits `turn_started.v1`, then public `dice_rolled.v1`; each seat receiving resources gets its own seat-private `resources_produced.v1` delta event. A seven emits public `robber_required.v1` after the dice event, produces no resources, and leaves resolution to Feature 7. `end_turn.v1` emits public `turn_ended.v1` and `turn_started.v1` events as it advances the turn.
- `POST /v1/turns/command` in Go receives the saved state/schema, next event sequence, and one typed command; it returns one versioned `state-v3` transition and ordered events. Laravel continues to assign persisted command sequences.
- `POST /v1/games/{game}/turn-commands` accepts `expected_command_sequence`, `command_type`, and an empty `payload`, plus an `Idempotency-Key` header. It never accepts canonical state or an acting seat from the client. The response uses `schema_version: "turn-command-v1"` and decimal-string command/event cursors.
- An owner command is available only when the next active seat is the owner's human seat. If an AI seat is active, this feature does not execute it; AI continuation belongs to later features.
- Public frames may contain active seat, round, turn number/phase, dice result, robber position, and per-seat public settlement/road/city locations. The owner's viewer projection contains only the authenticated human seat's resource inventory. Resource inventories and per-seat production deltas are visible only to the corresponding authenticated human seat. Never expose canonical `current_state` directly.
- Reuse the existing commands, events, and snapshots tables. A transition and all its history are committed together; no migration is expected.

## Testing

- Go: add focused tests for deterministic dice, setup-to-turn handoff, production on matching number tokens, private production events, three- and four-seat order, round wrap, seven boundary, invalid commands, and HTTP schema validation. Run `cd services/game-engine && go test ./...`.
- Laravel: add feature tests for owner scope, server-derived state/seat, engine response validation, atomic history persistence, sequence conflicts, idempotency, lifecycle, and privacy. Run `cd apps/api && composer test` and `cd apps/api && vendor/bin/pint --dirty --format agent` after PHP changes.
- React: cover acceptance of `replay-public-v3` and owner-safe event display; run `cd apps/web && npm run lint`, `cd apps/web && npm run build`, and `docker compose --profile test run --build --rm web-e2e` when the browser contract changes.
- Integration: extend `COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-observer-smoke.sh` to verify a real human roll through Laravel and Go and inspect PostgreSQL plus the returned replay.
- Do not add a test runner or service.

## Notes for the AI

- Go remains the only authority for dice, turn order, resource production, legal phases, and emitted events. Laravel owns access checks, request validation, persistence, idempotency, and sequencing. React only renders the versioned projection.
- Do not accept a client-supplied seat, state, seed, or dice result. Derive the human seat from the owner-scoped game and stored seats; verify it is currently active.
- A seven must not be silently skipped or treated as an ordinary roll. Persist the robber-required boundary and stop; Feature 7 resolves it.
- Keep all private resource counts in canonical state and the correct viewer projection only. Production deltas for other seats must not appear in the owner's event page.
- Preserve existing setup state and replay versions. The first normal roll transitions from `state-v2` `turn_ready` to `state-v3`; do not rewrite historical setup snapshots.
- Keep bank/port exchanges in Feature 6c. Player-to-player trade evaluation stays in Feature 9 and may use a simple deterministic heuristic; do not pursue optimal play here.
- Preserve the current observer panel and Classic/Illustrated board behavior. Do not redesign the right zone or add human controls in this slice.
- Before changing Laravel code, read `apps/api/AGENTS.md` and follow its relevant Laravel Boost instructions.
