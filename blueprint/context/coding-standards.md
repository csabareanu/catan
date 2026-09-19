# Coding Standards

These conventions bind the Laravel API, Go engine, and standalone React client.
Prefer the established pattern in nearby code when it is more specific than
this document.

## Architecture

- Laravel owns users, authorization, game lifecycle, durable persistence,
  queues, and the public API.
- Go owns game rules, legal commands, deterministic state transitions, random
  decisions, and AI behavior.
- React renders API-provided state and submits commands. It may improve
  usability but must not become another rules engine.
- Cross-service HTTP/JSON contracts must be explicit, versioned, and tested at
  their boundaries.
- Keep the Go engine stateless. It must not connect directly to PostgreSQL or
  Redis.
- Do not add speculative plugin systems. Use clear ruleset and map seams only
  where current behavior needs them.

## PHP and Laravel

- Follow the conventions in `apps/api/AGENTS.md` and activate its relevant
  Laravel Boost skills before changing Laravel code.
- Use PHP 8.3 language features and declare parameter and return types.
- Create framework files with the appropriate non-interactive `artisan make:`
  command when available.
- Use Form Requests for non-trivial validation, policies for ownership and
  authorization, API Resources for JSON representation, and Eloquent for
  persistence.
- Keep controllers focused on HTTP concerns. Put orchestration in clearly named
  actions, jobs, or services when it has an independent responsibility.
- Never implement gameplay legality in Laravel. Laravel validates transport and
  authorization before asking the Go engine for a canonical transition.
- Read environment values only from configuration files. Application code uses
  `config()`.
- Run `vendor/bin/pint --dirty --format agent` after modifying PHP files.

## Go

- Keep the domain model independent of HTTP, storage, and presentation.
- Prefer small packages organized by domain responsibility rather than generic
  utility packages.
- Accept randomness through explicit deterministic inputs. A seed and the same
  commands must reproduce the same state and events.
- Model a command as an attempted state transition. Return the resulting state
  and ordered domain events without mutating shared global state.
- Return errors with useful context and use `errors.Is` or `errors.As` when
  callers need to distinguish them.
- Format changed Go code with `gofmt`. Once the first package exists, keep
  `go test ./...` green.

## TypeScript and React

- Keep TypeScript strict and avoid `any`; use `unknown` at untrusted boundaries
  and narrow it deliberately.
- Use functional components and hooks. Keep components focused and extract
  reusable stateful behavior into hooks when reuse is real.
- Define explicit types for API contracts, game state, commands, and component
  props. Do not infer domain contracts from rendered UI.
- Treat server data as authoritative. Optimistic UI must reconcile with the
  accepted state returned by the API.
- Keep seat-private data out of shared client models and UI paths.
- Components use PascalCase, functions and variables use camelCase, and shared
  constants use SCREAMING_SNAKE_CASE when a constant is warranted.

## Frontend structure and styling

- Feature-specific components and hooks should live together under a clear
  feature directory once the scaffold grows beyond its initial files.
- The board is SVG-based and driven by API coordinates and topology, not fixed
  screen positions.
- Keep visual state separate from canonical game state so animation and replay
  do not change game rules.
- Do not add a router, server-state library, component system, or animation
  library until a planned slice establishes the requirement.
- The visual theme and styling approach remain a frontend prototyping decision.

## Data, API, and errors

- PostgreSQL is authoritative for users, games, snapshots, commands, events,
  and results. Redis data must be disposable and reconstructible.
- Scope every user-owned game query through the authenticated user or an
  equivalent authorization policy. Never trust a client-supplied owner ID.
- Preserve ordered commands and events needed for deterministic inspection and
  replay.
- API errors use a consistent JSON shape and appropriate HTTP status codes.
  Do not leak stack traces, secrets, private cards, or other seats' resources.
- Queue jobs must be safe to retry. Persist idempotency and lifecycle state in
  PostgreSQL rather than relying on Redis delivery semantics.

## Testing and verification

Testing is bound to each component because no root Verify command exists yet.
Run focused checks first, then the narrowest broader checks relevant to the
slice.

- Laravel uses PHPUnit. Logic-bearing Laravel changes require focused feature or
  unit coverage and `cd apps/api && composer test` as the API gate.
- Go uses the standard test runner. Every logic-bearing package must include
  focused tests; engine rules, deterministic behavior, and AI decisions require
  coverage through `cd services/game-engine && go test ./...`.
- React uses `npm run lint`, `npm run build`, and Playwright browser tests via
  `npm run test:e2e` for UI changes. Install the managed Chromium binary with
  `npx playwright install chromium` when setting up a development environment.
- Cross-service changes require contract or integration evidence on both sides
  of the boundary.
- An empty test suite is not evidence that newly added logic works.

## Browser verification

Use real browser evidence for flows that click, type, navigate, render the SVG
board, animate events, or depend on client-side state. Keep browser tests
focused on user-visible behavior and use Playwright's managed Chromium.

## Code quality and comments

- Prefer descriptive names, small focused functions, and explicit boundaries.
- Do not perform broad opportunistic refactors or add unused abstractions.
- Remove unused imports, variables, exports, and commented-out code.
- Comment why a non-obvious decision exists, not what the code already says.
- Keep public documentation concise and update it when commands or architecture
  boundaries change.

## Writing

- Use direct language and real Markdown structure.
- Do not use em dashes, en dashes, or the ellipsis character in generated
  documentation, comments, specifications, or commit messages.
