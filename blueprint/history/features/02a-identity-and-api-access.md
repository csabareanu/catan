# Feature: Identity and API access

**From build-plan:** feature 2a, under feature 2
**Status:** complete

## Goal

Provide the authenticated API boundary for Catan. A user can register, log in
with credentials, receive a Laravel Sanctum bearer token, inspect the current
user, and revoke the token used for the current request. This establishes the
identity and authorization contract needed by the private game features without
starting gameplay or persistence beyond the existing user and token tables.

## In scope

- Versioned JSON endpoints for registration, login, current-user inspection, and
  current-token logout.
- User validation for display name, email, password, and password confirmation.
- Sanctum personal access tokens for API clients.
- Owner identity represented by the authenticated `User` model.
- Stable success and error response shapes, including unauthenticated requests.
- Focused Laravel feature tests using the existing PHPUnit setup.

## Out of scope

- Game, game-seat, board, command, event, snapshot, or queue persistence.
- Creating or running games; those belong to features 2b and 3 onward.
- Browser register/login screens or a React auth state manager. This slice is
  API-first.
- Email verification, password reset, password change, social login, MFA, roles,
  administrator access, and account deletion.
- Token listing, naming management, rotation, scopes, or a custom expiration
  policy. Tokens follow the installed Sanctum configuration and the client may
  provide a bounded token name when issuing one.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff, not full files. The user reads and understands it.
4. The user approves the step, then chooses whether to create an optional
   checkpoint commit. `/complete` creates the feature-level commit later.

## Build steps

- [x] **Step 1 - Enable the Sanctum identity boundary** - make the existing
  `User` model issue Sanctum tokens, add the protected versioned `me` route, and
  define the public user and error serializers. *Done when:* a focused test
  proves a factory-issued token resolves its user through `/api/v1/auth/me`,
  while an unauthenticated request returns the documented JSON error shape.
- [x] **Step 2 - Add registration** - add the versioned registration request,
  controller/action, validation, token issuance, and safe user response.
  *Done when:* a valid request creates one user with a hashed password and one
  token, returns HTTP 201 with the documented response, and malformed or
  duplicate input returns HTTP 422 without issuing a token.
- [x] **Step 3 - Add login** - authenticate valid credentials, issue a named
  bearer token, and reject invalid credentials safely. *Done when:* valid login
  returns HTTP 200 and a usable token, invalid credentials return HTTP 401
  without revealing which field failed, and the returned token can access the
  protected `me` route without exposing sensitive user fields.
- [x] **Step 4 - Add current-token logout and harden the contract** - revoke
  only the bearer token used by the request, normalize authentication failures,
  remove the scaffold-only unversioned `/api/user` route, and run the API gate.
  *Done when:* logout returns HTTP 204, the same token cannot access `me`
  afterward, other tokens for the user remain valid, and the focused plus full
  Laravel test suites pass.

## Files / areas

- `apps/api/app/Models/User.php` for `HasApiTokens` and identity behavior.
- `apps/api/app/Http/Controllers/Api/V1/Auth/` for auth actions.
- `apps/api/app/Http/Requests/Api/V1/Auth/` for registration and login input
  validation.
- `apps/api/app/Http/Resources/Api/V1/Auth/` or an equivalent explicit response
  layer for the public user and token envelopes.
- `apps/api/routes/api.php` for `/api/v1/auth/*` routes and Sanctum middleware.
- `apps/api/bootstrap/app.php` or the API exception boundary for consistent
  unauthenticated JSON responses.
- `apps/api/tests/Feature/AuthenticationTest.php` and related factories or test
  helpers when needed.
- Existing users and personal-access-token migrations are load-bearing and
  should be reused rather than duplicated.

## Data / contracts

### Routes

- `POST /api/v1/auth/register` accepts `name`, `email`, `password`,
  `password_confirmation`, and optional bounded `token_name`. It returns HTTP
  201.
- `POST /api/v1/auth/login` accepts `email`, `password`, and optional bounded
  `token_name`. It returns HTTP 200.
- `GET /api/v1/auth/me` requires `Authorization: Bearer <token>` and returns
  HTTP 200.
- `POST /api/v1/auth/logout` requires the same bearer header, revokes only the
  current token, and returns HTTP 204.

Registration validates `name` as a required string with a maximum length of 120,
`email` as a required valid email with a maximum length of 255 and uniqueness,
`password` as a required string of at least 8 characters with confirmation, and
`token_name` as an optional string with a maximum length of 80. Login requires
the email and password and applies the same email and token-name bounds. When
omitted, `token_name` is `api-client`.

### Success envelopes

Registration and login return:

```json
{
  "data": {
    "user": {
      "id": 1,
      "name": "Ada Player",
      "email": "ada@example.test",
      "created_at": "2026-09-20T12:00:00.000000Z"
    },
    "token": "<plaintext-token-only-in-this-response>",
    "token_type": "Bearer"
  }
}
```

The `me` endpoint returns the same `data.user` shape without a token. The
plaintext token is never returned by `me` or stored in the user record.

### Error envelopes

Validation failures use the established API shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The registration request is invalid.",
    "fields": {}
  }
}
```

Invalid credentials use HTTP 401 and a generic `invalid_credentials` code. A
missing, malformed, or revoked bearer token uses HTTP 401 and an
`unauthenticated` code. Neither response reveals whether an email exists or
whether a token was previously valid.

The existing `users` and `personal_access_tokens` migrations are the storage
contract. Sanctum stores only a hash of the issued token; the plaintext is
available once, in the issue response. Token abilities are not client-selected
in this slice.

## Testing

- Use PHPUnit feature tests with database refresh isolation and the existing
  `UserFactory`.
- Cover successful registration, password hashing, duplicate and malformed
  registration, successful login, invalid credentials, current-user access,
  hidden sensitive fields, missing or invalid bearer tokens, current-token
  logout, and preservation of a second token.
- Assert status codes, stable JSON envelopes, token persistence, and token
  revocation rather than implementation details.
- Run the focused authentication test first, then `cd apps/api && composer test`.
- No browser test is required because this slice adds no React UI.

## Notes for the AI

- Laravel owns identity, authentication, authorization, and this public API;
  Go must not be involved.
- Follow `apps/api/AGENTS.md`, use Laravel Boost guidance, inspect the installed
  Sanctum version before coding, and use Form Requests, API Resources, and
  explicit policies or middleware where applicable.
- Do not trust a client-supplied user or owner ID. Later game queries must use
  the authenticated user supplied by Sanctum.
- Keep controllers focused on HTTP concerns and avoid adding gameplay logic.
- Use PHP 8.3 types, the existing API error conventions, and run Pint on changed
  PHP files.
- Do not add a new migration unless inspection proves the existing user or
  Sanctum schema is insufficient.
