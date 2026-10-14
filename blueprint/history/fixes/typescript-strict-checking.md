# Fix: Enable TypeScript strict checking

**Type:** Fix
**Fixes:** F-05
**Status:** complete

## The problem

The React application's TypeScript project configurations in
`apps/web/tsconfig.app.json` and `apps/web/tsconfig.node.json` do not enable
`strict`. The current build can therefore pass without enforcing strict null
checks, implicit-any checks, and the other strict compiler guarantees required
by the project's coding standards.

## The fix

- Add `"strict": true` to the compiler options in both TypeScript
  configurations.
- Preserve the existing bundler, no-emit, unused-code, and Vite settings.
- Keep the change limited to compiler enforcement. Do not add dependencies or
  change frontend behavior, API contracts, or runtime configuration.

## Build steps

- [x] **Enable strict compiler checks** - update both frontend TypeScript
  configurations and verify that the existing source compiles and lints with
  the stricter settings.
  *Done when:* both configs explicitly enable `strict`; `npm run build` and
  `npm run lint` pass; and no source or dependency changes are required beyond
  strictness-related corrections, if the compiler reports any.

## Verify

- `cd apps/web && npm run build`
- `cd apps/web && npm run lint`
- Inspect both `tsconfig.app.json` and `tsconfig.node.json` to confirm
  `compilerOptions.strict` is enabled.

## Findings

### typescript-strict-checking/F-05 [P2] closed - TypeScript strict checking is not enabled

**File:** apps/web/tsconfig.app.json:2
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Initial scaffold (`7056b90`), not introduced by 3e. Also affects
`apps/web/tsconfig.node.json`.
**Why it matters:** Neither compiler configuration enabled or inherited
`strict`. The effective configuration did not enforce strict null checks or
implicit-any checks, despite the project's coding standards requiring strict
TypeScript.
**Suggested fix:** Enable `strict: true` in both compiler configurations and run
the existing lint and build gates.
**Resolution:** Added `"strict": true` to both frontend TypeScript project
configurations. The existing source required no changes. The focused re-audit
confirmed effective `strict`, `strictNullChecks`, and `noImplicitAny`
settings for both projects, reran `npm run lint` and `npm run build`, found
no TypeScript suppression patterns, and found no new issue in scope.
