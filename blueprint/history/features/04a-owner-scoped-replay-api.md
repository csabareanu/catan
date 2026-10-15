# Feature 4a: Owner-scoped replay API

**Type:** Feature sub-item
**Parent:** Feature 4, Replayable simulation observer
**Status:** complete
**Branch:** The implement workflow should create the feature branch from main.

## Goal

Expose a versioned, authenticated replay contract for an owned game. An owner can retrieve safe game context, a paginated sequence of visible events, the positions of persisted snapshots, and one selected viewer-safe replay frame without receiving the canonical engine state or another seat's private data.

The response separates immutable game context from changing state. Board topology and seat structure are returned once in the replay context. A replay frame contains only state that can change over time.

This sub-feature establishes the API contract that the browser observer and replay timeline will consume. It does not add browser routes, gameplay controls, or new engine rules.

## User outcome

An authenticated owner can request an owned game replay and receive:

- the stable board and seat context needed to render the game;
- an ordered page of events visible to that owner;
- lightweight metadata showing which snapshot positions are available;
- the viewer-safe state frame nearest to a requested history position.

The response remains useful for a newly created game, a running game, a completed game, and a failed game. A caller who does not own the game receives the same stable not-found behavior as the existing game API.

## Scope

- Add the versioned replay endpoint:
  GET /api/v1/games/{game}/replay
- Require Sanctum authentication.
- Resolve the game through the authenticated user's owned-games relation.
- Return a replay context containing:
  - safe game identity and lifecycle metadata;
  - ruleset and state schema identifiers;
  - board topology from the persisted board configuration;
  - ordered seat identity and controller metadata;
  - the owner's human seat number when one exists.
- Return a bounded page of visible ordered events.
- Return a snapshot index containing positions and schema metadata without snapshot state.
- Return one selected viewer-safe replay frame, chosen from the persisted snapshots.
- Serialize event, snapshot, and cursor sequence values as decimal strings.
- Apply event visibility metadata when building the owner or spectator projection.
- Define deterministic ordering, empty-history behavior, and frame selection behavior.
- Add focused authorization, privacy, contract, validation, cursor, and ordering tests.

## Out of scope

- React routes, browser authentication, polling, replay controls, or visual changes.
- Go engine rules, state transitions, event generation, or new snapshot production.
- Applying game rules or reconstructing state from events in Laravel or React.
- Returning the canonical current_state column directly.
- Returning the raw result column directly.
- Returning every full snapshot state in a replay response.
- Changing the canonical state-v1 storage format or adding a new snapshot schema.
- New gameplay commands, human turns, victory rules, or AI behavior.
- Administrator access or cross-owner inspection.
- A new snapshot scheduling policy or a database migration unless implementation evidence shows an existing contract cannot support the endpoint.

## API contract

### Request

Method and path:

    GET /api/v1/games/{game}/replay

Authentication:

- Require auth:sanctum.
- The route must use the same owner-scoped lookup pattern as the existing game show and delete endpoints.

Optional query parameters:

- after_event_sequence: a nonnegative decimal string cursor. It defaults to 0 and excludes events at or before that sequence.
- limit: an integer from 1 through 100. It defaults to 50.
- at_command_sequence: a nonnegative decimal string selecting the command boundary for the returned frame. It defaults to the game's latest persisted command sequence.

Malformed cursor, limit, or frame-position values return the project's normal validation response and do not expose replay data.

### Response envelope

Return a versioned document with these logical fields:

- schema_version: replay-v1.
- context: the safe game, board, and seat data required to render the replay.
- events: the visible event page in ascending sequence order.
- event_cursor: the cursor metadata for the returned event page.
- snapshot_index: ordered metadata for available snapshot positions, without state payloads.
- frame: one viewer-safe replay frame, or null when no snapshot exists at or before the requested position.

The implementation may use Laravel resources or a dedicated projection service, but the field names and meanings above are the public contract. Any additional field must be safe for the owner and justified by the feature.

### Replay context

The context contains:

- game: a safe game summary with id, mode, lifecycle_status, ruleset_key, ruleset_version, state_schema_version, seed, seat_count, human_seat_number, started_at, completed_at, and created_at;
- board: the persisted board topology and public map data;
- seats: ordered seat number, controller type, and safe player-facing identity data.

The context does not contain current_state, result, raw failure messages, database command identifiers, or private seat state.

Board topology and seat structure are immutable game context. They are not repeated inside every frame. The replay response is self-contained for the request, while later requests may use the same context contract.

### Event projection

Each visible event contains:

