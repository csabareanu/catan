<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_registers_a_user_and_returns_201_with_a_bearer_token(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Ada Player',
            'email' => 'ada@example.test',
            'password' => 'correct-horse-battery-staple',
            'password_confirmation' => 'correct-horse-battery-staple',
        ]);

        $response->assertCreated();

        $token = $response->json('data.token');
        $user = User::query()->where('email', 'ada@example.test')->firstOrFail();

        $this->assertIsString($token);
        $this->assertNotSame('', $token);
        $response->assertExactJson([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => 'Ada Player',
                    'email' => 'ada@example.test',
                    'created_at' => $user->created_at->toISOString(),
                ],
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ]);
        $this->assertTrue(Hash::check('correct-horse-battery-staple', $user->password));
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => 'api-client',
        ]);
    }

    public function test_registration_rejects_malformed_input_with_422_without_creating_records(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => str_repeat('a', 121),
            'email' => 'not-an-email',
            'password' => 'short',
            'password_confirmation' => 'different',
            'token_name' => str_repeat('t', 81),
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', 'The registration request is invalid.')
            ->assertJsonStructure([
                'error' => [
                    'fields' => ['name', 'email', 'password', 'token_name'],
                ],
            ]);
        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_registration_rejects_duplicate_email_with_422_without_issuing_a_token(): void
    {
        User::factory()->create(['email' => 'ada@example.test']);

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Another Player',
            'email' => 'ada@example.test',
            'password' => 'correct-horse-battery-staple',
            'password_confirmation' => 'correct-horse-battery-staple',
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.fields.email.0', 'The email has already been taken.');
        $this->assertDatabaseCount('users', 1);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_returns_200_with_a_named_token_that_can_access_the_current_user(): void
    {
        $user = User::factory()->create([
            'name' => 'Ada Player',
            'email' => 'ada@example.test',
            'password' => 'correct-horse-battery-staple',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'ada@example.test',
            'password' => 'correct-horse-battery-staple',
            'token_name' => 'browser-client',
        ]);

        $response->assertOk();

        $token = $response->json('data.token');
        $response->assertExactJson([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => 'Ada Player',
                    'email' => 'ada@example.test',
                    'created_at' => $user->created_at->toISOString(),
                ],
                'token' => $token,
                'token_type' => 'Bearer',
            ],
        ]);
        $this->assertIsString($token);
        $this->assertNotSame('', $token);
        $this->assertDatabaseCount('personal_access_tokens', 1);
        $this->assertDatabaseHas('personal_access_tokens', [
            'tokenable_type' => User::class,
            'tokenable_id' => $user->id,
            'name' => 'browser-client',
        ]);

        $this->withToken($token)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'user' => [
                        'id' => $user->id,
                        'name' => 'Ada Player',
                        'email' => 'ada@example.test',
                        'created_at' => $user->created_at->toISOString(),
                    ],
                ],
            ]);
    }

    public function test_login_returns_401_for_a_wrong_password_without_leaking_user_data(): void
    {
        User::factory()->create([
            'email' => 'ada@example.test',
            'password' => 'correct-horse-battery-staple',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'ada@example.test',
            'password' => 'wrong-password',
        ]);

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'invalid_credentials',
                'message' => 'The provided credentials are invalid.',
            ],
        ]);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_returns_401_for_an_unknown_email_with_the_same_generic_error(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'unknown@example.test',
            'password' => 'wrong-password',
        ]);

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'invalid_credentials',
                'message' => 'The provided credentials are invalid.',
            ],
        ]);
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_returns_200_with_the_authenticated_user_for_a_valid_sanctum_token(): void
    {
        $user = User::factory()->create([
            'name' => 'Ada Player',
            'email' => 'ada@example.test',
        ]);
        $token = $user->createToken('test-client')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/auth/me');

        $response->assertOk()->assertExactJson([
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => 'Ada Player',
                    'email' => 'ada@example.test',
                    'created_at' => $user->created_at->toISOString(),
                ],
            ],
        ]);
    }

    public function test_returns_401_json_error_when_no_token_is_provided(): void
    {
        $response = $this->get('/api/v1/auth/me');

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
    }

    public function test_returns_401_json_error_for_an_invalid_bearer_token(): void
    {
        $response = $this->withToken('not-a-real-token')->get('/api/v1/auth/me');

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
    }

    public function test_logout_revokes_only_the_current_bearer_token(): void
    {
        $user = User::factory()->create([
            'name' => 'Ada Player',
            'email' => 'ada@example.test',
        ]);
        $currentToken = $user->createToken('current-client')->plainTextToken;
        $otherToken = $user->createToken('other-client')->plainTextToken;

        $response = $this->withToken($currentToken)->postJson('/api/v1/auth/logout');

        $response->assertNoContent();
        $this->assertDatabaseCount('personal_access_tokens', 1);
        Auth::forgetGuards();
        $this->withToken($currentToken)->getJson('/api/v1/auth/me')
            ->assertUnauthorized()
            ->assertExactJson([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Authentication is required.',
                ],
            ]);
        Auth::forgetGuards();
        $this->withToken($otherToken)->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.user.email', 'ada@example.test');
    }

    public function test_logout_requires_authentication(): void
    {
        $response = $this->post('/api/v1/auth/logout');

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
    }

    public function test_scaffold_user_route_is_not_available(): void
    {
        $this->getJson('/api/user')->assertNotFound();
    }
}
