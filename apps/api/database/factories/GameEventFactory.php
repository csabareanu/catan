<?php

namespace Database\Factories;

use App\Models\Game;
use App\Models\GameEvent;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GameEvent>
 */
class GameEventFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'game_id' => Game::factory(),
            'command_id' => null,
            'sequence' => 1,
            'event_type' => 'game_initialized.v1',
            'payload' => [
                'schema_version' => '1',
            ],
            'visibility' => 'public',
            'visible_to_seat_number' => null,
            'occurred_at' => now(),
        ];
    }
}
