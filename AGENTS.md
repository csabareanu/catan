# Catan project instructions

## Project context

Before substantive work, read `blueprint/context/project-overview.md` and
`blueprint/context/current-feature.md`. Until the overview is generated, use
`blueprint/project-plan.md` as the approved product and architecture source.

## Architecture boundaries

- `apps/api` is the Laravel control plane for identity, authorization, game
  lifecycle, persistence, queues, and the public JSON API.
- `services/game-engine` is the stateless Go authority for rules, legal state
  transitions, deterministic randomness, and AI decisions.
- `apps/web` is the standalone React client. It presents API state and legal
  actions but does not reimplement game rules.
- PostgreSQL is durable state. Redis is limited to queues, cache, sessions,
  locks, and other transient coordination.
- Preserve future seams for multiple human seats, rulesets, and maps without
  implementing those deferred features in the MVP.

## Commands

Run commands from the repository root unless noted otherwise.

- Laravel development: `cd apps/api && composer run dev`
- Laravel tests: `cd apps/api && composer test`
- Laravel formatting: `cd apps/api && vendor/bin/pint`
- Go engine tests: `cd services/game-engine && go test ./...`
- Go engine API: `cd services/game-engine && go run ./cmd/game-engine`
  (listens on `127.0.0.1:8080`; stateless, with no database or Redis dependency)
- React development: `cd apps/web && npm run dev`
- React lint: `cd apps/web && npm run lint`
- React build: `cd apps/web && npm run build`
- React browser tests: `cd apps/web && npm run test:e2e` (install the managed
  Chromium binary first with `cd apps/web && npx playwright install chromium`)
- React preview: `cd apps/web && npm run preview`
- Docker development stack: `docker compose -f compose.yaml -f compose.dev.yaml up -d`
- Docker stable image-based stack: `docker compose up --build -d`
- Development Compose smoke test: `COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-smoke.sh`
- Stable Compose smoke test: `scripts/compose-smoke.sh`

There is no root-level combined Verify command yet. CI is not configured yet.

The development Compose workflow mounts Laravel, React, and Go source code, so
ordinary PHP and React edits do not require image rebuilds. Restart the Go
engine after Go edits:

`docker compose -f compose.yaml -f compose.dev.yaml restart engine`

Refresh the container-managed dependency volumes after lockfile changes:

- Composer: `docker compose -f compose.yaml -f compose.dev.yaml run --rm api composer install`
- npm: `docker compose -f compose.yaml -f compose.dev.yaml run --rm web npm ci`

Rebuild the affected development image after Dockerfile or base-image changes.
The stable image-based workflow requires rebuilds after source, dependency,
Dockerfile, or base-image changes. `APP_PORT`, `WEB_PORT`, and `ENGINE_PORT`
override the published host ports; internal service names and ports stay the
same.

## Working conventions

- Follow `blueprint/context/coding-standards.md`.
- Work from the active spec in `blueprint/context/current-feature.md`.
- Keep changes inside the component that owns the behavior. Cross-service
  contracts must be explicit and versioned.
- Do not duplicate Go game rules in Laravel or React.
- Treat all game records and seat-private state as owner-scoped data.
- Do not add dependencies, services, or deployment infrastructure without an
  approved slice.
- Do not create commits during ordinary work. The Blueprint `/complete`
  workflow owns the feature-level commit and requires its documented checks.
