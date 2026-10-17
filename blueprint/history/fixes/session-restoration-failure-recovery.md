# Session restoration failure recovery

**Type:** Fix

**Fixes:** F-24

**Status:** complete

## The problem

The public landing route (`/`) and board preview route (`/preview`) used the
presence of a browser token as `isRestoringSession`. When `/api/v1/auth/me`
failed with a temporary 503 or network error, `App` kept the token and recorded
an anonymous recovery message, but both public headers continued to show
`Restoring session`. Their Sign in and Create account actions stayed hidden,
and the landing screen did not show why restoration failed. An expired 401
needed to continue clearing the token and returning to the normal anonymous
state.

## The fix

- Track the actual session request state for the shared public header instead
  of treating any stored token as an in-progress request.
- Keep a valid stored token after a 503 or network failure, but stop the
  progress indicator, show a concise recovery message on `/` and `/preview`,
  and restore the public account actions so the visitor can continue.
- Preserve the existing successful restoration flow and 401 handling, including
  clearing expired credentials and showing the authenticated header only after
  `/api/v1/auth/me` succeeds.
- Keep the change in the React session and public-screen boundary. No API,
  Laravel authentication, or game data behavior changed.

## Build steps

### 1. [x] Separate restoration progress from token presence

Update the session state passed to the shared public header and the landing and
preview screens. Add focused browser coverage for pending restoration,
successful restoration, expired credentials, 503 responses, and network
failures on both public routes.

*Done when:* a pending request shows `Restoring session`; a successful request
shows the authenticated header; a 401 clears the token and restores Sign in and
Create account; and a 503 or network failure keeps the token available for
recovery but shows public account actions plus an accessible recovery message
instead of leaving the header stuck in progress.

## Verify

- `cd apps/web && npm run lint`
- `cd apps/web && npm run build`
- `cd apps/web && PLAYWRIGHT_BROWSERS_PATH=/tmp/catan-ms-playwright npm run test:e2e -- e2e/session-routes.spec.ts e2e/site-header.spec.ts --workers=3`
- `git diff --check`
- Manual Chromium checks on `/` and `/preview` with pending, successful, 401,
  503, and network-failure responses at desktop and mobile sizes.

## Implementation review

Implemented on `fix/session-restoration-failure-recovery` and approved by the
user on 2026-10-18.

- `App` initializes a stored-token session as `checking` and passes that state
  to the public header. A completed temporary failure becomes `anonymous`
  without discarding the token.
- The landing and preview screens expose the recovery message as an accessible
  alert and restore public account actions after 503 or network failures.
- Browser coverage proves pending, successful, expired, temporary HTTP failure,
  and network-failure behavior on both public routes.
- Lint, production build, focused browser tests (11/11), manual Chromium
  checks, and `git diff --check` passed.

## Completion

Completed on 2026-10-18 after `/audit F-24` re-reviewed the committed repair.
The original defect was gone, no new issue was found in the reviewed scope, and
F-24 was closed in the findings ledger.

**How to try it:** Open `/` or `/preview` with a stored session token. If the
`/api/v1/auth/me` request is temporarily unavailable, the header should show
Sign in and Create account, the page should show the recovery message, and the
token should remain available for a later retry. An expired token should clear
and return to the normal public header.

## Findings

### session-restoration-failure-recovery/F-24 [P2] closed - Public header keeps restoring a session after the account check fails

**File:** `apps/web/src/features/board/BoardLandingScreen.tsx:32`

**Found:** 2026-10-17 by `/audit` (scope: F-14 current change and shared
header)

**Why it mattered:** The landing passed token presence as
`isRestoringSession`. After `/api/v1/auth/me` returned 503, `App` set the
session to anonymous with a recovery message but retained the token, so the
header stayed in progress and hid the account actions. The landing did not show
the failure message, and `/preview` had the same behavior.

**Suggested fix:** Derive restoration progress from actual session state, stop
the progress status after failure, expose account or retry recovery, retain the
token during a temporary outage, and cover pending, successful, 401, 503, and
network-failure states on both public routes.

**Resolution:** Repaired on 2026-10-18 on
`fix/session-restoration-failure-recovery`. The public header now receives
restoration progress from session state. Temporary failures restore public
account actions and show a recovery message while retaining the token; 401
clears it. Focused browser coverage and the audit confirmed the behavior, and
the finding was closed.
