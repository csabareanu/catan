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
- React development: `cd apps/web && npm run dev`
- React lint: `cd apps/web && npm run lint`
- React build: `cd apps/web && npm run build`
- React preview: `cd apps/web && npm run preview`

A combined root development command, Docker Compose environment, and CI checks
have not been configured yet. The Go module also has no packages to test until
the first engine slice is implemented.

## Licensing and CATAN intellectual property

Original code and documentation authored for this project are licensed under
MIT; see [LICENSE](LICENSE). Third-party code and assets remain under their
respective licenses and notices. The MIT license does not grant rights to
CATAN trademarks or CATAN-owned artwork, text, or other intellectual property.
This is an independent project, not an official CATAN product or one endorsed by
CATAN GmbH or CATAN Studio. See [CATAN's IP guidelines](https://www.catan.com/guidelines-dealing-intellectual-property-catan)
before using CATAN marks or materials; this notice does not grant permission to
use them.
