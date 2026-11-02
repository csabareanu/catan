# Feature 5c: Setup observer projection and event playback

**From build-plan:** feature 5c, Setup observer projection
**Type:** Feature sub-item
**Parent:** Feature 5, Initial placement phase
**Status:** complete
**Branch:** `feature/setup-observer-projection-and-event-playback`

## Goal

Show the persisted initial-placement state safely in the existing observer, then
let the owner watch its public setup events in sequence with clear, smooth board
feedback. A start action may autoplay once on the first observer arrival; later
visits open the latest saved state without replaying the setup from the beginning.

## Design reference

- [Observer desktop draft](../reference/observer-desktop-draft.png)
- [Observer laptop draft](../reference/observer-laptop-draft.png)

Keep the current observer layout and board appearance controls. These references
guide continuity; the setup playback controls and board pieces should use the
existing visual system rather than introducing a new screen or theme.

## In scope

- Extend the existing owner-scoped replay frame projection for `state-v2` setup
  snapshots. Public state may include setup phase, established seat order, round,
  active seat, setup step, and each seat's settlement vertex IDs and road edge
  IDs. Construct this allowlisted projection explicitly; never return raw
  canonical `players` because those entries also contain every seat's resources.
- Add a viewer projection for the authenticated owner's human seat resources
  during `state-v2` setup. AI-only games and frames without an eligible human
  seat have no viewer resource state. Keep all other seats' current inventories
  private.
- Render the server-projected setup status and owned structures in the existing
  observer and SVG board. Match structures to the board by the API-provided
  vertex and edge IDs, and identify their owning seat using the existing seat
  display and color conventions.
- Present the existing public setup events in sequence: placement start,
  settlement, road, publicly derivable starting-resource grant, and setup
  completion. Event descriptions may show the grant delta from its public event;
  resource totals come only from the owner's viewer projection.
- Add presentation-only autoplay, pause/resume, and one-event forward stepping.
  During playback, reveal board pieces as their corresponding events are
  presented. The animation and event cursor are local display state, not a new
  canonical game state or a client-side rules reducer.
- Start autoplay only when the existing start flow sends the owner to the
  observer. Record a game-scoped, one-shot navigation intent and consume it when
  the observer first mounts. Direct observer links, reloads after consumption,
  and later visits show the latest persisted state without autoplay.
- Finish playback at the human input boundary or the setup completion event.
  For a human game, stop after the final currently available AI event and show
  which human seat is expected to act. For an AI-only run, stop at
  `initial_placement_completed.v1` / `turn_ready`, even though the queued setup
  job may report a completed lifecycle status.
- Preserve event ordering and loading behavior when consuming the existing
  bounded event pages. Do not silently skip an event when a page has more data.
- Respect `prefers-reduced-motion`; keep playback understandable when piece
  motion is reduced or disabled, and expose control/status labels to assistive
  technology.

## Out of scope

- Changes to Go placement rules, AI choices, event payloads, state schemas, or
  engine pacing. These are already owned by Features 5a and 5b.
- Sending human placement commands or presenting legal placement choices. That
  belongs to planned Feature 5d, after this observer slice.
- Normal turns, resource production after setup, or replaying events after the
  setup handoff.
- Changing historical replay authorization, removing existing replay controls,
  adding routes, or changing the outer replay API version. Existing API access
  and replay navigation remain as they are until a separate approved spec
  changes them.
- Displaying another seat's current resource inventory, private cards, or other
  seat-private data. Public starting-resource grant events remain visible as
  authorized by the existing event visibility rules.
- User-selectable playback speed or engine/simulation pacing controls.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step you haven't read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - Safe setup replay projection** - add a versioned public
  `state-v2` frame projection for setup metadata and per-seat structure IDs, plus
  a viewer projection containing only the human owner's resources. Preserve the
  existing `replay-v1` response and `state-v1` frame behavior.
  *Done when:* Laravel feature tests prove setup fields and structures are
  present, raw player resources and other seats' inventories are absent, the
  human owner's resource view is correct, AI-only viewer state is null, and
  existing `state-v1` replay expectations still pass.
- [x] **Step 2 - Render the persisted setup state** - parse the versioned frame
  safely in React, show the active setup phase/seat/order and owner-appropriate
  resources, and render projected settlements and roads on the existing board.
  *Done when:* the observer renders a three- and four-seat setup frame with
  pieces at the IDs supplied by the API, shows only the human viewer's current
  resource totals, renders an AI-only public view without inventories, and keeps
  existing non-setup replay frames working.
- [x] **Step 3 - Ordered setup event playback and controls** - build a small
  typed presentation model from the authorized public setup events; add
  autoplay, pause/resume, and one-event stepping, with piece reveal and readable
  event narration in sequence.
  *Done when:* browser coverage verifies event order and each event's visible
  effect, pause holds the cursor, resume continues it, stepping advances exactly
  one event, pagination does not skip events, reduced-motion preferences are
  honored, and playback stops at the human-input boundary or setup completion.
