# Feature: Fast local development workflow

**From build-plan:** feature 3e
**Status:** complete

## Goal

Add an explicit Docker Compose development layer that lets ordinary source edits
reach the running API, worker, Go engine, and React client without rebuilding
their images. Keep the existing image-based Compose stack as the stable default,
and make dependency, Dockerfile, and base-image changes visibly distinct from
normal source edits.

## In scope

- Add an opt-in `compose.dev.yaml` override layered on `compose.yaml`.
- Bind-mount the API, web, and Go source directories into their development
  containers.
- Keep PHP `vendor`, API writable runtime directories, and web `node_modules`
  in container-managed volumes so source mounts do not hide dependencies or
  create host permission problems.
- Run Laravel's API against mounted source and use a reload-friendly queue
  command so newly edited PHP code is used by later jobs.
- Run Vite with mounted source and file polling support for Docker Desktop and
  WSL environments.
- Run the Go engine from the compiler-capable Docker build stage so a Go source
  edit can be compiled after restarting the engine without rebuilding its image.
- Make the Compose smoke script able to inspect the development Compose layer.
- Document the normal development start command, source-edit behavior, and the
  separate dependency or Dockerfile rebuild procedure.

## Out of scope

- Changes to game rules, API behavior, persistence, queue semantics, or service
  contracts.
- Replacing the stable image-based `compose.yaml` workflow.
- A public production Compose or cloud deployment configuration.
- Automatic Go file watching. The development engine command will recompile on
  service restart; a later slice can add a dedicated watcher if that proves
  valuable.
- Automatic synchronization of changed Composer or npm dependencies. The
  development workflow will document how to refresh the container-managed
  dependency volumes when lockfiles change.
- Database resets or changes to the persistent PostgreSQL volume.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files; I read it and understand it.
4. I approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step I have not read. If a diff is too big to review, the step was
too big, so split it.

## Build steps

- [x] **Step 1 - Add the Laravel development Compose layer** - create the
  opt-in override with API and worker source mounts, container-managed PHP
  dependency and writable runtime volumes, and a reload-friendly worker command.
  *Done when:* `docker compose -f compose.yaml -f compose.dev.yaml config --quiet`
  passes; the layered stack starts; `/up` is healthy; the worker health check
  recognizes its development command; and API or worker source edits do not
  require an image rebuild.
- [x] **Step 2 - Add the mounted Vite development workflow** - mount the React
  source and `node_modules`, configure polling only when requested by the
  development layer, and preserve the existing `/api` proxy to the API service.
  *Done when:* the web container serves on port `5173`, a source edit is
  reflected by Vite without rebuilding the web image, and the web health check
  remains healthy in a Docker Desktop or WSL-style environment.
- [x] **Step 3 - Add compiler-backed Go development execution** - layer the Go
  source mount over the Dockerfile's existing `build` stage and run the engine
  with `go run` from `/src`, including a development health check because the
  compiler stage does not inherit the final image's health check.
  *Done when:* the development engine starts from the mounted source, its
  health check passes, and changing Go source followed by
  `docker compose -f compose.yaml -f compose.dev.yaml restart engine` uses the
  new code without rebuilding the image; the default image-based engine remains
  unchanged.
- [x] **Step 4 - Document and verify the two local workflows** - teach the
  Compose smoke script to use either the base file or the layered development
  files, document dependency-volume refresh and published-port overrides, and
  verify the complete development stack.
  *Done when:* the README and root `AGENTS.md` distinguish source edits from
  dependency or Dockerfile changes; the smoke script can validate the layered
  stack; Compose health checks pass; and the smoke flow persists the same
  bootstrap history as the stable stack.
- [x] **Repair F-02 - Separate development and stable engine images** - give
  the compiler-stage development engine its own project-specific image tag and
  document safe workflow switching, including recovery from the previously
  shared tag. *Done when:* both Compose configurations resolve successfully;
  switching development to stable and back within the same project starts the
  correct engine image with healthy services; the PostgreSQL container and
  volume are preserved; and the repair is ready for review.
- [x] **Repair F-01 - Recover from observable queue dispatch failure** - record
  a sanitized `queue_dispatch_failed` failure and return a stable HTTP 503 when
  Laravel can observe that the bootstrap job was rejected, while releasing the
  unique-job lock so the owner can retry. *Done when:* a focused feature test
  proves the failed push leaves no bootstrap history, persists `failed` with
  retryable metadata, returns 503, and a later start queues exactly one job;
  existing successful, duplicate, and worker failure paths remain green.
- [x] **Repair F-03 - Validate the canonical bootstrap response** - reject
  engine output whose metadata, board, seats, initialization payload, event
  ordering, visibility, or recipients do not match the supported versioned
  contract and persisted game configuration. *Done when:* focused negative
  tests prove protocol failure leaves no command, event, snapshot, or accepted
  state; valid bootstrap persistence and existing failure handling remain green.

