# Feature 4c: Replay timeline and state stepping

**From build-plan:** feature 4c, Replay timeline and state stepping
**Type:** Feature sub-item
**Parent:** Feature 4, Replayable simulation observer
**Status:** not started

## Goal

Let an authenticated owner navigate the persisted replay of an owned game from
the browser. The observer will show authorized events, available snapshot
checkpoints, and the selected viewer-safe frame while keeping the board and
state projection authoritative from the server.

The browser must not apply events, reconstruct canonical state, or claim that a
frame represents an unsaved command position. State navigation uses persisted
snapshot checkpoints and reports each frame's actual command and event sequence.

## Design reference

The current observer shell and board workspace are the visual target:

- [Observer desktop draft](../reference/observer-desktop-draft.png)
- [Observer laptop draft](../reference/observer-laptop-draft.png)
- [Illustrated board desktop](../reference/illustrated-board-desktop.png)
- [Illustrated board mobile](../reference/illustrated-board-mobile.png)

Keep the desktop history content in the existing observer sidebar and place the
same navigation inside the existing mobile `Overview` drawer. Do not add a
permanent toolbar below the board or crowd the board with controls. The
throwaway prototypes contain board appearance references but no replay timeline
mockup, so this feature extends the approved live observer layout rather than
replicating a separate timeline design.

## User outcome

From an owned game observer, a user can:

- see the visible event history in ascending order;
- see which persisted snapshot checkpoints are available;
- move to the previous or next available checkpoint;
- select a checkpoint and see the corresponding board frame, status, and
  actual command and event positions;
- load another page of authorized events when more history exists;
- use the same navigation on desktop and a narrow phone viewport;
- understand when no snapshots or visible events are available.

An event without a matching persisted checkpoint remains history information.
It does not cause React to invent an intermediate board state. The selected
board frame remains the nearest persisted checkpoint returned by the replay API.

## In scope

- Extend the typed React replay client with the existing replay query options:
  `at_command_sequence`, `after_event_sequence`, and `limit`.
- Add replay navigation state for the selected checkpoint, loading state,
  abort and stale-response handling, and recoverable request errors.
- Render available snapshot positions as navigable checkpoint controls with
  previous, next, and current-position feedback.
- Keep the visible event list tied to the selected checkpoint boundary and load
  additional visible pages through the existing event cursor.
- Preserve Laravel's public and owner-seat-private event projection. React must
  consume the already-filtered event list and must not implement privacy rules.
- Keep the current observer polling behavior for queued and running games while
  allowing a user to navigate persisted frames when they exist.
- Add accessible desktop and mobile controls within the existing observer
  sidebar and `Overview` drawer.
- Add focused Playwright coverage for checkpoint navigation, event pagination,
  sparse or empty histories, request failures, keyboard use, and responsive
  layout.

## Out of scope

- Applying events or commands in Laravel or React to reconstruct state.
- Exact board frames for commands that have no persisted snapshot.
- New Go transitions, gameplay rules, snapshot production, snapshot scheduling,
  integrity comparison, or deterministic state reconstruction.
- Redis replay caching or a new materialized-frame service.
- Adding command identifiers or changing the replay-v1 event projection unless
  implementation evidence proves the existing checkpoint contract cannot support
  the navigation described here. Such a contract change must remain explicit
  and versioned.
- Human gameplay commands, legal action controls, victory rules, complete match
  results, or a new Watch route.
- Public sharing, cross-owner access, or changes to event visibility policy.
- A new routing library, state-management library, or animation dependency.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files, with a short explanation of each changed
   file and the observable done-when.
4. The user reviews and approves the step before the next one. Checkpoint
   commits are optional; `/complete` makes the feature-level commit at the end.

Never accept a step that has not been read. If a diff is too big to review, the
step was too big, so split it.

## Build steps

- [x] **Step 1 - Add the authoritative replay navigation seam** - extend the
  typed replay request with the existing cursor and frame-position query
  parameters, add selected-checkpoint state with abort and stale-response
  protection, and keep the observer's initial latest-frame load working. *Done
  when:* the replay client encodes an explicit decimal-string command position,
  the navigation hook exposes checkpoint and latest selection with abort and
  stale-response protection, the existing observer preserves its initial load
  and polling behavior, and a failed request remains recoverable. The browser
  controls that invoke the seam belong to Step 2.
- [x] **Step 2 - Add checkpoint controls to the observer history panel** - show
  the available snapshot checkpoints, previous, next, and `Latest` controls,
  the selected frame's command and event positions, and a clear empty-state
  when no snapshot exists. Use the existing desktop sidebar and mobile
  `Overview` drawer. *Done when:* selecting or stepping between checkpoints
  updates the board from the returned `public_state`, never changes the
  immutable board context, keeps the controls usable at the supported desktop
  and phone sizes, announces the selected position accessibly, and does not let
  active-game polling silently replace an explicitly selected historical frame.
