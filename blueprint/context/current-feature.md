# Feature: Seeded board walking skeleton

**From build-plan:** feature 1
**Status:** in progress

## Goal

A supplied seed and supported base-game map configuration produce the same board
through a Go-owned generator, expose it through the versioned Laravel API, and
render it in React as a responsive SVG board. This is an anonymous, stateless
preview that proves the Go to Laravel to React path before authenticated game
creation or persistence exists.

## Design reference

- [New game prototype](../../prototypes/new-game.html) for the seed field and
  ruleset metadata.
- [Board observer prototype](../../prototypes/board-observer.html) for the board
  stage and overall visual language.
- [Prototype theme tokens](../../prototypes/theme.css) are the source of truth
  for colors, typography, spacing, and surfaces. Port the tokens needed by the
  board preview into the app's global stylesheet in build step 1.
- Keep this screen to the generated board and seed/map metadata. Do not copy the
  prototype's player panels, private tray, activity feed, or game actions before
  real game state exists.

## In scope

- Generate the standard 19-hex base-game board deterministically from a supplied
  seed. The initial supported configuration is ruleset `base` and map `standard`.
- Return a versioned board contract from the Go service and a public Laravel API
  endpoint. The endpoint is the approved anonymous exception for a stateless
  board preview; it must not create or read game records.
- Render the returned terrain, number tokens, and ports in a responsive SVG
  board. Include an editable seed field, a generate action, and clear loading,
  invalid-input, and service-error states. Prefill a fixed example seed and show
  the supported ruleset/map metadata.
- Keep the board configuration useful to later gameplay: stable tile, vertex,
  edge, and port IDs; topology; and version identifiers.

## Out of scope

- User registration, authentication, game creation, database persistence, or
  ownership. The preview is not a `Game` and has no history.
- Player seats, roads, settlements, cities, turns, scores, cards, robber actions,
  AI, simulation, event history, or replay.
- Custom board editing, alternative maps, expansions, or a generic plugin
  framework. Only the standard base-game map is implemented.
- PostgreSQL, Redis, queues, message brokers, Docker Compose, production
  hosting, or multiple human seats.
- Player panels, private hands, activity feeds, and game controls from the
  prototypes.

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

- [x] **Step 1 - establish the visual foundation** - port the required prototype
  theme tokens into the React global stylesheet and replace the Vite starter
  screen with a minimal board-preview shell, seed field, metadata area, and an
  honest empty state. Do not include fabricated board or player data. *Done
  when:* `cd apps/web && npm run lint`, `cd apps/web && npm run build`, and
  `cd apps/web && npm run test:e2e` pass, proving the themed shell, editable
  seed field, truthful empty state, metadata, disabled generation action, and
  desktop/mobile overflow behavior.
- [ ] **Step 2 - generate deterministic standard-map tiles** - add Go board
  domain types and seeded assignment of standard terrain and number tokens over
  the 19 classic axial hex coordinates. *Done when:*
  `cd services/game-engine && go test ./...` proves the standard tile/token
  counts, rejects malformed seeds/configuration, and a golden seed fixture
  remains stable across repeated runs.
- [ ] **Step 3 - derive topology and ports** - add stable logical vertices,
  edges, and deterministic port placement to the generated board. *Done when:*
  Go tests prove 54 unique vertices, 72 unique edges, 9 ports, valid references,
  the standard port mix, and no adjacent 6/8 tokens.
- [ ] **Step 4 - expose the Go board-generation API** - add a versioned HTTP/JSON
  endpoint around the generator and document its local run/test commands in the
  root `AGENTS.md`. *Done when:* handler tests cover valid generation, invalid
  input, unsupported map/ruleset, and stable JSON output, and the service runs
  without database or Redis access.
- [ ] **Step 5 - add the anonymous Laravel API boundary** - validate the public
  request, call the configured Go service, return the versioned board response,
  and map input/upstream failures to safe JSON errors. *Done when:*
  `cd apps/api && composer test` covers the forwarded contract, validation
  without an upstream call, timeout/unavailable handling, and malformed
  upstream responses.
- [ ] **Step 6 - connect the React preview to Laravel** - add explicit TypeScript
  API types/client, a local Vite `/api` proxy, seed submission, and loading,
  success, and error states. *Done when:* the browser receives the canonical
  board from Laravel and displays its seed and version metadata; repeating the
  same seed yields the same response, and rejected/unavailable requests are
  understandable without a blank screen.
- [ ] **Step 7 - render the responsive SVG board** - render hexes from API axial
  coordinates and logical topology, with terrain, number tokens, desert, and
  ports. *Done when:* the API-provided 19-hex board is legible at desktop and
  narrow widths without horizontal page overflow, the SVG has an accessible
  description, and `cd apps/web && npm run lint` plus
  `cd apps/web && npm run build` pass.

## Files / areas

