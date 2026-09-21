<?php

namespace App\Http\Resources\Api\V1;

use App\Models\Game;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GameSummaryResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Game $game */
        $game = $this->resource;
        $board = $game->board_configuration;

        return [
            'id' => $game->getKey(),
            'owner_id' => $game->owner_id,
            'mode' => $game->mode,
            'seed' => $game->seed,
            'ruleset' => [
                'key' => $game->ruleset_key,
                'version' => $game->ruleset_version,
            ],
            'map' => [
                'key' => $board['map']['key'],
                'version' => $board['map']['version'],
                'orientation' => $board['map']['orientation'],
            ],
            'seat_count' => $game->seat_count,
            'human_seat_number' => $game->human_seat_number,
            'lifecycle_status' => $game->lifecycle_status,
            'configuration' => $game->configuration,
            'created_at' => $game->created_at?->toISOString(),
            'updated_at' => $game->updated_at?->toISOString(),
        ];
    }
}
