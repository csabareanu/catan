<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\GameResource;
use App\Http\Resources\Api\V1\GameSummaryResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpFoundation\Response;

class GameController extends Controller
{
    private const int PAGE_SIZE = 20;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $owner */
        $owner = $request->user();

        $games = $owner->ownedGames()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PAGE_SIZE);

        return GameSummaryResource::collection($games);
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
}