- `apps/web/src/App.tsx`, `apps/web/src/App.css`, `apps/web/src/index.css`, and
  `apps/web/src/features/board/` for the preview screen, types, API client, and
  SVG renderer.
- `apps/web/vite.config.ts` for local API proxying.
- `apps/api/routes/api.php`, a versioned API controller/request and Go client,
  `apps/api/config/services.php`, `apps/api/.env.example`, and API feature tests.
- `services/game-engine/internal/board/`, the Go HTTP handler and executable,
  and Go tests/fixtures.
- Root `AGENTS.md` for the newly available Go test and local service commands.

## Data / contracts

The public Laravel endpoint is `POST /api/v1/boards/generate`. The stateless Go
endpoint is `POST /v1/boards/generate`. Both accept the same JSON request:

```json
{
  "seed": "894177203164",
  "ruleset_key": "base",
  "map_key": "standard"
}
```

`seed` is a canonical, non-negative base-10 string in the signed 64-bit range,
with no leading zeros except for `"0"`. It remains a string across PHP, Go, and
TypeScript. Only `base` and `standard` are supported in this feature; malformed
seeds or unsupported keys return `422`.

The success response is wrapped in `data` and has this versioned shape:

```json
{
  "data": {
    "board_schema_version": "1",
    "seed": "894177203164",
    "ruleset": { "key": "base", "version": "1.0.0" },
    "map": { "key": "standard", "version": "1.0.0", "orientation": "pointy" },
    "hexes": [],
    "vertices": [],
    "edges": [],
    "ports": []
  }
}
```

- A hex has a stable ID, axial `q`/`r`, terrain, nullable number token, and six
  ordered vertex IDs. The terrain mix is 4 forest, 4 pasture, 4 fields,
  3 hills, 3 mountains, and 1 desert. The 18 tokens are one each of 2 and 12,
  and two each of 3, 4, 5, 6, 8, 9, 10, and 11. Tokens 6 and 8 may not be
  adjacent.
- A vertex has a stable ID and integer logical-lattice coordinates (not screen
  pixels). Do not repeat `adjacent_hex_ids` on vertices: derive vertex-to-hex
  adjacency from the hexes' ordered `vertex_ids` when needed.
- An edge has a stable ID and exactly two endpoint vertex IDs. Derive edges by
  walking each hex's six ordered vertex IDs cyclically, canonicalizing each
  endpoint pair, and deduplicating shared sides. Keep the resulting global
  `edges` array as the addressable set of road/port locations; derive an edge's
  adjacent hexes from the hex rings instead of repeating `adjacent_hex_ids` on
  edges. Hexes do not duplicate this topology with `edge_ids`.
- A port has a stable ID, one perimeter edge ID, a nullable resource type, and a
  trade ratio. The standard mix is four generic 3:1 ports and one 2:1 port for
  each resource.
- The standard topology has 54 vertices and 72 edges. IDs derive from canonical
  logical coordinates/topology, not random values. The same request returns
  byte-stable logical data for a pinned board schema, ruleset version, and map
  version.
- Laravel returns `422` for request validation, `503` when Go is unavailable or
  times out, and `502` for an invalid Go response. Every error uses
  `{"error":{"code":"...","message":"..."}}`; validation may also include
  a `fields` object inside `error`. Codes are stable and internal exception
  details are never returned.

This board contract is load-bearing for later persisted games, setup placement,
trading, and replay. Go owns generation and topology; Laravel owns transport
validation and service orchestration; React owns only rendering coordinates and
presentation.

## Testing

- Go unit tests cover seeded determinism, a fixed golden seed, map counts and
  token rules, topology invariants, and handler/error behavior. Run
  `cd services/game-engine && go test ./...`.
- Laravel feature tests fake the Go HTTP boundary for request/response mapping,
  validation, unavailable service, and malformed response cases. Run
  `cd apps/api && composer test`.
- React uses Playwright with Chromium for browser-level checks. Run
  `cd apps/web && npm run test:e2e`, `cd apps/web && npm run lint`, and
  `cd apps/web && npm run build`. Browser evidence covers same-seed repetition,
  input/error states, and desktop/narrow layout as those behaviors are added.
- Verify the final vertical slice with the Go service, Laravel API, and Vite
  client running together; Docker Compose is not part of this feature.

## Notes for the AI

- Do not implement Catan legality, game state, or random generation in Laravel
  or React. Go is the canonical authority; Laravel validates and forwards; React
  renders the returned board.
- Keep generation stateless. This route is intentionally anonymous and must not
  read/write user or game data.
- Do not add player/status/tray mock data from the prototypes. Visual work must
  stay truthful to the board response.
- Keep Go independent of HTTP in its domain package, use deterministic inputs,
  run `gofmt`, follow the Laravel Boost conventions for API code, and do not add
  dependencies or infrastructure services without approval.
