# Feature 5a: Initial placement rules contract

**From build-plan:** feature 5a, Initial placement rules contract
**Type:** Feature sub-item
**Parent:** Feature 5, Initial placement phase
**Status:** complete

## Goal

Establish the canonical Go engine transition for the Catan initial placement
phase. A three- or four-seat game will establish and persist a seed-derived
player order once setup begins, accept one settlement and adjacent road
placement per turn, enforce the legal board constraints, grant the standard
starting resources from the second settlement, and emit versioned public or
seat-private events.

The transition must expose a stable placement-policy boundary so the current
deterministic AI can later be replaced by a learned placement policy. The
normal-turn decision policy will be a separate future seam because it has a
different action space and training objective; sharing model components later
remains possible. The Go engine remains responsible for legality and state
transitions. This sub-feature does not add model training or a model dependency.

## In scope

- Add the versioned placement state, command, observation, decision, and event
  contracts in the Go execution domain.
- Add a deterministic `BeginInitialPlacement` transition that derives a
  reproducible order from the occupied seats and game seed, persists that order
  in the setup state, and upgrades the bootstrap state into the first setup
  turn while keeping the existing bootstrap-v1 response unchanged.
- Run the first placement round in the established order, then run the second
  placement round in reverse order. Seat numbers identify seats; they do not
  decide who starts.
- Require each active seat to place exactly one settlement and one road in its
  turn, with the road connected to that turn's settlement. The engine accepts
  this as an explicit command from the active seat and never precomputes all
  placement locations in advance.
- Validate that a settlement vertex exists, is unused, and has no adjacent
  settlement, and that a road edge exists, is unused, and is connected to the
  new settlement.
- Apply the standard initial resource grant from a seat's second settlement,
  excluding desert hexes, through a public event while keeping the resource
  inventory private in state projections.
- Advance the active seat and placement round deterministically and emit a
  completion event with a stable handoff phase for Feature 6.
- Provide a `RandomPlacementPolicy v1` behind a small interface for AI seats and
  test simulations. It receives only the acting seat's permitted observation
  and the current legal options, then selects one complete settlement-and-road
  pair using seeded deterministic randomness.
- Add focused Go coverage for three-seat and four-seat order, valid transitions,
  invalid placements, resource grants, event visibility, determinism, and
  policy output.

## Out of scope

- Laravel persistence, queue orchestration, retries, or the engine HTTP command
  endpoint. These belong to 5b.
- React controls or observer rendering. These belong to 5c.
- Human-facing API orchestration, waiting-state UI, and interactive controls.
  The engine accepts the explicit placement command needed by a human seat, but
  connecting that command to the API and browser belongs to Feature 11.
- Dice, normal resource production, roads after setup, cities, ports, trading,
  development cards, robber actions, victory scoring, or complete matches.
- Learned model training, self-play infrastructure, dataset export, or GPU
  dependencies. The policy boundary only preserves a future seam.

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

- [x] **Step 1 - placement state and contracts** - add the versioned setup
  state, persisted seat-order field, command and event payloads, visibility
  fields, policy interface, and deterministic bootstrap-to-setup transition
  while keeping the existing bootstrap-v1 response compatible.
  *Done when:* seeded order tests pass for three and four seats, the state and
  event shapes have focused Go coverage, and `go test ./...` is green.
- [x] **Step 2 - legal placement transition** - apply one
  `place_initial_settlement_and_road.v1` command to canonical state, enforce
  active-seat, distance, occupancy, adjacency, and phase validation, grant
  second-settlement resources, advance the established forward/reverse order,
  and complete setup.
  *Done when:* valid and invalid transitions are covered, repeated identical
  inputs produce identical state and events, and a complete three-seat and
  four-seat setup reaches the Feature 6 handoff phase.
- [x] **Step 3 - seeded random AI policy seam** - add the first simple
  `RandomPlacementPolicy v1` that selects from engine-generated legal options
  for AI seats and expose its version in the execution result used by later
  orchestration.
  *Done when:* the policy returns only legal options, the transition rejects
  any invalid policy result, repeated runs with the same seed, state, and
  commands choose the same placements, and policy decisions contain no other
  seat's private resources.

## Files / areas

- `services/game-engine/internal/execution/types.go` - versioned game, player,
  placement, command, event, observation, and policy contracts.
- `services/game-engine/internal/execution/bootstrap.go` - preserve bootstrap
  compatibility and provide the initial placement handoff.
- `services/game-engine/internal/execution/initial_placement.go` - canonical
  placement transition and setup-order logic.
- `services/game-engine/internal/execution/policy.go` - placement policy
  interface and seeded random AI implementation.
