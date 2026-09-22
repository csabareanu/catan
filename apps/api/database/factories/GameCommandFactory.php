<?php

namespace Database\Factories;

use App\Models\Game;
use App\Models\GameCommand;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GameCommand>
 */
class GameCommandFactory extends Factory
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
            'sequence' => 1,
            'idempotency_key' => fake()->uuid(),
            'acting_seat_number' => 1,
            'command_type' => 'initialize.v1',
            'payload' => [
                'schema_version' => '1',
            ],
            'accepted_at' => now(),
        ];
    }
}