## Files / areas

- `compose.dev.yaml` - new opt-in development overrides and named dependency or
  runtime volumes.
- `apps/web/vite.config.ts` - development-only file polling configuration while
  preserving the existing API proxy.
- `scripts/compose-smoke.sh` - optional Compose file selection for base or
  development-stack verification.
- `README.md` - local development commands, mount behavior, dependency refresh,
  port overrides, and rebuild boundaries.
- `AGENTS.md` - current Docker Compose commands and development workflow status.
- Existing `compose.yaml` and service Dockerfiles - preserve the stable runtime;
  the Go Dockerfile's named `build` stage is the development compiler image.

## Data / contracts

- No database schema, API response, Go game contract, or queue payload changes.
- The Compose layering contract is explicit:
  - `compose.yaml` remains the default image-based runtime.
  - `compose.dev.yaml` is applied with
    `docker compose -f compose.yaml -f compose.dev.yaml ...`.
  - Internal service names remain `api`, `worker`, `engine`, `postgres`, and
    `redis`.
- Development mounts are:
  - `./apps/api` to `/var/www/html`, with container-managed `vendor`,
    `storage`, and `bootstrap/cache` volumes.
  - `./apps/web` to `/app`, with a container-managed `/app/node_modules`
    volume.
  - `./services/game-engine` to `/src`, using the compiler-capable Go build
    stage.
- `VITE_API_PROXY_TARGET=http://api:8000` remains the container-internal web
  proxy target. A development polling flag may be set only by the dev override.
- The smoke script honors `COMPOSE_FILE` as a colon-separated list of
  repository-relative Compose files, defaulting to `compose.yaml`, without
  changing its existing API, database, or history assertions.
- When dependency lockfiles change, the documented refresh commands are
  `docker compose -f compose.yaml -f compose.dev.yaml run --rm api composer
  install` and
  `docker compose -f compose.yaml -f compose.dev.yaml run --rm web npm ci`.

## Testing

- Configuration: run
  `docker compose -f compose.yaml -f compose.dev.yaml config --quiet`.
- Development runtime: start the layered stack with `up --build -d`, confirm
  all six services are healthy, and check API `/up`, engine `/healthz`, and web
  port `5173`.
- Source reload behavior: edit a harmless web-visible value and observe Vite's
  update without an image build; edit a Go log or response value, restart only
  `engine`, and observe the mounted code without rebuilding the engine image.
- Worker behavior: enqueue a bootstrap job after a PHP source edit and confirm
  the development worker processes the current source and persists the same
  command, ordered events, and snapshot.
- Integration: run
  `COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-smoke.sh`
  against the layered Compose files, using `APP_PORT` and `API_BASE_URL` when
  another local process owns port 8000.
- Regression checks: run `cd apps/api && composer test`,
  `cd services/game-engine && go test ./...`, and
  `cd apps/web && npm run lint && npm run build` when the corresponding files
  are changed.

## Notes for the AI

- This is development infrastructure, not a second application architecture.
  Keep the base Compose file reproducible and opt into mounts explicitly.
- A bind mount hides image contents at its target. Always preserve PHP and npm
  dependencies with container-managed volumes, and document how lockfile
  changes refresh those volumes.
- `queue:work` is long-lived and can retain loaded PHP classes. Use the
  reload-friendly development command rather than pretending a source mount
  alone reloads an already-running worker.
- The final Go image intentionally has no compiler. Use the existing `build`
  stage for development and keep the production-like final stage untouched.
- Do not add application logic or duplicate game rules while changing Compose
  commands. Preserve the PostgreSQL volume and the Redis-only transient role.

## Findings

### 03e/F-01 [P1] closed - Queue dispatch failure leaves a game permanently queued

**File:** apps/api/app/Services/GameRunService.php:58
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Pre-existing Feature 3c (`123ff6a`), not introduced by 3e.
**Why it matters:** The transaction commits `lifecycle_status = queued` before
`BootstrapGameRun::dispatch()` is called. An observable push exception escapes
without recording failure, and subsequent start requests return `in_progress`
without dispatching. The game can remain stuck despite queue recovery. The
archived 3c contract explicitly requires `failed`, `queue_dispatch_failed` and a
stable HTTP 503 for this case. An isolated fake-dispatch probe confirmed a
thrown push error leaves `queued`, null failure metadata, and a second start
returns `in_progress`. Existing tests never simulate a push exception.
**Suggested fix:** Catch observable dispatch failures, record sanitized
`queue_dispatch_failed` metadata transactionally with guards against overwriting
committed bootstrap work, and return the specified 503 response. Ensure a retry
can actually dispatch, including cleanup of any acquired unique-job lock. Add a
failed-push/recovery regression test. Keep the explicitly deferred process-crash
window and an outbox design outside this repair.
**Resolution:** 2026-10-14 repair approved and marked `fixed`. Added an explicit
unique-job dispatch adapter that releases its lock when queue insertion throws.
Observable dispatch failures now record sanitized `queue_dispatch_failed` metadata
with `failed` lifecycle state and return the specified HTTP 503. The guarded
failure transaction does not overwrite committed bootstrap history, and the
existing retry path can enqueue the same game again. A regression test proves
failed-push recovery, no partial bootstrap history, the stable error response,
and exactly one job on retry. Pint and the full Laravel suite (76 tests, 441
assertions) passed. The 2026-10-14 focused re-audit reviewed the dispatch
adapter, unique-lock lifecycle, owner-scoped start path, and regression test;
the observable failure and retry path remain correct, with no new issue in
scope.

