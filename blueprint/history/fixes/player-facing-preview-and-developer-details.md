# Player-facing preview and developer details

**Type:** Fix

**Fixes:** F-10

**Status:** complete

## The problem

The anonymous board preview is useful as a development and API demonstration,
but its main content presents implementation terms such as ruleset versions,
map versions, canonical responses, schema data, and renderer-oriented status to
ordinary visitors. This makes the preview feel like a diagnostic console and
obscures the simple action of generating and inspecting a board.

The persisted game observer already keeps its lower-level diagnostics behind a
collapsed details area. This slice addresses the remaining preview-facing part
of F-10 while preserving the preview as a useful development surface.

## The fix

- keep `/` and `/preview` as stateless seeded-board previews;
- keep useful player-facing content visible: seed input, board status,
  reproducibility guidance, privacy messaging, and the generated board;
- move technical metadata and developer wording into an explicitly labelled,
  collapsed developer-details area;
- preserve access to the seed, ruleset, map, schema, and response information
  for debugging without presenting it as the primary user journey;
- keep the existing API contract, board rendering, authentication navigation,
  and responsive layout unchanged;
- add browser coverage for the default preview presentation and the developer
  details disclosure;
- do not add a separate debug service, route, dependency, or game logic.

## Build steps

### 1. [x] Separate preview content from developer diagnostics

Update the preview presentation and styles, then extend its focused Playwright
coverage so technical information is available on demand rather than in the
primary layout.

*Done when:* both preview routes still generate the same board from a seed, the
default screen uses player-facing language without exposing implementation
metadata as primary content, the collapsed developer-details area reveals the
diagnostic values when opened, and the existing authenticated navigation and
responsive no-overflow behavior remain intact.

### 2. [x] Remove remaining service terminology

Replace the idle and loading preview messages that refer to a canonical or
board service with concise player-facing wording, while keeping the existing
developer disclosure and error states intact.

*Done when:* the default idle and loading preview states explain what the
visitor can do and what is happening to their board without mentioning an
internal service or canonical response, and the preview browser coverage still
passes for both routes and the narrow viewport.

## Verify

- Run `cd apps/web && npm run lint`.
- Run `cd apps/web && npm run build`.
- Run focused preview and authentication browser tests:
  `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/preview.spec.ts e2e/auth.spec.ts`.
- Run `git diff --check`.

## Findings

### player-facing-preview-and-developer-details/F-10 [P2] closed - Technical diagnostics dominate player-facing information

**File:** apps/web/src/features/replay/GameObserver.tsx:225
**Found:** 2026-10-16 by /audit (scope: full browser UI)
**Why it matters:** The default observer exposes Persisted topology, Safe
context, Replay cursor, Snapshot index, Latest checkpoint, Selected frame,
Projection, command/event sequences, schema versions, Lifecycle, and seats.
The preview also exposes INT64, canonical response, stateless, pointy-top,
ruleset versions, and renderer terminology (apps/web/src/App.tsx:390,432,537).
These consume space while asking ordinary players to interpret implementation
details. Start run, View run, and Completed also need to distinguish the current
bootstrap execution from a completed playable match.
**Suggested fix:** Present Board, Players, Game status, History, and meaningful
game actions. Put safe schema/seed/cursor diagnostics behind an explicit
developer/details disclosure. Use actual API turn/phase data for player wording;
never rename command 75 to turn 75 without a real mapping. Until gameplay ships,
label simulations and unavailable human actions honestly. Keep server rules
and private projections intact.
**Resolution:** Re-examined 2026-10-16. The current observer defaults to player
and history information; raw frame, cursor, checkpoint, projection, and schema
fields are no longer rendered in the default layout and technical game details
are collapsed. Repaired 2026-10-17 by `/implement F-10`: both preview routes now
use player-facing copy, while seed format, response status, board schema,
ruleset, and map metadata are available through a collapsed Developer details
disclosure. Browser coverage confirms the values are hidden by default and
available when the disclosure is opened. Re-examined 2026-10-17: the repair is
incomplete because the default idle state still says "from the canonical
service" at `apps/web/src/App.tsx:533`, and the loading state still says
"Contacting board service" at `apps/web/src/App.tsx:545`. Repaired 2026-10-17
by `/implement` step 2: the idle state now explains what the visitor will see,
and the loading state explains that the same seed creates the same board,
without internal service or response terminology. Browser coverage confirms
the player-facing copy on the idle and loading states. Re-examined 2026-10-17:
the repaired preview source contains no remaining canonical, service, response,
or renderer terminology in the primary idle, loading, success, or board-empty
states. The remaining technical values are inside the explicit collapsed
Developer details disclosure, and the focused preview and authentication suite
passes 11/11. F-10 is closed.
