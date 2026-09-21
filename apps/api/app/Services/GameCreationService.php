<?php

namespace App\Services;

use App\Exceptions\GameEngineProtocolException;
use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class GameCreationService
{
    /**
     * Create a game after the engine has produced a canonical board.
     *
     * @param  array{seed: string, ruleset_key: string, map_key: string, ai_count: int}  $payload
     */
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Create a game owned by the authenticated user.
     *
     * @param  array{seed: string, ruleset_key: string, map_key: string, ai_count: int}  $payload
     */
    public function create(User $owner, array $payload): Game
    {
        $boardResponse = $this->gameEngineClient->generateBoard([
            'seed' => $payload['seed'],
            'ruleset_key' => $payload['ruleset_key'],
            'map_key' => $payload['map_key'],
        ]);
        $board = $this->validatedBoard($boardResponse, $payload);
        $aiCount = $payload['ai_count'];

        $game = DB::transaction(function () use ($owner, $board, $aiCount): Game {
            $game = Game::create([
                'owner_id' => $owner->getKey(),
                'mode' => 'human_vs_ai',
                'ruleset_key' => $board['ruleset']['key'],
                'ruleset_version' => $board['ruleset']['version'],
                'seed' => $board['seed'],
                'seat_count' => 1 + $aiCount,
                'human_seat_number' => 1,
                'lifecycle_status' => 'created',
                'configuration' => [
                    'ai_count' => $aiCount,
                    'map_key' => $board['map']['key'],
                    'map_version' => $board['map']['version'],
                    'board_schema_version' => $board['board_schema_version'],
                ],
                'board_configuration' => $board,
            ]);

            $game->seats()->create([
                'seat_number' => 1,
                'controller_type' => 'human',
                'user_id' => $owner->getKey(),
                'label' => $owner->name,
            ]);

            for ($seatNumber = 2; $seatNumber <= $game->seat_count; $seatNumber++) {
                $game->seats()->create([
                    'seat_number' => $seatNumber,
                    'controller_type' => 'ai',
                    'user_id' => null,
                    'label' => 'AI '.($seatNumber - 1),
                ]);
            }

            return $game;
        });

        return $game->load('seats');
    }

    /**
     * Ensure the engine response describes the board that was requested.
     *
     * @param  array<string, mixed>  $boardResponse
     * @param  array{seed: string, ruleset_key: string, map_key: string, ai_count: int}  $payload
     * @return array<string, mixed>
     */
    private function validatedBoard(array $boardResponse, array $payload): array
    {
        $board = $boardResponse['data'] ?? null;
        $ruleset = is_array($board['ruleset'] ?? null) ? $board['ruleset'] : [];
        $map = is_array($board['map'] ?? null) ? $board['map'] : [];

        if (! is_array($board)
            || ($board['seed'] ?? null) !== $payload['seed']
            || ($ruleset['key'] ?? null) !== $payload['ruleset_key']
            || ($map['key'] ?? null) !== $payload['map_key']) {
            throw new GameEngineProtocolException(
                'The game engine returned board metadata that does not match the request.',
            );
        }

        return $board;
    }
}
