<?php

namespace Database\Factories;

use App\Models\Game;
use App\Models\GameSnapshot;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GameSnapshot>
 */
class GameSnapshotFactory extends Factory
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
            'command_sequence' => 0,
            'event_sequence' => 0,
            'state_schema_version' => 'state-v1',
            'state' => [
                'turn' => 0,
            ],
            'created_at' => now(),
        ];
    }
}
