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

There are two local workflows. Run these commands from the repository root.

### Development workflow

Use the development override while editing source code. It layers source mounts
and reload-friendly Laravel worker behavior on top of `compose.yaml`:

```bash
# Optional: create a local Compose environment file. Do this once.
cp compose.env.example .env

docker compose -f compose.yaml -f compose.dev.yaml up -d
docker compose -f compose.yaml -f compose.dev.yaml ps
```

In the development workflow, PHP and React source edits do not require an image
rebuild. The API and worker use the mounted Laravel source with PHP dependencies
and writable runtime folders in Docker-managed volumes. Vite uses the mounted
React source with polling for reliable Docker Desktop and WSL file updates. Go
source edits use the mounted engine source and take effect after restarting only
the engine:

```bash
docker compose -f compose.yaml -f compose.dev.yaml restart engine
```

When `composer.lock` changes, refresh the API dependency volume. When
`package-lock.json` changes, refresh the web dependency volume:

```bash
docker compose -f compose.yaml -f compose.dev.yaml run --rm api composer install
docker compose -f compose.yaml -f compose.dev.yaml run --rm web npm ci
```

After changing a service Dockerfile or its base image, rebuild the affected
development image:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build -d api worker engine web
```

### Stable image-based workflow

Use the base Compose file when you want to verify the image-based runtime. This
is the stable, production-like local workflow:

```bash
docker compose up --build -d
docker compose ps
```

The base workflow copies source into images, so source, dependency, Dockerfile,
or base-image changes require rebuilding the affected image. The development
engine uses a separate `<project>-engine-dev:local` image; the stable engine uses
`<project>-engine:latest`, where `<project>` is the Compose project name.

To switch from development back to stable, rebuild the stable images so they
include the current source, then switch back to development when needed:

```bash
# Development to stable
docker compose up --build -d

# Stable to development
docker compose -f compose.yaml -f compose.dev.yaml up -d
```

If the stable images already match the current source, `docker compose up -d`
is enough. When upgrading from the earlier development workflow that shared
the engine image tag, use `docker compose up --build -d` once to restore the
stable engine image. Switching workflows keeps the existing PostgreSQL volume.

This repository does not yet define a public production deployment or a
production-specific Compose file. The stable workflow is for local, image-based
verification and is not a production deployment configuration.

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

In the development workflow, PostgreSQL is also bound to 127.0.0.1 on the host
port configured by POSTGRES_HOST_PORT, which defaults to 5432. Use 127.0.0.1
as the database host from DBeaver, pgAdmin, or another local database client.
The database name, username, and password come from DB_DATABASE, DB_USERNAME,
and DB_PASSWORD in the root Compose environment file.

Redis remains available only on the private Compose network. PostgreSQL also
remains private in the stable image-based workflow. The API reaches them at
`postgres:5432` and `redis:6379`. The engine is available to
the API at `engine:8080`.

Useful diagnostics:

```bash
# Development workflow
docker compose -f compose.yaml -f compose.dev.yaml ps
docker compose -f compose.yaml -f compose.dev.yaml logs -f api worker engine
docker compose -f compose.yaml -f compose.dev.yaml exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# Stable image-based workflow
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

To verify the real browser observer against the running Compose stack, use the
separate opt-in smoke command:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright \
  scripts/compose-observer-smoke.sh
```

This command reuses the Compose lifecycle smoke, opens the actual web service
with Playwright without API response interception, checks the authenticated
observer's running status and full board, then deletes the disposable game and
revokes its bearer token. The disposable account record remains because the
API has no account-deletion endpoint. The command is separate from
`cd apps/web && npm run test:e2e`, which remains the fast API-mocked browser
suite.

For the mounted development workflow, select both Compose files:

```bash
COMPOSE_FILE=compose.yaml:compose.dev.yaml \
  PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright \
  scripts/compose-observer-smoke.sh
```

The smoke script defaults to the stable image-based Compose file. To validate
the mounted development workflow, select both files explicitly:

```bash
COMPOSE_FILE=compose.yaml:compose.dev.yaml scripts/compose-smoke.sh
```

If you changed the published API port, pass the same value to the smoke
command and the API base URL, for example:

```bash
APP_PORT=18000 WEB_PORT=15173 ENGINE_PORT=18080 \
  docker compose -f compose.yaml -f compose.dev.yaml up -d
COMPOSE_FILE=compose.yaml:compose.dev.yaml \
  APP_PORT=18000 API_BASE_URL=http://127.0.0.1:18000 \
  scripts/compose-smoke.sh
```

`APP_PORT`, `WEB_PORT`, and `ENGINE_PORT` change the published host ports only;
service-to-service addresses remain `api:8000`, `web:5173`, and `engine:8080`.

For the stable image-based workflow, rebuild the affected image after source,
dependency, Dockerfile, or base-image changes:

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
