<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\GameReplayRequest;
use App\Models\Game;
use App\Models\GameSnapshot;
use App\Models\User;
use App\Services\GameReplayProjection;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class GameReplayController extends Controller
{
    public function __construct(private readonly GameReplayProjection $replayProjection) {}

    /**
     * Handle the incoming request.
     */
    public function __invoke(GameReplayRequest $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();
        $ownedGame = $owner->ownedGames()
            ->select([
                'id',
                'owner_id',
                'mode',
                'ruleset_key',
                'ruleset_version',
                'seed',
                'seat_count',
                'human_seat_number',
                'lifecycle_status',
                'board_configuration',
                'state_schema_version',
                'last_command_sequence',
                'started_at',
                'completed_at',
                'created_at',
            ])
            ->with(['seats' => function (HasMany $query): void {
                $query->select([
                    'id',
                    'game_id',
                    'seat_number',
                    'controller_type',
                    'label',
                ]);
            }])
            ->find($game);

        if ($ownedGame === null) {
            return $this->gameNotFoundResponse();
        }

        $atCommandSequence = $request->atCommandSequence()
            ?? (string) ($ownedGame->last_command_sequence ?? 0);
        $snapshots = $ownedGame->snapshots()
            ->select([
                'game_id',
                'command_sequence',
                'event_sequence',
                'state_schema_version',
                'created_at',
            ])
            ->get();
        $frame = $this->selectFrame($ownedGame, $atCommandSequence);
        $events = $this->selectVisibleEvents($ownedGame, $request, $frame);

        return response()->json($this->replayProjection->project(
            game: $ownedGame,
            seats: $ownedGame->seats,
            events: $events,
            snapshots: $snapshots,
            frame: $frame,
            requestedAfterSequence: $request->afterEventSequence(),
            limit: $request->limit(),
        ));
    }

    /**
     * Select the latest persisted checkpoint at or before the requested command.
     */
    private function selectFrame(Game $game, string $atCommandSequence): ?GameSnapshot
    {
        return $game->snapshots()
            ->where('command_sequence', '<=', $atCommandSequence)
            ->reorder()
            ->orderByDesc('command_sequence')
            ->first();
    }

    /**
     * Select a bounded visible event page before the projection applies its safety filter.
     */
    private function selectVisibleEvents(
        Game $game,
        GameReplayRequest $request,
        ?GameSnapshot $frame,
    ): Collection {
        $query = $game->events()
            ->select([
                'game_id',
                'sequence',
                'event_type',
                'payload',
                'visibility',
                'visible_to_seat_number',
                'occurred_at',
            ])
            ->where(function (Builder $query) use ($game): void {
                $query->where(function (Builder $publicEvents): void {
                    $publicEvents
                        ->where('visibility', 'public')
                        ->whereNull('visible_to_seat_number');
                });

                if ($game->human_seat_number !== null) {
                    $query->orWhere(function (Builder $privateEvents) use ($game): void {
                        $privateEvents
                            ->where('visibility', 'seat_private')
                            ->where('visible_to_seat_number', $game->human_seat_number);
                    });
                }
            })
            ->where('sequence', '>', $request->afterEventSequence())
            ->orderBy('sequence')
            ->limit($request->limit() + 1);

        if ($frame !== null) {
            $query->where('sequence', '<=', $frame->event_sequence);
        }

        return $query->get();
    }

    private function gameNotFoundResponse(): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ], Response::HTTP_NOT_FOUND);
    }
}
