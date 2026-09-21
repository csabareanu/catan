<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GameCreationTest extends TestCase
{
    use LazilyRefreshDatabase;

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