- sequence as a decimal string;
- event_type;
- payload after visibility filtering;
- occurred_at.

A public event is visible when its visibility is public and its visible_to_seat_number is null. A seat-private event is visible only when its visible_to_seat_number equals the game's human_seat_number. For an AI-only game whose human_seat_number is null, the owner receives the public spectator view and no AI-private event.

Private events for other seats and malformed private events without a matching owner seat are omitted entirely.

The projection must not expose database identifiers, command payloads, command identifiers, another seat's private data, or visibility implementation fields unless the contract explicitly needs them.

Events must be filtered for viewer visibility before pagination is calculated. The event query or equivalent retrieval loop must continue past hidden events so a page is filled with visible events when more visible events exist.

### Event cursor

The event cursor contains:

- requested_after_sequence as a decimal string;
- returned_through_sequence as a decimal string or null when the page is empty;
- has_more as a boolean;
- next_after_sequence as a decimal string or null when there is no next page.

The endpoint uses keyset pagination:

1. Select visible events with sequence greater than after_event_sequence.
2. Order by sequence ascending.
3. Read limit plus one visible event.
4. Return at most limit events.
5. Set has_more when the extra visible event exists.
6. If has_more is true, set next_after_sequence to the last returned visible sequence; otherwise set it to null.

The cursor identifies the position after which to continue. The limit controls page size. Both are required: a limit without a cursor always starts at the first page, while a cursor without a limit has no response-size bound.

Sequences are returned as strings because the persisted values are big integers and must remain safe across PHP, JSON, Go, and TypeScript.

### Snapshot index

Each snapshot index entry contains:

- command_sequence as a decimal string;
- event_sequence as a decimal string;
- state_schema_version;
- created_at.

The index contains positions only. It never contains the canonical state, current_state, private resources, development cards, or raw persistence fields.

The index is ordered by command_sequence ascending. It lets a later browser timeline show available checkpoint positions without transferring every full snapshot. If snapshot volumes become large enough to make the metadata index expensive, it can receive its own cursor in a later feature.

### Selected viewer-safe frame

The frame is selected as follows:

- If at_command_sequence is omitted, use the game's latest persisted command sequence.
- Select the snapshot with the greatest command_sequence that is less than or equal to the requested position.
- If no snapshot exists at or before the requested position, return frame as null.
- If the selected snapshot is earlier than the requested command boundary, report its actual command_sequence and event_sequence. Laravel does not apply later events to pretend that the frame represents the requested position.

Each non-null frame contains:

- command_sequence as a decimal string;
- event_sequence as a decimal string;
- state_schema_version;
- public_projection_schema_version: replay-public-v1;
- public_state: a public dynamic state projection;
- viewer_projection_schema_version: replay-viewer-v1 when viewer_state is present;
- viewer_state: a private state projection for the authenticated owner's human seat, or null.

The public_state contains changing public render data only. Immutable board topology and seat structure come from context. The optional viewer_state contains only private data belonging to the authenticated owner's human seat.

For the current bootstrap state-v1 contract, public_state can expose phase while the board and seats are removed from the frame and supplied by context. The current bootstrap has no private state, so viewer_state is null. Future gameplay state can add explicitly projected fields such as:

- active seat and turn phase;
- robber position and other public board markers;
- road ownership by edge identifier;
- settlement and city ownership by vertex identifier;
- public awards and publicly reportable scores;
- viewer-private resources or development cards inside viewer_state only for the owner's human seat.

Exact resources, exact development-card hands, hidden decisions, and another seat's private data remain excluded from public_state. viewer_state may contain the owner's own private resources or development cards when later engine contracts persist them. Hidden victory-point cards must not be included in public_state before the rules make that information public.

A frame is a persisted checkpoint at a command boundary, not an event reducer result. A command may produce multiple events, so an event sequence does not necessarily identify a distinct state. Exact state for every command position requires snapshots at those positions or a later engine-owned frame-generation contract. This sub-feature does not add either mechanism.

### Consistency and reconstruction boundary

This endpoint reads persisted history. It does not dynamically apply events,
replay commands, compare snapshots, or repair inconsistent state.

Future command execution must use the Go transition boundary to produce the
next canonical state and its events from the previous canonical state and
accepted command. Laravel must then persist the command, all emitted events,
the resulting snapshot when the snapshot policy selects one, the latest
current_state, and the ordering cursors in one database transaction.

The write-side contract must preserve these relationships:

