# Feature: Local Docker Compose runtime

**From build-plan:** feature 3d, under feature 3
**Status:** complete

## Goal

Make the full local development stack runnable with one Docker Compose
workflow: the Laravel API, its long-lived queue worker, the stateless Go game
engine, PostgreSQL, Redis, and the existing React/Vite client run together with
explicit service health checks and documented smoke verification.

This matters because feature 3c now depends on a real queue worker, Redis
uniqueness/cache coordination, PostgreSQL durability, and a network-reachable
engine. The local runtime should exercise those boundaries instead of silently
falling back to SQLite, a database queue, or a host-only Go process.

## In scope

- Add a root Docker Compose definition for the local stack:
  - Laravel API;
  - a separate Laravel queue worker;
  - the stateless Go game engine;
  - PostgreSQL 18;
  - Redis 8.2;
  - the existing React/Vite development server.
- Add development Docker images and ignore files for the API, Go engine, and
  React client.
- Configure the containers through service DNS and environment variables:
  Laravel uses PostgreSQL and Redis, and calls the engine at `engine:8080`.
- Keep PostgreSQL as the only durable application store. Redis is used for
  queues, cache, sessions, and queue uniqueness/coordination, with no game
  state persisted there.
- Make the Go listener address configurable while preserving the current
  host-local default, so the engine can bind to all container interfaces in
  Compose.
- Add a minimal engine health endpoint and health checks for every service
  whose readiness affects the local workflow.
- Run Laravel migrations during API startup before the API reports healthy;
  start the worker only after the database, Redis, engine, and API are ready.
- Make the Vite development proxy target configurable so browser requests made
  through the web container reach the API service rather than the web
  container itself.
- Document startup, service URLs, logs, shutdown/reset behavior, health
  checks, database access from inside Compose, and a repeatable end-to-end
  smoke flow.

## Out of scope

- Production deployment, cloud infrastructure, Kubernetes, TLS, horizontal
  scaling, image publishing, or production secret management.
- CI workflow changes or a new root-level combined test command.
- New game rules, turn execution, AI behavior, public state/history
  projections, or changes to the queued orchestration contract from feature
  3c.
- New application persistence tables or a redesign of the queue/outbox model.
- Moving canonical game state, events, or snapshots into Redis.
- React gameplay UI work. The existing board preview only needs to remain
  reachable through the Compose development server.
- A separate production-grade observability stack. Compose health checks and
  readable service logs are sufficient for this local slice.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); the user reads it and understands it.
4. The user approves, then chooses whether to commit a checkpoint or continue.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step the user has not reviewed. If a diff is too large to read in
one sitting, split it.

## Build steps

- [x] **Step 1 - Containerize and health-check the Go engine** - make the
  listener address configurable, add `GET /healthz` with a small JSON success
  response, and add a multi-stage engine image. The default non-Compose
  listener behavior remains `127.0.0.1:8080`; Compose overrides it with
  `0.0.0.0:8080`. *Done when:* `cd services/game-engine && go test ./...`
  covers the health route and existing engine routes still pass; the engine
  image builds; a container started with the Compose bind address serves
  `/healthz` and `/v1/boards/generate` successfully.
- [x] **Step 2 - Add the PostgreSQL/Redis-backed API and worker stack** - add
  the Laravel runtime image, the root `compose.yaml`, local Compose
  environment defaults, PostgreSQL and Redis services, and separate `api` and
  `worker` services using the same application image. Add health checks and
  dependency conditions so PostgreSQL and Redis are healthy before Laravel
  starts, the API runs idempotent migrations before becoming healthy, and the
  worker starts only after the API is healthy. Configure the worker to consume
  the Redis queue with the retry policy required by feature 3c. *Done when:*
  `docker compose config` succeeds; `docker compose up --build -d api worker
  engine postgres redis` reaches healthy/running services; `/up` returns 200;
  Laravel reports `pgsql` and `redis` configuration inside the container; and
  a queued job can be consumed without any host-installed PHP, Go, PostgreSQL,
  or Redis process.
- [x] **Step 3 - Add the Compose web development service** - add the React
  development image and service, and make the existing Vite API proxy target
  configurable. Compose points the proxy at `http://api:8000`, while the
  default remains the current host-local `http://127.0.0.1:8000` for running
  Vite outside Docker. *Done when:* `docker compose up --build -d` serves the
  existing web page at `http://localhost:5173`, the web health check passes,
  and the existing board-preview request reaches Laravel through Vite and
  returns the canonical board response from the Go engine.