- [x] **Step 4 - First-arrival autoplay and end-to-end handoff** - connect a
  game-scoped `sessionStorage` one-shot intent to the existing start navigation,
  consume it on the first observer mount, and verify later visits use the latest
  persisted state.
  *Done when:* browser coverage proves that starting a setup opens and autoplays
  once, while direct observer navigation, reloading after the intent is
  consumed, and reopening from the library do not replay from the beginning;
  a real Compose observer check confirms the API and browser agree on the setup
  phase and stop point.

## Files / areas

- `apps/api/app/Services/GameReplayProjection.php` - allowlisted public setup
  state and human-seat viewer projection.
- `apps/api/tests/Feature/GameReplayTest.php` - projection shape, compatibility,
  and resource-privacy coverage.
- `apps/web/src/features/replay/replayApi.ts` - versioned frame and viewer
  projection response validation.
- `apps/web/src/features/replay/publicReplayState.ts` - safe setup frame and
  event presentation parsing.
- `apps/web/src/features/replay/useReplayNavigation.ts` and
  `apps/web/src/features/replay/GameObserver.tsx` - ordered event loading,
  one-shot observer playback, status, and controls.
- `apps/web/src/features/board/BoardSvg.tsx` - render setup roads and
  settlements using existing board topology coordinates.
- `apps/web/src/features/games/useGameStart.ts` and
  `apps/web/src/features/replay/observerAutoplayIntent.ts` - mark only the
  start-flow observer arrival for autoplay, separately from game-start request
  recovery state.
- `apps/web/src/App.css` - responsive playback controls, pieces, transitions,
  and reduced-motion styling.
- `apps/web/e2e/game-observer.spec.ts` and its replay fixtures/helpers - setup
  projection, event playback, privacy, and return-visit browser coverage.
- `apps/web/e2e/compose-observer-smoke.spec.ts` - assert the real Compose setup
  projection and human-input stop point through the existing observer smoke
  flow.

Do not change Go engine files or add dependencies for this feature.

## Data / contracts

- Keep the outer replay response at `replay-v1`; event pagination, owner scope,
  and the existing visibility filter remain authoritative.
- For `state-v2` frames, version the expanded nested public projection as
  `replay-public-v2`. It contains only `phase`, `active_seat_number`,
  `seat_order`, `round`, `step`, and `players` entries shaped as
  `{ seat_number, settlements, roads }`, alongside any already-supported safe
  public fields that are present. It never copies the canonical `resources`
  property from `state-v2.players`.
- For an eligible human game, version the viewer shape as
  `replay-viewer-v1` with `{ seat_number, resources }`, copied only from the
  snapshot entry whose seat number equals `game.human_seat_number`. Keep viewer
  state null when the game is AI-only, the snapshot is legacy, or no matching
  player entry exists.
- Keep `state-v1` snapshots on their existing `replay-public-v1` shape so old
  bootstrap snapshots remain readable. Do not relabel historical snapshots or
  backfill persisted data.
- Reuse the existing public event types and payloads. Playback begins with
  `initial_placement_started.v1`; `game_initialized.v1` is setup history context,
  not a placement action to animate. Structure placement comes from the
  corresponding public settlement and road event payload IDs. Resource grant
  deltas come only from the public `initial_resources_granted.v1` event; current
  inventories come only from the viewer projection.
- The local playback cursor and revealed pieces are presentation state. On a
  normal latest-state view or a later visit, use the server-projected complete
  structure list rather than attempting to reconstruct a historical canonical
  state in React.
- Store the autoplay marker in a separate game-scoped session-storage key so
  clearing the existing game-start recovery intent cannot consume it before
  navigation. If no marker is present, render the latest saved frame.

## Testing

- Laravel: run `cd apps/api && composer test`. Include focused feature coverage
  for public projection allowlisting, owner-only resource projection, AI-only
  null viewer state, and `state-v1` compatibility.
- React: run `cd apps/web && npm run lint`, `npm run build`, and
  `npm run test:e2e`. Cover the setup parser through the rendered contract,
  board IDs and seat ownership, event order, pagination, playback controls,
  lifecycle stop conditions, privacy, first-arrival behavior, and reduced motion.
- Integration: run
  `COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-observer-smoke.sh`
  with a started setup game and confirm the real API projection and observer
  reach the same human-input or setup-complete boundary. No Go tests are needed
  because this feature does not change the engine.
- Do not install a test runner or other dependency. If managed Chromium is not
  present, install it using the repository command before running browser tests.

## Notes for the AI

- Laravel owns viewer-safe projection and authorization. Go remains the only
  rules and canonical-transition authority. React may parse and animate supplied
  events, but it must not infer legal placements, compute resource grants from
  board topology, or construct a replacement canonical game state.
- Validate any state/event fields read from JSON before using them for display.
  Unknown event types remain readable in the existing history list but do not
  mutate the setup playback presentation model.
- The user confirmed that autoplay should run only on first arrival from the
  start flow. Consume the one-shot intent at observer mount so a subsequent page
  reload or library visit opens the latest state without starting playback
  again.
- Keep the slice focused on setup projection and presentation. Do not alter the
  later product policy for full replay access on unfinished games.
