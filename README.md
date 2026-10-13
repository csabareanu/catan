# Catan

A backend-heavy implementation of the Catan base game with a deterministic Go
rules engine, a Laravel API and orchestration layer, and a modern React client.

The MVP targets one authenticated human playing against two or three AI
opponents. The API remains independently operable, and the design keeps future
online multiplayer, rulesets, and alternate maps possible without building
them now.

## Repository layout

- `apps/api` - Laravel 13 API, authentication, persistence, and workers
- `apps/web` - React 19 and TypeScript browser application
- `services/game-engine` - stateless Go rules and simulation engine
- `blueprint` - product plans and the human-reviewed development workflow

## Commands

- Laravel development: `cd apps/api && composer run dev`
- Laravel tests: `cd apps/api && composer test`
- Laravel formatting: `cd apps/api && vendor/bin/pint`
- Go engine tests: `cd services/game-engine && go test ./...`
- Go engine API: `cd services/game-engine && go run ./cmd/game-engine`
- React development: `cd apps/web && npm run dev`
- React lint: `cd apps/web && npm run lint`
- React build: `cd apps/web && npm run build`
- React preview: `cd apps/web && npm run preview`

## Local Docker Compose stack

The complete local stack runs the API, queue worker, Go engine, PostgreSQL,
Redis, and React/Vite development server in containers. Docker Compose is the
only host dependency for the backend stack. You do not need host-installed PHP,
Go, PostgreSQL, or Redis.

Run these commands from the repository root:

```bash
# Optional: create a local Compose override file. Do this once.
cp compose.env.example .env

docker compose up --build -d
docker compose ps
```

Compose reads the root `.env` for interpolation. If it is absent, the defaults
from `compose.yaml` are used. The root Compose `.env` is separate from
`apps/api/.env`, which is used when Laravel runs directly on the host.
You can also select a different Compose environment file explicitly, for
example `docker compose --env-file compose.env.example up --build -d`.

The default service URLs are:

- Web client: <http://localhost:5173>
- Laravel API: <http://localhost:8000>
- API health: <http://localhost:8000/up>
- Engine health: <http://localhost:8080/healthz>

PostgreSQL and Redis are intentionally available only on the private Compose
network. The API reaches them at `postgres:5432` and `redis:6379`. The engine
is available to the API at `engine:8080`.

Useful diagnostics:

```bash
docker compose ps
docker compose logs -f api worker engine
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

To prove the complete authenticated create and queued-start flow, first start
the stack and then run:

```bash
scripts/compose-smoke.sh
```

The smoke command requires Bash, curl, awk, and Docker Compose on the host. It
uses PHP inside the API container to parse responses, so host-installed PHP is
not required.

The smoke command waits for all six health checks, registers a unique
disposable user, creates a three-seat game, starts it twice, waits for the
worker to persist the bootstrap, and checks PostgreSQL for exactly one
`bootstrap.v1` command, its linked ordered events, and one initial snapshot.
It prints the healthy dependencies and the final running game id. It uses the
existing named PostgreSQL volume and never removes it.

If you changed the published API port, pass the same value to the smoke
command, for example `APP_PORT=18000 scripts/compose-smoke.sh`. The same
pattern applies to `WEB_PORT` and `ENGINE_PORT` when starting Compose.

After source or dependency changes, rebuild the affected image:

```bash
docker compose up --build -d api worker engine web
```

`docker compose down` stops the containers and removes the private network but
preserves the named `postgres-data` volume, so local game data remains. The
explicitly destructive `docker compose down -v` also deletes that named volume
and therefore resets the local PostgreSQL database. Use `down -v` only when a
deliberate database reset is intended.

## Licensing and CATAN intellectual property

Original code and documentation authored for this project are licensed under
MIT; see [LICENSE](LICENSE). Third-party code and assets remain under their
respective licenses and notices. The MIT license does not grant rights to
CATAN trademarks or CATAN-owned artwork, text, or other intellectual property.
This is an independent project, not an official CATAN product or one endorsed by
CATAN GmbH or CATAN Studio. See [CATAN's IP guidelines](https://www.catan.com/guidelines-dealing-intellectual-property-catan)
before using CATAN marks or materials; this notice does not grant permission to
use them.
