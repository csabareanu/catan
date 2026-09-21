<?php

namespace Database\Factories;

use App\Models\Game;
use App\Models\GameSeat;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<GameSeat>
 */
class GameSeatFactory extends Factory
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
            'seat_number' => 1,
            'controller_type' => 'human',
            'user_id' => User::factory(),
            'label' => fake()->name(),
        ];
    }

    /**
     * Indicate that the seat is controlled by an AI.
     */
    public function ai(): static
    {
        return $this->state(fn (array $attributes) => [
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI '.fake()->numberBetween(1, 3),
        ]);
    }
}
