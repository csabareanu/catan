<?php

namespace Database\Factories;

use App\Models\Game;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Game>
 */
class GameFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $seed = fake()->numerify('9###########');

        return [
            'owner_id' => User::factory(),
            'mode' => 'human_vs_ai',
            'ruleset_key' => 'base',
            'ruleset_version' => '1.0.0',
            'seed' => $seed,
            'seat_count' => 3,
            'human_seat_number' => 1,
            'lifecycle_status' => 'created',
            'configuration' => [
                'ai_count' => 2,
                'map_key' => 'standard',
                'map_version' => '1.0.0',
                'board_schema_version' => '1',
            ],
            'board_configuration' => [
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
