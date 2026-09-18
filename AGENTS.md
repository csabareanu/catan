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
- React development: `cd apps/web && npm run dev`
- React lint: `cd apps/web && npm run lint`
- React build: `cd apps/web && npm run build`
- React browser tests: `cd apps/web && npm run test:e2e` (install the managed
  Chromium binary first with `cd apps/web && npx playwright install chromium`)
- React preview: `cd apps/web && npm run preview`

There is no root-level combined Verify command yet. Docker Compose and CI are
also not configured yet. The Go module currently contains domain packages and
tests; its HTTP service entrypoint is planned for a later step.

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
