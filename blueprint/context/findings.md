# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

## Audit evidence - 2026-10-14

- **Requested scope:** full, on `feature/fast-local-development-workflow` at
  `cdaa047`, including completed Features 1-3 and the current 3e implementation.
  This was a fresh review, not a review limited to existing ledger entries.
- **Coverage:** partial overall. Reviewed Laravel application code, API routes,
  resources, requests, models, migrations, factories, tests and configuration;
  Go domain, HTTP and executable packages and tests; React source, API guards,
  renderer, browser tests and compiler/lint configuration; Dockerfiles, both
  Compose files, smoke script and workflow documentation. Browser rendering
  could not be observed because the managed Chromium executable is absent.
  CSS was inspected structurally; this pass does not establish visual correctness.
- **Excluded:** `apps/api/vendor/`, both applications' `node_modules/`,
  `apps/web/dist/`, `apps/api/public/build/`, `services/game-engine/bin/`,
  storage and bootstrap runtime caches, PHPUnit/Playwright/coverage output,
  generated dependency lockfile contents, local `.env` contents, binary/minified
  assets, Git internals and linked third-party skills. `knowledge-review/` is
  unrelated local review material and was excluded. Existing planning changes
  and the untracked API lockfile were left untouched.
- **Standards:** root and API `AGENTS.md`, `coding-standards.md`, project
  overview, active 3e spec, and archived 3b/3c contracts. Checked component
  ownership, owner scoping, deterministic execution, durable idempotency,
  versioned transport, safe errors, testing and strict TypeScript.
- **Passing commands:** `composer test` (75 tests, 426 assertions),
  `GOCACHE=/tmp/catan-go-cache GOPROXY=off GOTOOLCHAIN=local go test ./...`,
  the same Go command with `-race -count=1`, `npm run lint`, `npm run build`,
  both Compose `config --quiet` variants, `bash -n scripts/compose-smoke.sh`,
  and `git diff --check`.
- **Additional evidence:** isolated PHP probes used SQLite `:memory:`, array
  cache/session drivers and fake dispatch/engine responses. No existing game
  data was changed. Read-only image inspection and a Compose dry run confirmed
  F-02. Effective TypeScript configuration and an in-memory compiler check
  confirmed F-05; enabling strict options in that check produced zero errors.
- **Runtime evidence:** all six development services healthy; API `/up`, engine
  `/healthz` and web root respond successfully. Stateless board requests through
  Go, Laravel and the Vite proxy returned identical data with 19 hexes, 54
  vertices, 72 edges and 9 ports. Read-only PostgreSQL inspection found four
  bootstrap commands, four initial snapshots and four sequence-1 events; these
  aggregate counts are not concurrency or retry-failure proof.
- **Missing signals:** `npm run test:e2e` failed to launch all six tests because
  Playwright's managed Chromium headless shell is missing. No browser was
  installed. ShellCheck is unavailable. No network-backed dependency/security
  scanners were run. The Compose smoke script was inspected, not rerun, because
  it creates persistent users and games. No live Redis failure, PostgreSQL
  concurrency or real workflow-switch test was performed. No source formatting
  command was run because the audit does not edit source.
- **Test hygiene:** no skipped, focused or explicitly disabled tests found in
  project test sources. `apps/api/tests/Unit/ExampleTest.php` contains the
  scaffold assertion `assertTrue(true)`; it provides no application coverage.
  The separate feature ExampleTest checks the scaffold root page.

### F-04 [P2] open - Authentication endpoints have no request throttling

**File:** apps/api/routes/api.php:38
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Pre-existing identity feature; not introduced by 3e.
**Why it matters:** Login and registration have no throttle middleware or
application rate limiter. Resolved route middleware confirms only binding
substitution on those public routes. An isolated HTTP-kernel probe sent 65
invalid logins for the same account/address; all returned 401 and none were
limited. Password checking therefore has no application-level bound against
automated guessing, and registration has no request bound on account/token
creation. This is a hardening gap in the existing authentication boundary,
rather than a claim that an account compromise occurred.
**Suggested fix:** Add focused Laravel rate limiters for login and registration,
using suitable account/address keys, a stable JSON 429 response, and tests for
limits, expiry and independent users. Keep this a separate identity repair.
**Resolution:** Not repaired during this read-only audit.

### F-05 [P2] open - TypeScript strict checking is not enabled

**File:** apps/web/tsconfig.app.json:2
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Initial scaffold (`7056b90`), not introduced by 3e. Also affects
`apps/web/tsconfig.node.json`.
**Why it matters:** Neither compiler configuration enables or inherits `strict`.
The effective configuration has strict mode, strict null checks and implicit-any
checks disabled, despite `coding-standards.md` explicitly requiring strict
TypeScript. The passing build consequently does not enforce those guarantees
as the client grows. An in-memory compiler probe enabled strict mode for both
projects and reported zero diagnostics, so no current compile failure is claimed.
**Suggested fix:** Enable `strict: true` in both compiler configurations and run
the existing lint/build gates. No new dependency or speculative refactor is needed.
**Resolution:** Not repaired during this read-only audit.
