<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\User;
use App\Services\GameCreationService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\TestCase;

class GameCreationTest extends TestCase
{
    use LazilyRefreshDatabase;

    private const string CREATION_KEY = 'd3423053-d195-4d96-a3b5-98025e5a3c4d';

    public function test_a_creation_retry_returns_the_existing_game_without_needing_the_engine(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);
        $first = $this->withToken($token)->postJson('/api/v1/games', $payload);
        $first->assertCreated()->assertJsonMissingPath('data.creation_key');
        $game = Game::query()->findOrFail($first->json('data.id'));
        $this->assertArrayNotHasKey('creation_key', $game->configuration);
        Http::assertSent(fn (ClientRequest $request): bool => $request->data() === [
            'seed' => $payload['seed'],
            'ruleset_key' => $payload['ruleset_key'],
            'map_key' => $payload['map_key'],
        ]);
        $game->update(['lifecycle_status' => 'running']);
        Http::fake(function (): never {
            throw new ConnectionException('connection refused');
        });

        $retry = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $retry->assertOk()
            ->assertJsonPath('data.id', $game->id)
            ->assertJsonPath('data.lifecycle_status', 'running')
            ->assertJsonPath('data.board', $first->json('data.board'))
            ->assertJsonPath('data.seats', $first->json('data.seats'))
            ->assertJsonMissingPath('data.creation_key');
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'owner_id' => $owner->id,
            'creation_key' => self::CREATION_KEY,
        ]);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
        Http::assertNothingSent();
    }

    #[TestWith(['seed', '123456789'])]
    #[TestWith(['ai_count', 3])]
    public function test_reusing_a_creation_key_with_changed_input_returns_409(string $field, string|int $value): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);
        $first = $this->withToken($token)->postJson('/api/v1/games', $payload);
        $first->assertCreated();

        $response = $this->withToken($token)->postJson('/api/v1/games', [
            ...$payload,
            $field => $value,
        ]);

        $response->assertConflict()->assertExactJson([
            'error' => [
                'code' => 'game_creation_key_conflict',
                'message' => 'The creation key has already been used for a different game configuration.',
            ],
        ]);
        $this->assertDatabaseHas('games', [
            'id' => $first->json('data.id'),
            'seed' => $payload['seed'],
            'seat_count' => 3,
        ]);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
        Http::assertSentCount(1);
    }

    public function test_a_creation_key_is_scoped_to_the_authenticated_owner(): void
    {
        $owner = User::factory()->create();
        $otherOwner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $otherToken = $otherOwner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);
        $first = $this->withToken($token)->postJson('/api/v1/games', $payload);
        $first->assertCreated();
        $this->app['auth']->forgetGuards();

        $second = $this->withToken($otherToken)->postJson('/api/v1/games', [
            ...$payload,
            'owner_id' => $owner->id,
        ]);

        $second->assertCreated()
            ->assertJsonPath('data.owner_id', $otherOwner->id)
            ->assertJsonPath('data.seats.0.user_id', $otherOwner->id);
        $this->assertNotSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('games', 2);
        $this->assertDatabaseCount('game_seats', 6);
    }

    public function test_creating_without_a_key_still_allows_separate_games_with_the_same_configuration(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = $this->validPayload();
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);

        $first = $this->withToken($token)->postJson('/api/v1/games', $payload);
        $second = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('games', 2);
        $this->assertDatabaseCount('game_seats', 6);
    }

    public function test_different_creation_keys_can_save_the_same_board_as_separate_games(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = $this->validPayload();
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);

        $first = $this->withToken($token)->postJson('/api/v1/games', [
            ...$payload,
            'creation_key' => self::CREATION_KEY,
        ]);
        $second = $this->withToken($token)->postJson('/api/v1/games', [
            ...$payload,
            'creation_key' => 'fe19c51d-49c3-480c-8737-1514352542fe',
        ]);

        $first->assertCreated();
        $second->assertCreated();
        $this->assertNotSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('games', 2);
        $this->assertDatabaseCount('game_seats', 6);
    }

    public function test_equivalent_uuid_case_and_numeric_input_reuse_the_same_game(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);
        $first = $this->withToken($token)->postJson('/api/v1/games', [
            ...$payload,
            'creation_key' => strtoupper(self::CREATION_KEY),
            'ai_count' => '2',
        ]);
        $first->assertCreated();

        $retry = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $retry->assertOk()->assertJsonPath('data.id', $first->json('data.id'));
        $this->assertDatabaseHas('games', ['creation_key' => self::CREATION_KEY]);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
        Http::assertSentCount(1);
    }

    #[TestWith(['not-a-uuid', 'The creation_key must be a valid UUID.'])]
    #[TestWith([null, 'The creation_key field must contain a UUID when provided.'])]
    #[TestWith(['', 'The creation_key field must contain a UUID when provided.'])]
    public function test_an_invalid_supplied_creation_key_returns_422_without_saving(mixed $creationKey, string $message): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Http::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games', [
            ...$this->validPayload(),
            'creation_key' => $creationKey,
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.fields.creation_key.0', $message);
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
        Http::assertNothingSent();
    }

    public function test_a_competing_save_during_board_generation_is_reused_without_duplicating_seats(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        $competingGame = null;
        $isCompetingSave = false;
        Http::fake(function () use ($owner, $payload, &$competingGame, &$isCompetingSave) {
            if (! $isCompetingSave) {
                $isCompetingSave = true;
                $competingGame = $this->app->make(GameCreationService::class)->create($owner, $payload);
            }

            return Http::response($this->boardResponse($payload['seed']), 200);
        });

        $response = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $this->assertInstanceOf(Game::class, $competingGame);
        $response->assertOk()->assertJsonPath('data.id', $competingGame->id);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
    }

    public function test_the_database_rejects_duplicate_creation_keys_for_one_owner(): void
    {
        $game = Game::factory()->create(['creation_key' => self::CREATION_KEY]);

        $this->expectException(UniqueConstraintViolationException::class);

        DB::transaction(fn () => Game::factory()->for($game->owner, 'owner')->create([
            'creation_key' => self::CREATION_KEY,
        ]));
    }

    public function test_a_competing_save_with_different_input_returns_409_without_overwriting_it(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        $competingGame = null;
        $isCompetingSave = false;
        Http::fake(function () use ($owner, $payload, &$competingGame, &$isCompetingSave) {
            if (! $isCompetingSave) {
                $isCompetingSave = true;
                $competingGame = $this->app->make(GameCreationService::class)->create($owner, [
                    ...$payload,
                    'ai_count' => 3,
                ]);
            }

            return Http::response($this->boardResponse($payload['seed']), 200);
        });

        $response = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $response->assertConflict()->assertJsonPath('error.code', 'game_creation_key_conflict');
        $this->assertInstanceOf(Game::class, $competingGame);
        $this->assertDatabaseHas('games', ['id' => $competingGame->id, 'seat_count' => 4]);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 4);
    }

    public function test_an_engine_failure_does_not_consume_the_creation_key(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [...$this->validPayload(), 'creation_key' => self::CREATION_KEY];
        $attempts = 0;
        Http::fake(function () use ($payload, &$attempts) {
            $attempts++;

            if ($attempts === 1) {
                throw new ConnectionException('connection refused');
            }

            return Http::response($this->boardResponse($payload['seed']), 200);
        });
        $first = $this->withToken($token)->postJson('/api/v1/games', $payload);
        $first->assertServiceUnavailable();
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);

        $retry = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $retry->assertCreated();
        $this->assertDatabaseHas('games', [
            'id' => $retry->json('data.id'),
            'creation_key' => self::CREATION_KEY,
        ]);
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
    }

    public function test_an_authenticated_user_can_create_a_game_with_two_ai_seats(): void
    {
        $owner = User::factory()->create([
            'name' => 'Ada Player',
        ]);
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
            'ai_count' => 2,
        ];
        $boardResponse = $this->boardResponse($payload['seed']);

        Http::fake([
            '*' => Http::response($boardResponse, 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.owner_id', $owner->id)
            ->assertJsonPath('data.mode', 'human_vs_ai')
            ->assertJsonPath('data.seed', $payload['seed'])
            ->assertJsonPath('data.seat_count', 3)
            ->assertJsonPath('data.human_seat_number', 1)
            ->assertJsonPath('data.lifecycle_status', 'created')
            ->assertJsonPath('data.board', $boardResponse['data'])
            ->assertJsonPath('data.seats.0', [
                'seat_number' => 1,
                'controller_type' => 'human',
                'user_id' => $owner->id,
                'label' => 'Ada Player',
            ])
            ->assertJsonPath('data.seats.1', [
                'seat_number' => 2,
                'controller_type' => 'ai',
                'user_id' => null,
                'label' => 'AI 1',
            ])
            ->assertJsonPath('data.seats.2', [
                'seat_number' => 3,
                'controller_type' => 'ai',
                'user_id' => null,
                'label' => 'AI 2',
            ]);

        $game = Game::query()->with('seats')->sole();

        $this->assertSame($owner->id, $game->owner_id);
        $this->assertSame($boardResponse['data'], $game->board_configuration);
        $this->assertSame([1, 2, 3], $game->seats->pluck('seat_number')->all());
        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 3);
        Http::assertSent(fn (ClientRequest $request): bool => $request->data() === [
            'seed' => $payload['seed'],
            'ruleset_key' => $payload['ruleset_key'],
            'map_key' => $payload['map_key'],
        ]);
    }

    public function test_an_authenticated_user_can_create_a_game_with_three_ai_seats(): void
    {
        $owner = User::factory()->create([
            'name' => 'Ada Player',
        ]);
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = [
            'seed' => '123456789',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
            'ai_count' => 3,
        ];

        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.seat_count', 4)
            ->assertJsonCount(4, 'data.seats')
            ->assertJsonPath('data.seats.3.label', 'AI 3');

        $this->assertDatabaseCount('games', 1);
        $this->assertDatabaseCount('game_seats', 4);
        $this->assertSame([1, 2, 3, 4], Game::query()->firstOrFail()->seats->pluck('seat_number')->all());
    }

    public function test_an_unauthenticated_request_returns_a_json_401_without_calling_the_engine(): void
    {
        Http::fake();

        $response = $this->postJson('/api/v1/games', $this->validPayload());

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
        Http::assertNothingSent();
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
    }

    public function test_invalid_authenticated_input_returns_422_without_calling_the_engine(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Http::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games', [
            'seed' => '0894177203164',
            'ruleset_key' => 'unsupported',
            'map_key' => 'custom',
            'ai_count' => 1,
        ]);

        $response->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.message', 'The game creation request is invalid.')
            ->assertJsonStructure([
                'error' => [
                    'fields' => ['seed', 'ruleset_key', 'map_key', 'ai_count'],
                ],
            ]);
        Http::assertNothingSent();
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
    }

    public function test_a_client_supplied_owner_is_ignored(): void
    {
        $owner = User::factory()->create(['name' => 'Ada Player']);
        $otherUser = User::factory()->create(['name' => 'Other Player']);
        $token = $owner->createToken('test-client')->plainTextToken;
        $payload = $this->validPayload();
        $payload['owner_id'] = $otherUser->id;

        Http::fake([
            '*' => Http::response($this->boardResponse($payload['seed']), 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/games', $payload);

        $response->assertCreated()->assertJsonPath('data.owner_id', $owner->id);
        $this->assertDatabaseHas('games', [
            'owner_id' => $owner->id,
        ]);
        $this->assertDatabaseMissing('games', [
            'owner_id' => $otherUser->id,
        ]);
    }

    public function test_an_unavailable_game_engine_returns_503_without_persisting_records(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Http::fake(function (): never {
            throw new ConnectionException('connection refused');
        });

        $response = $this->withToken($token)->postJson('/api/v1/games', $this->validPayload());

        $response->assertServiceUnavailable()->assertExactJson([
            'error' => [
                'code' => 'game_engine_unavailable',
                'message' => 'The board generation service is unavailable.',
            ],
        ]);
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
    }

    public function test_a_malformed_game_engine_response_returns_502_without_persisting_records(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Http::fake([
            '*' => Http::response(['data' => ['seed' => '894177203164']], 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/games', $this->validPayload());

        $response->assertStatus(502)->assertExactJson([
            'error' => [
                'code' => 'invalid_game_engine_response',
                'message' => 'The board generation service returned an invalid response.',
            ],
        ]);
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
    }

    public function test_a_board_metadata_mismatch_returns_502_without_persisting_records(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Http::fake([
            '*' => Http::response($this->boardResponse('123456789'), 200),
        ]);

        $response = $this->withToken($token)->postJson('/api/v1/games', $this->validPayload());

        $response->assertStatus(502)->assertExactJson([
            'error' => [
                'code' => 'invalid_game_engine_response',
                'message' => 'The board generation service returned an invalid response.',
            ],
        ]);
        $this->assertDatabaseCount('games', 0);
        $this->assertDatabaseCount('game_seats', 0);
    }

    /**
     * @return array{seed: string, ruleset_key: string, map_key: string, ai_count: int}
     */
    private function validPayload(): array
    {
        return [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
            'ai_count' => 2,
        ];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    private function boardResponse(string $seed): array
    {
        return [
            'data' => [
                'board_schema_version' => '1',
                'seed' => $seed,
                'ruleset' => [
                    'key' => 'base',
                    'version' => '1.0.0',
                ],
                'map' => [
                    'key' => 'standard',
                    'version' => '1.0.0',
                    'orientation' => 'pointy',
                ],
                'hexes' => [],
                'vertices' => [],
                'edges' => [],
                'ports' => [],
            ],
        ];
    }
}