### 03e/F-02 [P1] closed - Development engine build replaces the stable engine image

**File:** compose.dev.yaml:36
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Introduced by Feature 3e; the switch-back instruction is at
`README.md:90`.
**Why it matters:** Both Compose variants use the implicit engine image tag
`<project>-engine`, but the development override builds target `build` instead
of the final runtime image. The current `catan-engine` image has no entrypoint,
command `["/bin/sh"]`, and no healthcheck. The documented `docker compose up -d`
switch back to stable reuses that existing image without rebuilding it. A
Compose dry run shows recreation/start without an image build. With the dev
command removed, this image starts a shell instead of the engine, breaking the
stable runtime and dependent service health requirements. The previous stable
smoke used a separate Compose project name, so it did not exercise this switch.
**Suggested fix:** Give the compiler-stage development engine a distinct image
tag, and verify switching both ways within the same Compose project. At minimum,
require `--build` when switching back and correct the README, while documenting
that the shared tag is still overwritten. Preserve the existing PostgreSQL volume.
**Resolution:** 2026-10-14 repair approved and marked `fixed`. The development
override now uses
`${COMPOSE_PROJECT_NAME:-catan}-engine-dev:local`; README switching instructions
include rebuilding stale stable images and the one-time recovery from the old
shared tag. Both Compose configurations and a custom project name resolve.
The existing `catan` project was switched development -> stable -> development:
all six services became healthy in both workflows, and the real preview path
through Vite, Laravel and Go returned HTTP 200 with 19 hexes. Stable ran
`/usr/local/bin/game-engine` without a compiler; development ran
`go run ./cmd/game-engine` against the `/src` bind mount. Rebuilding the
development engine after restoring the stable image left the stable image ID
unchanged. The PostgreSQL container ID, `catan_postgres-data` volume and all
five recorded table counts remained unchanged. API tests (75 tests, 426
assertions), Go tests, React lint/build and diff checks passed. The final running
stack is development. The 2026-10-14 focused re-audit reviewed both Compose
configurations, the Go Dockerfile, switching documentation, and the smoke
workflow. The stable configuration resolves to the project engine image while
the development override resolves to `catan-engine-dev:local`; no new issue was
found in scope.

### 03e/F-03 [P1] closed - Bootstrap validation permits inconsistent canonical history

**File:** apps/api/app/Services/GameEngineClient.php:112
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Pre-existing Features 3b/3c, not introduced by 3e.
**Why it matters:** Bootstrap validation checks broad shapes and only the first
event. It does not correlate response metadata, board seed, seats or event
payloads with the requested/persisted configuration, or validate later events.
`GameBootstrapService` then persists all returned state and events. An isolated
fake-engine probe successfully committed state with a different seed, changed
the stored human controller to AI in canonical state, accepted an initialization
seat count of four for a three-seat game, and persisted event sequences `[1,3]`
with an invalid visibility value. This makes the command input disagree with its
accepted state/history and bypasses the ordered, versioned transport contract.
The real Go implementation currently emits valid output; the defect is the
Laravel boundary accepting and durably recording invalid output.
**Suggested fix:** Validate response/request metadata consistency and match the
returned seats and board metadata to the persisted game before committing. Check
every event's transport shape, ordering, visibility and recipient metadata using
the supported bootstrap contract. Reject violations as protocol failures and
add negative cases proving no history is written. Do not duplicate Go gameplay
rules in Laravel.
**Resolution:** 2026-10-14 repair approved and marked `fixed`. The Laravel
engine client now correlates bootstrap metadata, board metadata, seats,
initialization payload, event ordering, visibility, and recipients with the
request. The orchestration service rechecks the response against the locked
persisted game configuration before writing history. Protocol mismatches now
leave no command, event, snapshot, or accepted state. Focused negative tests,
the full Laravel suite (77 tests, 469 assertions), Pint, and diff checks passed.
The 2026-10-14 focused re-audit reviewed both validation boundaries and their
tests, confirmed the original defect is gone, and found no new issue in scope.
