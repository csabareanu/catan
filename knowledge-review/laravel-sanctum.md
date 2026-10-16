# Laravel Sanctum

## Definition

Laravel Sanctum is Laravel's lightweight authentication package for first-party
SPAs, mobile clients, command-line tools, and simple API consumers. It supports
two related modes:

1. Stateful cookie authentication for a first-party browser application.
2. Personal access tokens sent as `Authorization: Bearer ...` for API clients.

Sanctum authenticates a request. It does not decide whether the authenticated
user is allowed to perform a particular action. Authorization still belongs to
policies, gates, middleware, or application code.

## Motivation

Many Laravel applications need browser authentication and API authentication,
but do not need to operate a complete OAuth2 authorization server or manage the
complexity of JWT validation. Sanctum provides Laravel-integrated authentication
with a small database-backed token model and familiar middleware.

## Problem It Solves

An API needs a reliable way to answer two questions:

1. Who is making this request?
2. Can the application safely associate this request with a user?

Sanctum answers both by validating the request's credentials and resolving the
authenticated user. The application then decides what that user may access
through authorization rules and ownership checks.

## How It Works

### Enabling token support

The authenticatable model uses Sanctum's `HasApiTokens` trait:

```php
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
}
```

The trait provides methods such as `createToken()`, `tokens()`, and
`currentAccessToken()`.

### Issuing a token

```php
$accessToken = $user->createToken('cli-client');
$plainTextToken = $accessToken->plainTextToken;
```

`createToken()` creates a row in `personal_access_tokens`. Sanctum stores a
hash of the secret, not the readable secret. The returned `plainTextToken` is
the bearer credential that should be shown to the client once.

The token name, such as `cli-client`, is only a human-readable label. It is not
the secret.

### Authenticating a request

The client sends the token in the HTTP header:

```http
Authorization: Bearer <token>
```

A route protected by `auth:sanctum` lets Sanctum inspect the request. If the
token is valid, Laravel resolves the associated user and makes it available as:

```php
$request->user();
```

If the token is missing, invalid, expired, or revoked, authentication fails.

### Revoking a token

The current token can be deleted:

```php
$request->user()->currentAccessToken()->delete();
```

That invalidates that token while leaving other tokens belonging to the same
user untouched.

### Token abilities

Tokens may be issued with abilities:

```php
$token = $user->createToken('reporting-client', ['reports:read']);
```

Ability middleware or checks can then restrict what that token may do. An
authenticated user and an authorized token are separate concerns.

## When To Use

- A Laravel application has a first-party SPA and needs browser authentication.
- A mobile, CLI, or external client needs a simple bearer-token API.
- The application owns the users and can persist token records in its database.
- Token revocation, token labels, or token abilities are useful.
- OAuth2 features such as delegated consent and third-party authorization are
  not required.

## When Not To Use

- A third-party identity provider should own user authentication.
- The product must act as a complete OAuth2 or OpenID Connect provider.
- A decentralized, stateless token format is required across many independent
  services and the tradeoffs of JWT are understood.
- The application cannot safely protect bearer tokens in the client or transport.

## Advantages

- First-party Laravel integration through guards, middleware, models, and
  migrations.
- Database-backed revocation is straightforward.
- The readable token is exposed only when it is issued.
- One package supports both SPA cookies and API bearer tokens.
- Simpler operational model than building OAuth2 or JWT infrastructure.
- Token abilities and expiration can be added when a product needs them.

## Disadvantages

- Bearer tokens behave like passwords: possession is usually enough to use them.
- Database lookup is normally required for token authentication.
- The application must protect, rotate, revoke, and avoid logging tokens.
- Sanctum is not a complete OAuth2 authorization server.
- Cookie-based SPA authentication requires correct CSRF and stateful-domain
  configuration.

## Tradeoffs

### Sanctum versus session authentication

Traditional sessions store a session identifier in a browser cookie. The server
keeps the session state. This is usually the simplest option for a server-rendered
Laravel application.

Sanctum bearer tokens are more convenient for CLI clients, mobile apps, and
independent API consumers. They are also easier to revoke individually, but the
client must protect the token.

### Sanctum versus JWT

JWTs carry signed claims and can often be verified without a database lookup.
That can help across independent services, but revocation, key rotation, token
size, and stale claims require more design.

Sanctum keeps the authoritative token record in the database, which makes
revocation and ownership simple at the cost of a lookup and database dependency.

### Sanctum versus OAuth2

OAuth2 is a protocol for delegated authorization, consent, scopes, clients, and
authorization servers. It is appropriate when other applications need to act on
behalf of users under explicit grants.

Sanctum is a better fit when the Laravel application owns the clients or only
needs personal access tokens.

### Sanctum versus API keys

An API key often identifies an application rather than a user. Sanctum tokens
are associated with a user and can have abilities, expiration, and individual
revocation.

## Practical Examples

Issue a token after registration or login:

```php
$token = $user->createToken('browser-client')->plainTextToken;

return response()->json([
    'data' => [
        'token' => $token,
        'token_type' => 'Bearer',
    ],
]);
```

Protect a route:

```php
Route::get('/me', CurrentUserController::class)
    ->middleware('auth:sanctum');
```

The controller can then trust the authenticated identity, but game ownership
must still be checked explicitly:

```php
$game = $request->user()->ownedGames()->findOrFail($gameId);
```

## Common Mistakes

- Confusing authentication with authorization.
- Returning the token hash or password in an API response.
- Logging the plaintext bearer token.
- Storing the plaintext token in the database or source code.
- Assuming `token_name` is a security credential.
- Returning different errors for an unknown email and a wrong password.
- Trusting a client-supplied `user_id` or `owner_id` instead of the authenticated
  user.
- Treating a bearer token as safe merely because it is not a JWT.
- Forgetting CSRF protection when using Sanctum's cookie-based SPA mode.
- Using Sanctum when the actual requirement is delegated OAuth2 authorization.

## Related Concepts

- Authentication
- Authorization
- Bearer tokens
- Session cookies
- Personal access tokens
- OAuth2
- OpenID Connect
- JSON Web Tokens (JWT)
- CSRF protection
- Laravel guards and middleware
- Password hashing

## References

- [Laravel Sanctum documentation](https://laravel.com/docs/sanctum)
- [Laravel authentication documentation](https://laravel.com/docs/authentication)
- [RFC 6750: OAuth 2.0 Bearer Token Usage](https://www.rfc-editor.org/rfc/rfc6750)

## Personal Insight

## Review Checklist

- [ ] Is this genuinely new knowledge?
- [ ] Do I already understand this concept?
- [ ] Is the explanation better than my existing note?
- [ ] Should this extend another note instead?
- [ ] Which notes should I connect?
- [ ] Should I split or merge any notes?
- [ ] What personal insight should I add?
- [ ] Do I agree with every statement?
