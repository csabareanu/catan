# Fix: Add authentication request throttling

**Type:** Fix
**Fixes:** F-04
**Status:** complete

## The problem

The public registration and login endpoints in `apps/api/routes/api.php` have
no request throttling. Automated password guessing and high-volume account or
token creation can therefore reach the Laravel application without an
application-level request bound.

## The fix

- Register named Laravel rate limiters for login and registration in the
  existing application provider.
- Limit login to five attempts per minute by the normalized email address and
  client IP, so one account's failures do not throttle a different account
  from the same address.
- Limit registration to three attempts per minute by client IP to bound
  account and token creation from one address.
- Apply the named limiters only to the public login and registration routes.
- Return HTTP 429 with this stable API error shape and a `Retry-After` header:
  `{"error":{"code":"rate_limited","message":"Too many authentication attempts. Please try again later."}}`.
  Preserve the existing validation, successful authentication, and token
  behavior.

## Build steps

- [x] **Add and test the authentication limiters** - define the two named
  limiters, attach them to the routes, and add focused feature coverage for
  the limit, stable JSON response, retry window expiry, and independent login
  keys.
  *Done when:* repeated login and registration requests receive HTTP 429 with
  the documented JSON error after the configured limit; advancing the test
  clock permits a new request; a different login email has an independent
  limit; existing authentication tests remain green; and Pint reports no
  formatting changes.

## Verify

- `cd apps/api && php artisan test --compact tests/Feature/AuthenticationTest.php`
- `cd apps/api && vendor/bin/pint --dirty --format agent`
- `cd apps/api && composer test`
- Manually send repeated requests to `/api/v1/auth/login` or
  `/api/v1/auth/register` and confirm the stable 429 JSON response and
  `Retry-After` header.

## Findings

### authentication-request-throttling/F-04 [P2] closed - Authentication endpoints have no request throttling

**File:** apps/api/routes/api.php:38
**Found:** 2026-10-14 by /audit (scope: full)
**Origin:** Pre-existing identity feature; not introduced by 3e.
**Why it matters:** Login and registration had no throttle middleware or
application rate limiter. Automated password guessing and high-volume account or
token creation could therefore reach the Laravel application without an
application-level request bound. This was a hardening gap in the existing
authentication boundary, rather than a claim that an account compromise
occurred.
**Suggested fix:** Add focused Laravel rate limiters for login and registration,
using suitable account/address keys, a stable JSON 429 response, and tests for
limits, expiry and independent users. Keep this a separate identity repair.
**Resolution:** 2026-10-14 repair approved and marked `fixed`. Added named
Laravel rate limiters for login and registration, keyed by normalized email and
IP for login and IP for registration. Both public routes now return a stable
HTTP 429 JSON error with rate-limit headers when their limits are exceeded.
Focused authentication tests cover the limits, expiry, independent login keys,
and existing successful and validation paths. The runtime probe returned five
401 responses followed by the documented 429 response with `Retry-After`.
The focused re-audit reviewed the provider, route middleware, and feature tests,
reran the full Laravel suite at 81 tests and 498 assertions, and confirmed the
live 429 response and headers. The original defect is gone and no new issue was
found in scope.
