<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\ListGamesRequest;
use App\Http\Resources\Api\V1\GameResource;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

class GameController extends Controller
{
    private const int PAGE_SIZE = 20;

    private const array IN_PROGRESS_STATUSES = [
        'queued',
        'running',
        'awaiting human input',
        'awaiting_human_input',
        'failed',
    ];

    /**
     * Display a listing of the resource.
     */
    public function index(ListGamesRequest $request): AnonymousResourceCollection
    {
        /** @var User $owner */
        $owner = $request->user();
        $view = $request->validated('view', 'all');

        $games = $this->viewQuery($owner, $view)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PAGE_SIZE);

        return GameSummaryResource::collection($games)->additional([
            'meta' => [
                'view' => $view,
                'counts' => $this->libraryCounts($owner),
            ],
        ]);
    }

    /**
     * Display an owned game.
     */
    public function show(Request $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();
        $ownedGame = $owner->ownedGames()->find($game);

        if ($ownedGame === null) {
            return $this->gameNotFoundResponse();
        }

        return (new GameResource($ownedGame))->response();
    }

    /**
     * Remove an owned game.
     */
    public function destroy(Request $request, string $game): Response
    {
        /** @var User $owner */
        $owner = $request->user();
        $ownedGame = $owner->ownedGames()->find($game);

        if ($ownedGame === null) {
            return $this->gameNotFoundResponse();
        }

        $ownedGame->delete();

        return response()->noContent();
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

    private function viewQuery(User $owner, string $view): Builder
    {
        $query = $owner->ownedGames()->getQuery();

        return match ($view) {
            'saved_setups' => $query->where('lifecycle_status', 'created'),
            'in_progress' => $query->whereIn('lifecycle_status', self::IN_PROGRESS_STATUSES),
            'history' => $query->where('lifecycle_status', 'completed'),
            default => $query,
        };
    }

    /**
     * @return array{all: int, saved_setups: int, in_progress: int, history: int}
     */
    private function libraryCounts(User $owner): array
    {
        return [
            'all' => $this->viewQuery($owner, 'all')->count(),
            'saved_setups' => $this->viewQuery($owner, 'saved_setups')->count(),
            'in_progress' => $this->viewQuery($owner, 'in_progress')->count(),
            'history' => $this->viewQuery($owner, 'history')->count(),
        ];
    }
}