- A snapshot represents the state after its command boundary.
- snapshot.command_sequence identifies the command position represented.
- snapshot.event_sequence identifies the last event included in that state.
- Game.current_state equals the latest accepted canonical state.
- When the snapshot policy stores the latest command, its snapshot state
  matches Game.current_state. With sparse snapshots, Game.current_state may be
  newer than the latest checkpoint, and the replay frame reports its actual
  checkpoint position.
- Command and event sequences remain append-only and strictly ordered.
- A failed transaction leaves no partial command, event, snapshot, or state
  update.
- Retries remain safe through command idempotency and per-game sequence
  constraints.

Snapshot frequency is deliberately not part of this API contract. The replay
endpoint must work with no snapshots, one snapshot, or sparse snapshots. A
later execution feature may begin with one snapshot per accepted command for
simple exact command-level replay, then move to periodic snapshots if state
size or write volume justifies it. If snapshots become sparse, authoritative
reconstruction belongs in Go by replaying commands from a checkpoint. Laravel
and React must not implement separate state reducers.

An integrity audit may later replay commands through Go and compare the
resulting canonical state with a stored snapshot. A deterministic state hash
can make that comparison cheap, but adding hashes is outside this API slice.

### Deferred replay materialization and cache policy

If snapshots become sparse, a request for command 70 with the nearest durable
checkpoint at command 50 must be resolved by the authoritative Go transition
boundary using the accepted commands from 51 through 70. The API must never
replay events in PHP or React as a second rules implementation.

The latest Game.current_state is already a durable materialized state. When a
request targets the latest command, a later implementation may project that
state directly into the viewer-safe frame even when the latest command does
not have its own snapshot. The raw current_state value must never be returned
without the same public and viewer-private projection rules.

Redis may cache a computed canonical checkpoint or viewer-safe frame for an
active replay. Such a cache is an optimization only:

- PostgreSQL remains the source of truth for commands, snapshots, and the
  latest canonical state.
- A cache miss, eviction, restart, or expired entry falls back to the durable
  checkpoint and Go reconstruction.
- Canonical cache entries are keyed by game, command sequence, state schema,
  and owner scope. Public frames and owner-private frames use separate scopes.
- Game deletion, schema changes, and authorization changes must invalidate or
  bypass related entries.
- Go remains stateless and does not read Redis directly; Laravel owns cache
  coordination and the Go transition request.

No Redis replay cache belongs in 4a. Add it only after gameplay exists and
measurements show that sparse-checkpoint reconstruction is costly. Starting
with one snapshot per accepted state-changing command is a reasonable
baseline when the canonical state is small. It is a replaceable snapshot
policy, not a requirement of the API contract.

### Lifecycle and failure behavior

- A newly created game with no execution history returns HTTP 200 with its safe context, empty events, an empty snapshot index, and a null frame.
- A queued or running game returns the history persisted so far and its current lifecycle status.
- A completed game returns the available history, snapshot positions, and selected viewer-safe frame. Completion metadata is represented through safe lifecycle timestamps and status; the raw result object is not returned by this sub-feature.
- A failed game returns its safe lifecycle status and available history. The raw failure message and canonical failure payload are not added to the replay document.
- A game absent from the authenticated owner's relation returns the existing stable 404 game_not_found response, whether it belongs to another owner or does not exist.
- An invalid cursor, limit, or frame position returns a validation error without leaking whether a game exists.

## Implementation steps

### Step 1: Define the public replay projection

Create the smallest Laravel projection boundary needed to combine Game, GameSeat, GameEvent, and GameSnapshot records into the replay-v1 document.

Likely files:

- apps/api/app/Http/Resources or a dedicated replay projection class;
- apps/api/app/Models/Game.php and related models only if existing relations or casts need a narrow adjustment;
- focused feature tests.

Requirements:

- Keep the public replay projection separate from GameResource so the existing game library contract does not change accidentally.
- Build context from the persisted board configuration and ordered seats.
- Whitelist dynamic public frame fields instead of serializing the canonical snapshot state array wholesale.
- Remove immutable board and seat data from the public frame because it is supplied by context.
- Filter events using visibility and the owner's human seat before applying the event limit.
- Produce snapshot index metadata without loading or serializing every snapshot state.
- Select only the requested command checkpoint frame and project it through replay-public-v1.
- Convert all event, snapshot, and cursor sequence values to strings.
- Preserve ascending ordering.
- Avoid N plus 1 queries and avoid loading full state for snapshots used only by the index.

Done when:

