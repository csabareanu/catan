# Feature: Private game library

**From build-plan:** feature 2c, under feature 2
**Status:** complete

## Goal

Allow an authenticated owner to list, inspect, and delete only their own
persisted games through the versioned Laravel API.

This gives the private game records created by feature 2b a safe management
boundary before gameplay execution and replay add more related state.

## In scope

- Protected `GET /api/v1/games` list endpoint.
- Protected `GET /api/v1/games/{game}` detail endpoint.
- Protected `DELETE /api/v1/games/{game}` endpoint.
- Owner-scoped Eloquent queries through the authenticated `User` relationship.
- Newest-first deterministic ordering with a fixed page size of 20 for lists.
- A compact list resource that omits the full board topology and seat rows.
- Reuse of the existing full `GameResource` for an owned game detail response.
- Stable `404 game_not_found` responses for missing or other-owner game IDs.
- `204 No Content` deletion with the existing foreign-key cascade to seats.
- Focused PHPUnit feature coverage for isolation, ordering, empty results,
  detail data, deletion, and authentication boundaries.

## Out of scope

- React routes, login screens, session-cookie integration, or a browser game
  library. Those require a separate frontend feature after the API contract is
  consumed by the client.
- Game creation, board generation, gameplay state, queued execution, commands,
  events, snapshots, results, and AI decisions.
- Search, filtering, user-selected sorting, bulk deletion, restore, soft
  deletes, sharing, invitations, or multiplayer permissions.
- Lifecycle restrictions on deletion. Until queued execution exists, an owner
  may delete any owned game returned by this API.
- Changes to the database schema. Existing owner foreign keys and the
  `game_seats.game_id` cascade are sufficient for this slice.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); the user reads it and understands it.
4. The user approves, then chooses whether to commit a checkpoint or roll
   straight on. `/complete` makes the real feature-level commit at the end.

Never accept a step the user has not reviewed. If a diff is too large to read in
one sitting, split it.

## Build steps

- [x] **Step 1 - Add the owner-scoped game list** - add the authenticated list
  route, fixed-size pagination, deterministic newest-first ordering, and a
  compact `GameSummaryResource` that exposes game metadata without the full
  board or seat rows. *Done when:* an authenticated owner receives HTTP 200
  with only their games, newest games appear first with an `id` tie-breaker,
  the paginated metadata reports a fixed page size of 20, an owner with no
  games receives an empty paginated `data` array, and an unauthenticated
  request receives the existing JSON 401 response.

- [x] **Step 2 - Add owner-scoped game detail** - add the authenticated detail
  route and retrieve the game through the owner's relationship before reusing
  the existing `GameResource`, including ordered seats and the canonical board
  snapshot. *Done when:* an owner receives HTTP 200 with the full documented
  game response, while a missing or other-owner ID receives the stable 404
  envelope and no other user's board or seat data is returned.

- [x] **Step 3 - Add safe game deletion** - add the authenticated delete route
  using the same owner-scoped lookup and return `204 No Content` after deleting
  the game. *Done when:* an owner deletion removes the game and its seats via
  the existing cascade, an other-owner or missing ID returns the same 404
  without deleting anything, unauthenticated deletion returns 401, and the
  focused plus full Laravel suites and Pint pass.

## Files / areas

- `apps/api/app/Http/Controllers/Api/V1/GameController.php` for the list,
  detail, and delete HTTP actions.
- `apps/api/app/Http/Resources/Api/V1/GameSummaryResource.php` for the compact
  paginated list representation.
- `apps/api/app/Http/Resources/Api/V1/GameResource.php` for the existing full
  detail representation, changed only if the library contract needs a small
  explicit adjustment.
- `apps/api/routes/api.php` for the protected collection and member routes.
- `apps/api/tests/Feature/GameLibraryTest.php` for owner isolation, response
  contracts, ordering, empty state, and deletion behavior.
- `apps/api/app/Models/User.php` and `Game.php` only if an existing
  relationship or query helper needs a focused adjustment. No migration is
  expected.

## Data / contracts