- [x] **Step 4 - Document and prove the complete local flow** - update the
  root development documentation and add a repeatable Compose smoke command.
  The smoke flow waits for health checks, registers a disposable user, creates
  a three-seat game, starts it, polls until its lifecycle is `running`, and
  asserts in PostgreSQL that one bootstrap command, its events, and its
  initial snapshot were persisted. It must use a unique test identity on each
  run and must not delete the developer's named PostgreSQL volume. *Done when:*
  a fresh `docker compose up --build` followed by the documented smoke command
  passes; the output identifies each healthy dependency and the final running
  game; repeating the start request for the same game does not create duplicate
  bootstrap history; and the docs explain `docker compose down` versus the
  explicitly destructive `docker compose down -v` reset.

## Files / areas

- `compose.yaml` for the local service graph, ports, named PostgreSQL volume,
  environment wiring, restart policies, health checks, and dependency
  conditions.
- `compose.env.example` for overridable local-only credentials, the Laravel
  application key, host ports, and service settings; it must clearly state
  that its defaults are not production secrets. The documentation must explain
  that Compose reads a copied root `.env` (or an explicit `--env-file`), which
  is separate from `apps/api/.env`.
- `apps/api/Dockerfile` and `apps/api/.dockerignore` for the PHP CLI runtime,
  Composer dependencies, PostgreSQL PDO support, Redis/PhpRedis support,
  writable Laravel runtime directories, and the `api`/`worker` shared image.
- `services/game-engine/Dockerfile` for a multi-stage Go build of the
  stateless engine binary.
- `services/game-engine/cmd/game-engine/main.go` for the configurable bind
  address, if the existing hard-coded address remains the only blocker.
- `services/game-engine/internal/httpapi/` and its tests for the operational
  health endpoint; existing versioned game endpoints must remain unchanged.
- `apps/web/Dockerfile` and `apps/web/.dockerignore` for the Vite development
  container.
- `apps/web/vite.config.ts` for the environment-controlled API proxy target.
- `scripts/compose-smoke.sh` (or an equivalently small documented command)
  for the authenticated create/start/poll/database assertion flow.
- `README.md` for prerequisites, startup, service URLs, health checks, logs,
  database inspection, smoke verification, and reset instructions.
- No migration files are expected to change; existing game, command, event,
  snapshot, queue, and failed-job tables must run unchanged on PostgreSQL.

## Data / contracts

### Compose service graph

| Service | Responsibility | Internal address | Host access |
|---|---|---|---|
| `api` | Laravel HTTP API and migrations on startup | `api:8000` | `localhost:8000` |
| `worker` | Long-lived Laravel Redis queue worker | none | logs via Compose |
| `engine` | Stateless Go rules/bootstrap HTTP API | `engine:8080` | `localhost:8080` for diagnostics |
| `postgres` | Durable Laravel/application data | `postgres:5432` | internal by default; inspect with `docker compose exec` |
| `redis` | Queue, cache, sessions, and coordination | `redis:6379` | internal by default |
| `web` | React/Vite development server and API proxy | `web:5173` | `localhost:5173` |

The default Compose network is sufficient. The API and worker must use the
Compose service names, never `127.0.0.1`, for PostgreSQL, Redis, or the engine.
Only the API, engine, and web ports need to be published by default; keeping
PostgreSQL and Redis internal avoids host-port collisions and accidental
exposure. The documentation can show `docker compose exec postgres psql ...`
for database inspection.

### Laravel runtime environment

Compose supplies equivalent values to the following application settings,
allowing developers to override them through the root Compose environment file
(copied from `compose.env.example`, or passed with `--env-file`):

```dotenv
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=catan
DB_USERNAME=catan
DB_PASSWORD=catan
QUEUE_CONNECTION=redis
CACHE_STORE=redis
SESSION_DRIVER=redis
REDIS_CLIENT=phpredis
REDIS_HOST=redis
REDIS_PORT=6379
GAME_ENGINE_URL=http://engine:8080
GAME_ENGINE_TIMEOUT=2
```

The image must include the PostgreSQL PDO driver and PhpRedis extension needed
by these settings. The queue worker runs the existing queue job; it does not
execute game rules or write Redis-backed game state.

### Engine operational contract

The engine keeps the existing versioned endpoints and adds one unversioned
operational endpoint:

```http
GET /healthz
```

Successful response:

```json
{"status":"ok"}
```

Non-`GET` requests receive HTTP 405 with `Allow: GET`; the endpoint has no
state-changing behavior.

The endpoint is process health only. It must not access PostgreSQL or Redis and
must not generate or persist a board. Compose uses it to decide when `api` and
`worker` may start calling the engine. The listener address is controlled by a
runtime variable such as `GAME_ENGINE_ADDR`, with `127.0.0.1:8080` retained as
the default for direct host execution and `0.0.0.0:8080` set only in Compose.

### Readiness and startup contract

- `postgres` is healthy only after `pg_isready` accepts the configured database
  and user.