- `services/game-engine/internal/board/` - topology queries needed for vertex
  distance and edge adjacency validation, if existing helpers are insufficient.
- `services/game-engine/internal/execution/*_test.go` and focused board tests -
  deterministic rules and contract coverage.

Laravel, React, migrations, public API routes, and browser components are
intentionally deferred to 5b and 5c.

## Data / contracts

- Existing bootstrap history remains readable as `state-v1`. A state containing
  placement-owned structures and player resources uses `state-v2`; the new
  fields are additive in meaning and preserve the existing board and seat
  identity shape.
- The `state-v2` player collection contains one entry per seat with
  `seat_number`, `resources` keyed by the five resource names, `settlements`
  containing vertex IDs, and `roads` containing edge IDs. Resource counts are
  private to the owning seat in viewer projections; structure ownership is
  public.
- Placement state uses JSON names `phase`, `seat_order`, `round`,
  `active_seat_number`, and `step`. `seat_order` contains the occupied seat
  numbers in the seeded order established at setup start. The step is
  `place_initial_settlement_and_road` while setup is active.
- The command payload is:
  `{"settlement_vertex_id": "vertex:...", "road_edge_id": "edge:..."}`.
  Its command type is `place_initial_settlement_and_road.v1`.
- Public events identify the acting seat and placed structure IDs. The event
  types are `initial_placement_started.v1`,
  `initial_settlement_placed.v1`, `initial_road_placed.v1`, and
  `initial_placement_completed.v1`.
- Starting resource grants use `initial_resources_granted.v1` with
  `visibility: public`, the receiving seat number, and the resource counts
  granted by the second settlement. The grant is publicly derivable from the
  visible board and settlement placement. The public state contains owned
  structure positions but never another seat's current resources.
- `BeginInitialPlacement` produces `initial_placement_started.v1` with the
  established `seat_order`, sets round 1, selects the first seat in that order,
  and returns the first `state-v2` setup state. It is a system transition and
  does not represent a player placement command. The order is persisted and is
  not recalculated on retries.
- A transition receives canonical state, one accepted command, and the next
  event sequence, then returns the new state and ordered events. Laravel owns
  the numeric command sequence and persists the command, resulting state, and
  ordered events atomically in 5b.
- The policy boundary receives a seat-safe observation and the engine-generated
  legal placement options for the current state and returns an option
  identifier. It cannot return an arbitrary command payload. A policy version
  is recorded for reproducibility. `RandomPlacementPolicy v1` is used by AI
  execution and test simulations; a human-controlled seat waits for an
  explicit placement command instead.
- The engine never precomputes all setup placements. Each AI decision is made
  when that seat becomes active, using the current legal option set after all
  earlier human or AI placements.
- Setup completion uses the stable phase `turn_ready`; Feature 6 owns the first
  legal dice and normal-turn command from that handoff.

These shapes are load-bearing for 5b, 5c, Feature 6, Feature 10, and future
training-data export.

## Testing

- Run `cd services/game-engine && go test ./...` after each logic-bearing step.
- Test three-seat and four-seat snake order, settlement distance, occupied
  vertices, occupied edges, road-to-new-settlement adjacency, wrong active seat,
  wrong phase, malformed identifiers, second-settlement resource grants, and
  completion.
- Test seeded player-order generation from the occupied seat set, persistence of
  that order across repeated transitions, and explicit placements from a seat
  that is acting as a human-controlled caller.
- Compare repeated transitions from the same seed, state, command, and policy
  version for byte-equivalent state and event output.
- Verify visibility metadata prevents a policy from receiving another seat's
  private resource state.
- No browser or API manual path exists in 5a. 5b and 5c will provide the
  end-to-end route and observer evidence.

## Notes for the AI

- Go owns player-order generation, placement legality, seeded AI decisions, and
  emitted events. Laravel must only validate transport and persist the accepted
  transition in 5b. The engine does not assume that every seat should use the
  AI policy.
- Keep the engine stateless. Do not read PostgreSQL or Redis from Go.
- Do not expose another seat's resources through a shared observation or event.
- Keep the policy interface small and model-agnostic. The seeded random policy
  is the only policy in this sub-feature, and it is a decision source for AI or
  test seats rather than an automatic replacement for human input.
- Keep this placement policy contract separate from the future normal-turn
  policy contract. They may share an encoder or learned weights later, but they
  should remain independently replaceable and evaluable.
- Use explicit errors and `errors.Is` or `errors.As` for distinguishable illegal
  placement cases.
- Format changed Go files with `gofmt` and keep existing bootstrap and board
  tests green.
- Do not add a generic plugin system, model runtime, training job, or new
  infrastructure as part of this sub-feature.