- A projection test demonstrates that context contains board and ordered seats once.
- A frame test demonstrates that immutable board and seat data are not repeated in public_state or viewer_state.
- A projection test demonstrates that public and owner-seat-private events are included.
- AI-private events, malformed private events, raw current_state fields, and private snapshot fields are absent.
- The response shape carries replay-v1 and replay-public-v1 values and never includes another seat's viewer_state.
- A contract test demonstrates visible event cursor behavior, string sequences, ordered output, snapshot index metadata, and selected frame positioning.

### Step 2: Add the owner-scoped replay endpoint

Add the route and controller or action that validates the request, loads the owner's game, retrieves the bounded visible event page, retrieves snapshot index metadata, selects one checkpoint frame, and returns the projection.

Likely files:

- apps/api/routes/api.php;
- apps/api/app/Http/Controllers/Api/V1, including a replay controller or action;
- apps/api/app/Http/Requests if a request object is useful for cursor, limit, and frame-position validation;
- apps/api/tests/Feature/GameReplayTest.php;
- project API documentation only if an existing API documentation location is established during implementation.

Requirements:

- Reuse the explicit owner relation lookup used by GameController.
- Keep the endpoint read-only.
- Use eager loading or deliberate bounded queries for related data.
- Query visible events with keyset pagination and a limit plus one strategy.
- Query snapshot index columns without loading state, then retrieve only the selected snapshot state.
- Make frame selection deterministic and report the actual checkpoint position.
- Preserve the existing JSON error conventions.
- Do not modify unrelated game creation, execution, or library responses.

Done when:

- Authenticated owners can retrieve an empty replay, a bootstrap replay, a running replay, a completed replay, and a failed replay.
- Unauthenticated requests are rejected.
- Another authenticated user cannot retrieve the game's replay and receives the stable 404 response.
- Event filtering, ordering, cursor pagination, limit validation, frame selection, snapshot index metadata, and string sequence serialization are covered by focused tests.
- The full Laravel test suite and formatter pass.

### Audit repair: F-01 - Align final-page replay cursor

**Finding:** F-01 [P1] - the public contract says `next_after_sequence` is null when `has_more` is false, but the projection currently returns the last event sequence on the final page.

Build the smallest compatibility repair without changing event visibility, ordering, pagination limits, or frame selection.

- [x] Repair F-01 - return `next_after_sequence` only when a further visible page exists, update the focused endpoint assertion, and preserve `returned_through_sequence` for the final event.

Done when:

- A final page has `has_more: false` and `next_after_sequence: null`.
- A page with another visible event keeps `has_more: true` and returns the last visible sequence as `next_after_sequence`.
- Focused replay tests, the full Laravel suite, and Pint pass.

### Audit repair: F-02 - Share canonical sequence validation

**Finding:** F-02 [P2] - the canonical nonnegative signed 64-bit decimal validation is duplicated between game seed and replay sequence request boundaries.

Build the smallest reusable validation rule without changing accepted input, field-specific messages, authorization, or endpoint behavior.

- [x] Repair F-02 - extract the shared canonical signed 64-bit decimal validation, apply it to the board seed, game seed, and replay sequence fields, and preserve each request's field-specific messages.

Done when:

- One named reusable validation implementation owns the canonical nonnegative signed 64-bit decimal and maximum-value checks.
- `GenerateBoardRequest`, `CreateGameRequest`, and `GameReplayRequest` all use that shared implementation.
- Existing seed and replay validation behavior remains covered and the full Laravel suite plus Pint pass.

### Audit repair: F-03 - Clarify final-page cursor algorithm

**Finding:** F-03 [P2] - the numbered replay cursor algorithm unconditionally says to set `next_after_sequence` to the last returned sequence, despite the contract requiring `null` when no next page exists.

Make the smallest documentation repair so the algorithm, implementation, and client contract describe the same behavior.

- [x] Repair F-03 - qualify the cursor algorithm so `next_after_sequence` contains the last returned visible sequence only when `has_more` is true, and is otherwise `null`.

Done when:

- The replay contract has one unambiguous rule for final-page cursors.
- The existing implementation and focused assertion remain consistent with that rule.
- The full Laravel suite, Pint, and `git diff --check` pass.

## Verification

Run focused checks first:

    cd apps/api && php artisan test --compact tests/Feature/GameReplayTest.php

    cd apps/api && vendor/bin/pint --test

Then run the broader API checks:

    cd apps/api && composer test

Manual or runtime check:

