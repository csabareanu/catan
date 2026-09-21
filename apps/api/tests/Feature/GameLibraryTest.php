<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameSeat;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Tests\TestCase;

class GameLibraryTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_an_authenticated_user_can_list_only_owned_games_as_compact_summaries(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $timestamp = CarbonImmutable::parse('2026-09-21 12:00:00');
        $olderGame = Game::factory()->for($owner, 'owner')->create([
            'created_at' => $timestamp->subDay(),
            'updated_at' => $timestamp->subDay(),
        ]);
        $newerGame = Game::factory()->for($owner, 'owner')->create([
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
        ]);
        $foreignGame = Game::factory()->for($otherUser, 'owner')->create([
            'created_at' => $timestamp->addDay(),
            'updated_at' => $timestamp->addDay(),
        ]);

        $response = $this->withToken($token)->getJson('/api/v1/games');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [[
                    'id',
                    'owner_id',
                    'mode',
                    'seed',
                    'ruleset' => ['key', 'version'],
                    'map' => ['key', 'version', 'orientation'],
                    'seat_count',
                    'human_seat_number',
                    'lifecycle_status',
                    'configuration',
                    'created_at',
                    'updated_at',
                ]],
                'links',
                'meta',
            ])
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('data.0.id', $newerGame->id)
            ->assertJsonPath('data.1.id', $olderGame->id)
            ->assertJsonMissingPath('data.0.board')
            ->assertJsonMissingPath('data.0.seats');

        $this->assertCount(2, $response->json('data'));
        $this->assertNotSame($foreignGame->id, $response->json('data.0.id'));
        $this->assertNotSame($foreignGame->id, $response->json('data.1.id'));
    }

    public function test_the_game_list_uses_a_fixed_page_size_and_honors_page_selection(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        Game::factory()->count(21)->for($owner, 'owner')->create();

        $firstPage = $this->withToken($token)->getJson('/api/v1/games?per_page=1');
        $secondPage = $this->withToken($token)->getJson('/api/v1/games?page=2');

        $firstPage->assertOk()
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2);
        $secondPage->assertOk()
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.current_page', 2);
        $this->assertCount(20, $firstPage->json('data'));
        $this->assertCount(1, $secondPage->json('data'));
    }

    public function test_an_owner_with_no_games_receives_an_empty_paginated_list(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/games');

        $response->assertOk()
            ->assertJsonPath('data', [])
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.total', 0);
    }

    public function test_an_unauthenticated_request_returns_the_existing_json_401(): void
    {
        $response = $this->getJson('/api/v1/games');

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
    }

    public function test_an_owner_can_inspect_a_game_with_its_board_and_ordered_seats(): void
    {
        $owner = User::factory()->create(['name' => 'Ada Player']);
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();
        GameSeat::factory()->for($game)->create([
            'seat_number' => 2,
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI 1',
        ]);
        GameSeat::factory()->for($game)->create([
            'seat_number' => 1,
            'controller_type' => 'human',
            'user_id' => $owner->id,
            'label' => 'Ada Player',
        ]);

        $response = $this->withToken($token)->getJson('/api/v1/games/'.$game->id);

        $response->assertOk()
            ->assertJsonPath('data.id', $game->id)
            ->assertJsonPath('data.owner_id', $owner->id)
            ->assertJsonPath('data.board', $game->board_configuration)
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
            ->assertJsonMissingPath('data.current_state')
            ->assertJsonMissingPath('data.result');
    }

    public function test_an_owner_receives_the_same_not_found_error_for_a_foreign_or_missing_game(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $foreignGame = Game::factory()->for($otherUser, 'owner')->create();
        $expectedError = [
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ];

        $this->withToken($token)
            ->getJson('/api/v1/games/'.$foreignGame->id)
            ->assertNotFound()
            ->assertExactJson($expectedError);

        $this->withToken($token)
            ->getJson('/api/v1/games/999999')
            ->assertNotFound()
            ->assertExactJson($expectedError);
    }

    public function test_an_unauthenticated_request_cannot_inspect_a_game(): void
    {
        $game = Game::factory()->create();

        $response = $this->getJson('/api/v1/games/'.$game->id);

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
    }

    public function test_an_owner_can_delete_a_game_and_its_seats(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();
        $seat = GameSeat::factory()->for($game)->create();

        $response = $this->withToken($token)->deleteJson('/api/v1/games/'.$game->id);

        $response->assertNoContent();
        $this->assertDatabaseMissing('games', ['id' => $game->id]);
        $this->assertDatabaseMissing('game_seats', ['id' => $seat->id]);
    }

    public function test_an_owner_cannot_delete_a_foreign_or_missing_game(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $foreignGame = Game::factory()->for($otherUser, 'owner')->create();
        $expectedError = [
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ];

        $this->withToken($token)
            ->deleteJson('/api/v1/games/'.$foreignGame->id)
            ->assertNotFound()
            ->assertExactJson($expectedError);
        $this->assertDatabaseHas('games', ['id' => $foreignGame->id]);

        $this->withToken($token)
            ->deleteJson('/api/v1/games/999999')
            ->assertNotFound()
            ->assertExactJson($expectedError);
    }

    public function test_an_unauthenticated_request_cannot_delete_a_game(): void
    {
        $game = Game::factory()->create();

        $response = $this->deleteJson('/api/v1/games/'.$game->id);

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
        $this->assertDatabaseHas('games', ['id' => $game->id]);
    }
}