- `redis` is healthy only after `redis-cli ping` succeeds.
- `engine` is healthy only after `GET /healthz` returns 200.
- `api` waits for those dependencies, runs `php artisan migrate --force`, then
  serves Laravel on `0.0.0.0:8000`; its health check uses Laravel's `/up`
  endpoint.
- `worker` uses the same application image but a separate long-lived
  `php artisan queue:work redis` process. It waits for API readiness so the
  migration step has completed, and its health check proves the queue-worker
  process is present (the image includes the small process-inspection utility
  required for that check).
- `web` waits for API readiness, binds Vite to `0.0.0.0:5173`, and proxies
  `/api` to `http://api:8000`. The browser still calls the web origin, so it
  does not need to resolve the internal `api` hostname.

Health checks express readiness, not a guarantee that a dependency can never
fail later. Restart policies and the documented log commands are sufficient
for this local feature; distributed service discovery and failover are out of
scope.

### Smoke verification contract

The smoke command is a development diagnostic, not a new API endpoint. It
should verify, in order:

1. `api`, `worker`, `engine`, `postgres`, `redis`, and `web` are healthy or
   running according to their service type.
2. `POST /api/v1/auth/register` returns a bearer token for a unique disposable
   email address.
3. Authenticated `POST /api/v1/games` creates a three-seat game using the
   existing seed/ruleset/map payload and returns `lifecycle_status: created`.
4. Authenticated `POST /api/v1/games/{id}/run` returns HTTP 202 and
   `lifecycle_status: queued`; a repeated start request for that same game is
   also sent and must not enqueue a second active bootstrap.
5. Polling `GET /api/v1/games/{id}` eventually returns
   `lifecycle_status: running`, proving the separate worker consumed the job
   and the engine call completed.
6. PostgreSQL contains exactly one `bootstrap.v1` command for that game, at
   least one linked ordered event, and one initial snapshot. The assertion
   must be scoped to the newly created game, not global table counts.

The script may use the host's `curl`/`jq` plus `docker compose exec` for the
PostgreSQL assertion, and must fail with a useful service/log hint when a
health check or poll times out. It must not use Laravel's synchronous queue
driver or fake the engine call.

## Testing

- Step 1: add focused Go HTTP tests for `GET /healthz`, method handling, and
  the existing engine routes; run `cd services/game-engine && go test ./...`.
- Step 2: run `docker compose config`, build the API and engine images, start
  the backend services, inspect `docker compose ps`, call `GET /up`, and verify
  the migration table and queue connection from the containers. Run the
  existing Laravel suite with `cd apps/api && composer test` outside or inside
  the image as appropriate; no test should switch the Compose runtime back to
  SQLite or the synchronous queue.
- Step 3: run `cd apps/web && npm run lint` and `npm run build`, build the web
  image, and use the running Vite proxy to exercise the existing board preview
  request. The existing browser test remains the UI regression check when its
  managed Chromium binary is available.
- Step 4: run the complete documented smoke command against a fresh Compose
  start, preserve its HTTP output and PostgreSQL row assertions, then repeat
  the smoke flow with a new game identity. Focused checks precede the full
  smoke run; no destructive volume reset is needed for the evidence.
- Formatting remains required for any PHP changes:
  `cd apps/api && vendor/bin/pint --dirty --format agent`.
- The relevant final evidence is the Go suite, Laravel suite, web lint/build,
  `docker compose config`, healthy service output, and the successful
  create/queue/worker/persistence smoke flow.

## Notes for the AI

- This is runtime wiring, not a reason to duplicate game logic in PHP or React.
  Keep the Go service stateless and keep all canonical game persistence in
  PostgreSQL through the existing Laravel orchestration.
- The worker must be a distinct Compose service even though it shares the API
  image. An HTTP API process does not execute queued jobs merely because it can
  dispatch them.
- Use Compose health conditions as dependency ordering, but retain the
  application-level idempotency and PostgreSQL uniqueness safeguards from
  feature 3c. A worker restart must not create a second bootstrap command,
  event, or snapshot.
- Keep local credentials and the development application key clearly marked as
  local-only. Do not commit a real secret, and do not make production claims
  for this development Compose file.
- Do not expose PostgreSQL or Redis by default unless a later approved slice
  requires host-native clients; `docker compose exec` is enough for the smoke
  assertion and keeps the local dependency surface smaller.
- Avoid changing the existing API response shapes. The smoke flow should
  observe the already-defined `created -> queued -> running` lifecycle and
  inspect canonical persistence only through the database diagnostic step.
- If an image, health check, or migration behaves differently under PostgreSQL
  than the existing SQLite-focused test suite, fix only the runtime contract
  needed for this feature and record a separate follow-up for unrelated
  application behavior.