- Start the documented local Compose development stack.
- Register or authenticate an owner.
- Create a game, start its run, wait until at least one persisted event or snapshot exists, and request the replay endpoint with and without a cursor.
- Confirm the response contains context once, ordered visible events, snapshot positions without state payloads, and one selected viewer-safe frame.
- Request a frame at an earlier command position and confirm the returned frame reports its actual checkpoint position.
- Confirm the response uses string sequences and contains the public projection plus only the authenticated owner's own viewer_state when authorized.
- Authenticate a second user and confirm the same game returns the stable not-found response.
- Confirm an empty newly created game returns HTTP 200 with context, empty arrays, and a null frame.

No Go or React checks are required for this API-only sub-feature. They become part of 4b and 4c when those sub-features change the respective components.

## Notes and boundaries

Laravel owns authentication, owner scoping, query bounds, transport, and serialization. Go remains the authority for canonical state, rules, legal transitions, and event visibility metadata.

The current GameSnapshot state-v1 data is a canonical self-contained checkpoint produced by the Go bootstrap contract. This slice does not change that storage format. The API projection can remove repeated immutable context without weakening canonical persistence.

Later gameplay features must extend the canonical engine state and persisted public events with roads, buildings, robber state, turns, scores, resources, development cards, and privacy metadata. Laravel can project those fields only after the engine has persisted them.

The public replay projection is versioned independently from the canonical engine state. The browser treats frame state as API-provided render data and does not reconstruct canonical state by applying game rules in React.

No commit is part of this planning slice. Implementation, step commits, final archiving, merge, and push follow the Blueprint implement and complete workflow.

## Findings

### 04a/F-01 [P1] closed - Replay cursor returns a continuation value when no page remains

**File:** apps/api/app/Services/GameReplayProjection.php:80-83; apps/api/tests/Feature/GameReplayTest.php:337-342
**Found:** 2026-10-15 by /audit (scope: current)
**Why it matters:** The active replay contract says `next_after_sequence` is null when `has_more` is false. The projection always returns the last event sequence, even on the final page, and the endpoint test asserts that behavior. Clients following the documented contract can interpret the non-null value as another page and issue a redundant request or present an incorrect continuation state.
**Suggested fix:** Set `next_after_sequence` only when an extra visible event exists, update the endpoint assertion, and keep the cursor contract and implementation aligned. If the last returned sequence is intentionally retained on final pages, revise the public specification and client contract instead.
**Resolution:** Re-reviewed the projection and endpoint test. `next_after_sequence` is now returned only when an extra visible event exists, while `returned_through_sequence` continues to report the final returned event. Focused replay tests, the full Laravel suite, Pint, route inspection, PHP syntax checks, and `git diff --check` pass. Closed by `/audit` on 2026-10-15.

### 04a/F-02 [P2] closed - Canonical 64-bit sequence validation is duplicated across request boundaries

**File:** apps/api/app/Http/Requests/Api/V1/GameReplayRequest.php:78-97; apps/api/app/Http/Requests/Api/V1/CreateGameRequest.php:24-38
**Found:** 2026-10-15 by /audit (scope: current)
**Why it matters:** The same canonical non-negative signed 64-bit decimal validation, including its length and lexicographic maximum check, is implemented separately for replay cursors and game seeds. A future change to the accepted sequence format or maximum can update one boundary and leave the other inconsistent.
**Suggested fix:** Extract the shared validation into a small named rule or reusable rule factory, then apply it to the seed and replay sequence fields while keeping field-specific error messages at each request boundary.
**Resolution:** Re-reviewed `CanonicalNonNegativeInt64String::rules()` and all three request boundaries. The shared implementation preserves the existing regex message keys and signed 64-bit overflow behavior. Focused validation tests, the full Laravel suite, Pint, PHP syntax checks, and `git diff --check` pass. Closed by `/audit` on 2026-10-15.

### 04a/F-03 [P2] closed - Replay cursor algorithm still contradicts the final-page contract

**File:** blueprint/context/current-feature.md:132-139
**Found:** 2026-10-15 by /audit (scope: current)
**Why it matters:** The replay contract defines `next_after_sequence` as null when there is no next page, and the repaired implementation and tests follow that rule. The numbered algorithm still says unconditionally to set it to the last returned visible sequence, leaving an internal contract contradiction that could reintroduce the F-01 behavior or mislead future client work.
**Suggested fix:** Qualify step 6 so the last returned sequence is used only when `has_more` is true, and state that the field is null otherwise.
**Resolution:** Re-reviewed step 6 of the replay cursor algorithm, the projection, and the focused assertions. `next_after_sequence` is returned only when `has_more` is true and is otherwise null, while `returned_through_sequence` remains available for the final page. The replay test, full Laravel suite, Pint, route inspection, PHP syntax checks, and `git diff --check` pass. Closed by `/audit` on 2026-10-15.