All routes require an `Authorization: Bearer <token>` header and use the
existing `auth:sanctum` middleware.

### List

`GET /api/v1/games` returns HTTP 200 with Laravel's standard paginated resource
shape. The server uses a fixed page size of 20; clients may select the normal
1-based `page` query parameter but may not choose the page size. It orders by
`created_at` descending, then `id` descending for deterministic ties.

Each `data` item contains:

```json
{
  "id": 1,
  "owner_id": 7,
  "mode": "human_vs_ai",
  "seed": "894177203164",
  "ruleset": {
    "key": "base",
    "version": "1.0.0"
  },
  "map": {
    "key": "standard",
    "version": "1.0.0",
    "orientation": "pointy"
  },
  "seat_count": 3,
  "human_seat_number": 1,
  "lifecycle_status": "created",
  "configuration": {
    "ai_count": 2,
    "map_key": "standard",
    "map_version": "1.0.0",
    "board_schema_version": "1"
  },
  "created_at": "2026-09-21T12:00:00.000000Z",
  "updated_at": "2026-09-21T12:00:00.000000Z"
}
```

The list intentionally omits `board` and `seats` so a library response remains
small as the number of games grows. An empty library is a successful response
with `data: []`, not a `404`.

### Detail

`GET /api/v1/games/{game}` returns HTTP 200 using the existing `GameResource`
contract. It includes the full canonical `board` snapshot and ordered public
seat metadata, but no future `current_state`, private resources, cards, or
other gameplay data.

### Missing or foreign games

The `{game}` route parameter is handled as a scalar game ID. It must not use
implicit unscoped model binding, because that would resolve another owner's
record before authorization is applied.

If the ID does not exist or belongs to another user, return HTTP 404:

```json
{
  "error": {
    "code": "game_not_found",
    "message": "The requested game was not found."
  }
}
```

The implementation must query through
`$request->user()->ownedGames()` before resolving a member record. It must not
call an unscoped `Game::find()` and then reveal another owner's game through a
different response or status.

### Delete

`DELETE /api/v1/games/{game}` returns HTTP 204 with no response body. The
existing `game_seats.game_id` foreign key cascades deletion of the game's seats.
No queue job or gameplay state is created by deletion.

## Testing

- Use PHPUnit feature tests with `LazilyRefreshDatabase`, `UserFactory`,
  `GameFactory`, and `GameSeatFactory`.
- Authenticate requests with factory-issued Sanctum bearer tokens.
- List tests cover owner isolation, newest-first ordering, deterministic ID
  tie-breaking, the fixed `meta.per_page` value of 20, the empty library,
  compact fields without board topology, and unauthenticated 401 behavior.
- Detail tests cover the full board and ordered seats for the owner, missing and
  other-owner 404 behavior, and unauthenticated 401 behavior.
- Delete tests cover HTTP 204, removal of the game and cascaded seats, refusal
  to delete another owner's game, missing IDs, and unauthenticated 401 behavior.
- Run focused library tests first, then `cd apps/api && composer test` and
  `cd apps/api && vendor/bin/pint --dirty --format agent`.
- No browser test is required because this slice adds no React UI.

## Notes for the AI

- Laravel owns authorization and persistence. Every list, detail, and delete
  query must be scoped through the authenticated owner relationship.
- Prefer a 404 for foreign IDs so the API does not disclose whether another
  user's game exists.
- Keep the controller focused on HTTP concerns. Reuse `GameResource` for detail
  and keep the list projection separate so board topology is not duplicated in
  every library row.
- Preserve deterministic ordering and the existing seat order from the model
  relationship.
- Do not add a policy or route-model binding that bypasses owner scoping. If a
  policy becomes useful later, it must reinforce the scoped query rather than
  replace it with an unscoped lookup.
- Do not add React auth or library state in this feature. The API must remain
  usable from Postman and other clients while the future first-party SPA auth
  decision is implemented separately.
- Keep future simulation games compatible with the same owner-scoped library;
  `mode` and nullable `human_seat_number` remain data, not authorization rules.
