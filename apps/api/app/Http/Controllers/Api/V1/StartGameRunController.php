<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\GameResource;
use App\Models\User;
use App\Services\GameRunService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class StartGameRunController extends Controller
{
    public function __construct(private readonly GameRunService $gameRunService) {}

    /**
     * Handle the incoming request.
     */
    public function __invoke(Request $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();
        $result = $this->gameRunService->start($owner, $game);

        if ($result === null) {
            return $this->gameNotFoundResponse();
        }

        if ($result['outcome'] === 'dispatch_failed') {
            return response()->json([
                'error' => [
                    'code' => 'queue_dispatch_failed',
                    'message' => 'The game could not be queued for execution.',
                ],
            ], Response::HTTP_SERVICE_UNAVAILABLE);
        }

        if ($result['outcome'] === 'conflict') {
            return response()->json([
                'error' => [
                    'code' => 'game_run_not_startable',
                    'message' => 'The game cannot be started in its current state.',
                ],
            ], Response::HTTP_CONFLICT);
        }

        $status = $result['outcome'] === 'saved'
            ? Response::HTTP_OK
            : Response::HTTP_ACCEPTED;
        $response = (new GameResource($result['game']))->response();
        $response->setStatusCode($status);

        return $response;
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
