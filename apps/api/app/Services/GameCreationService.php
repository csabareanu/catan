<?php

namespace App\Services;

use App\Exceptions\GameCreationKeyConflict;
use App\Exceptions\GameEngineProtocolException;
use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GameCreationService
{
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Create a game owned by the authenticated user.
     *
     * @param  array{seed: string, ruleset_key: string, map_key: string, ai_count: int, creation_key?: string}  $payload
     */
    public function create(User $owner, array $payload): Game
    {
        $creationKey = isset($payload['creation_key']) ? Str::lower($payload['creation_key']) : null;
        $existingGame = $creationKey === null
            ? null
            : $owner->ownedGames()->where('creation_key', $creationKey)->first();

        if ($existingGame !== null) {
            $this->assertMatchingCreation($existingGame, $payload);

            return $existingGame->load('seats');
        }

        $boardResponse = $this->gameEngineClient->generateBoard([
            'seed' => $payload['seed'],
            'ruleset_key' => $payload['ruleset_key'],
            'map_key' => $payload['map_key'],
        ]);
        $board = $this->validatedBoard($boardResponse, $payload);
        $aiCount = (int) $payload['ai_count'];

        $game = DB::transaction(function () use ($owner, $board, $aiCount, $creationKey, $payload): Game {
            $attributes = [
                'owner_id' => $owner->getKey(),
                'creation_key' => $creationKey,
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
            ];
            $game = $creationKey === null
                ? Game::create($attributes)
                : $owner->ownedGames()->firstOrCreate(['creation_key' => $creationKey], $attributes);

            if (! $game->wasRecentlyCreated) {
                $this->assertMatchingCreation($game, $payload);

                return $game;
            }

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
     * @param  array{seed: string, ruleset_key: string, map_key: string, ai_count: int, creation_key?: string}  $payload
     */
    private function assertMatchingCreation(Game $game, array $payload): void
    {
        if ($game->seed !== $payload['seed']
            || $game->ruleset_key !== $payload['ruleset_key']
            || ($game->configuration['map_key'] ?? null) !== $payload['map_key']
            || (int) ($game->configuration['ai_count'] ?? 0) !== (int) $payload['ai_count']) {
            throw new GameCreationKeyConflict;
        }
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
