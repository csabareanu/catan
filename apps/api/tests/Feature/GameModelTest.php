<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameSeat;
use App\Models\User;
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