- [x] **Step 3 - Complete visible history navigation and resilience** - add
  cursor-based loading for additional visible events at the selected frame,
  preserve event ordering, handle empty, sparse, queued, running, unauthorized,
  not-found, and network states, and cover keyboard and responsive behavior.
  *Done when:* a user can load all available visible event pages without
  duplicates, private events remain absent from the rendered list, navigation
  remains usable while requests are pending, and focused browser coverage plus
  lint and build pass.

## Files / areas

- `apps/web/src/features/replay/replayApi.ts` for typed replay query options,
  URL encoding, and the existing replay-v1 response guards.
- `apps/web/src/features/replay/GameObserver.tsx` for observer navigation state,
  frame loading, checkpoint selection, and event-page coordination.
- `apps/web/src/features/replay/ReplayTimeline.tsx` or another focused replay
  component for checkpoint and history presentation if extraction keeps the
  observer readable.
- `apps/web/src/features/replay/` for a focused navigation hook or decimal
  sequence helper when the behavior is reused.
- `apps/web/src/App.css` for observer sidebar, drawer, timeline, pending, and
  responsive states.
- `apps/web/e2e/game-observer.spec.ts` for focused browser coverage and mocked
  replay responses with different query positions and histories.
- Existing board files only if the observer needs a stable frame/status prop;
  do not duplicate or change the board renderer's game-state logic.
- No Laravel, Go, database, Compose, or deployment files are expected to
  change. Stop and propose a separate contract slice if the existing replay-v1
  endpoint cannot support the browser navigation.

## Data / contracts

The existing versioned `GET /api/v1/games/{game}/replay` contract is the source
of truth. The browser adds typed request options without changing the response
shape:

- `at_command_sequence` is a nonnegative decimal string selecting the requested
  frame boundary. The API returns the greatest persisted snapshot at or before
  that position.
- `after_event_sequence` is a nonnegative decimal string cursor for the next
  visible event page.
- `limit` remains the bounded event-page size and is never used as a substitute
  for a cursor.
- `snapshot_index` supplies ordered checkpoint metadata without raw state.
- `frame` supplies the viewer-safe projection and its actual
  `command_sequence` and `event_sequence`.
- `events` are already filtered for public visibility and the authenticated
  owner's seat-private visibility. The browser renders only those events.
- `event_cursor` controls additional pages and must be respected when the
  selected frame changes.
- Initial observer loading follows the latest persisted frame. Once the user
  selects an earlier checkpoint, polling may refresh lifecycle and checkpoint
  metadata but must preserve the selected frame until the user chooses `Latest`.

Command and event sequences are decimal strings because they are persisted big
integers. The client must not coerce them to JavaScript `number` values or
assume that command and event sequences are interchangeable. An event is an
exact board navigation point only when the API supplies a matching persisted
frame; otherwise it is displayed as history context and the board remains at
the selected checkpoint.

When a checkpoint changes, reset the event page to the first page bounded by
that checkpoint, then use `next_after_sequence` for later visible pages. Keep
immutable board topology and seat context from `context`; never copy them from
`public_state` or a raw snapshot.

## Testing

The web project has no separate unit test runner. Use focused Playwright
coverage together with the documented static checks:

- Mock replay responses by `at_command_sequence` and verify the browser sends
  the selected decimal-string position.
- Verify previous, next, checkpoint selection, latest-frame initialization,
  frame-position labels, and the no-snapshot state.
- Verify the selected public frame updates the board projection while board
  topology and seat context remain stable.
- Verify event-page loading uses the returned cursor, keeps ascending order,
  avoids duplicates, stops at `has_more: false`, and never displays an
  unauthorized event.
- Verify pending navigation, aborted or stale requests, 401, 404, malformed
  response, and network failure leave a recoverable observer state.
- Verify keyboard focus, live position announcements, the desktop sidebar,
  the mobile `Overview` drawer, and supported narrow viewports.
- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run focused Playwright coverage for `e2e/game-observer.spec.ts`, then the
  narrowest broader observer and navigation suites justified by changes.

Manual review should open an owned observer with more than one persisted frame,
select earlier and later checkpoints, load additional history, confirm the
displayed frame position, and repeat the flow from a phone-sized viewport.

## Notes for the AI

- React is a projection and navigation client, not a game engine. Never add a
  reducer that applies event payloads to the board.
- Treat the API response as authoritative. Keep the prior frame visible while a
  new checkpoint loads, but replace it only with the accepted response.
- Abort or ignore stale frame and event requests when the user selects another
  checkpoint or leaves the observer.
- Preserve the existing polling behavior for queued and running lifecycle
  statuses, while separating latest-following mode from an explicit historical
  selection. A bootstrap completion is not a completed match or a victory.
- Keep the board large and controls compact. Use the existing history sidebar
  on desktop and `Overview` drawer on phones; do not add a permanent control
  row below the board.
- Keep private data out of shared state and UI. Visibility is enforced by the
  replay API, and no client-side broadening of event access is allowed.
- Follow the existing `AccessShell`, `BoardSvg`, focus-trap, error, and status
  patterns before introducing an abstraction or dependency.
- This feature does not implement future multiplayer, alternate maps, or
  curated scenarios. Those directions remain documented for later work.
