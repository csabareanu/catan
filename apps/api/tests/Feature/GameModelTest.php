<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameSeat;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Tests\TestCase;

class GameModelTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_game_and_user_relationships_expose_ordered_seats(): void
    {
        $owner = User::factory()->create();
        $game = Game::factory()->for($owner, 'owner')->create([
            'seat_count' => 3,
        ]);
        $humanSeat = GameSeat::factory()->for($game, 'game')->create([
            'seat_number' => 1,
            'user_id' => $owner->id,
            'label' => $owner->name,
        ]);
        $secondSeat = GameSeat::factory()->for($game, 'game')->ai()->create([
            'seat_number' => 2,
            'label' => 'AI 1',
        ]);
        $thirdSeat = GameSeat::factory()->for($game, 'game')->ai()->create([
            'seat_number' => 3,
            'label' => 'AI 2',
        ]);

        $this->assertTrue($game->owner->is($owner));
        $this->assertTrue($owner->ownedGames->contains($game));
        $this->assertSame([1, 2, 3], $game->seats->pluck('seat_number')->all());
        $this->assertTrue($humanSeat->game->is($game));
        $this->assertTrue($humanSeat->user->is($owner));
        $this->assertTrue($owner->gameSeats->contains($humanSeat));
        $this->assertNull($secondSeat->user_id);
        $this->assertNull($thirdSeat->user_id);
    }

    public function test_game_json_configuration_is_cast_to_arrays(): void
    {
        $game = Game::factory()->create();

        $this->assertIsArray($game->configuration);
        $this->assertIsArray($game->board_configuration);
        $this->assertSame(2, $game->configuration['ai_count']);
        $this->assertSame('standard', $game->board_configuration['map']['key']);
    }

    public function test_existing_games_keep_uninitialized_execution_defaults(): void
    {
        $game = Game::factory()->create()->refresh();

        $this->assertSame('created', $game->lifecycle_status);
        $this->assertNull($game->state_schema_version);
        $this->assertNull($game->current_state);
        $this->assertNull($game->result);
        $this->assertSame(0, $game->last_command_sequence);
        $this->assertSame(0, $game->last_event_sequence);
        $this->assertSame(0, $game->run_attempts);
        $this->assertNull($game->failure_code);
        $this->assertNull($game->failure_message);
        $this->assertNull($game->started_at);
        $this->assertNull($game->completed_at);
    }

    public function test_execution_metadata_round_trips_with_documented_types(): void
    {
        $startedAt = CarbonImmutable::parse('2026-09-21 12:00:00');
        $completedAt = CarbonImmutable::parse('2026-09-21 12:05:00');
        $game = Game::factory()->create([
            'state_schema_version' => 'state-v1',
            'current_state' => [
                'turn' => 3,
                'active_seat_number' => 2,
            ],
            'result' => [
                'winner_seat_number' => 2,
            ],
            'last_command_sequence' => 7,
            'last_event_sequence' => 11,
            'run_attempts' => 2,
            'failure_code' => 'engine_timeout',
            'failure_message' => 'The engine did not respond in time.',
            'started_at' => $startedAt,
            'completed_at' => $completedAt,
        ])->refresh();

        $this->assertSame('state-v1', $game->state_schema_version);
        $this->assertSame([
            'turn' => 3,
            'active_seat_number' => 2,
        ], $game->current_state);
        $this->assertSame(['winner_seat_number' => 2], $game->result);
        $this->assertSame(7, $game->last_command_sequence);
        $this->assertSame(11, $game->last_event_sequence);
        $this->assertSame(2, $game->run_attempts);
        $this->assertSame('engine_timeout', $game->failure_code);
        $this->assertSame('The engine did not respond in time.', $game->failure_message);
        $this->assertInstanceOf(CarbonImmutable::class, $game->started_at);
        $this->assertInstanceOf(CarbonImmutable::class, $game->completed_at);
        $this->assertTrue($startedAt->equalTo($game->started_at));
        $this->assertTrue($completedAt->equalTo($game->completed_at));
    }

    public function test_game_seat_numbers_are_unique_within_a_game(): void
    {
        $game = Game::factory()->create();

        GameSeat::factory()->for($game, 'game')->create(['seat_number' => 1]);

        $this->expectException(QueryException::class);

        GameSeat::factory()->for($game, 'game')->ai()->create(['seat_number' => 1]);
    }

    public function test_deleting_an_owner_cascades_to_owned_games_and_seats(): void
    {
        $owner = User::factory()->create();
        $game = Game::factory()->for($owner, 'owner')->create();
        $seat = GameSeat::factory()->for($game, 'game')->create([
            'user_id' => $owner->id,
        ]);

        $owner->delete();

        $this->assertDatabaseMissing('games', ['id' => $game->id]);
        $this->assertDatabaseMissing('game_seats', ['id' => $seat->id]);
    }
}
