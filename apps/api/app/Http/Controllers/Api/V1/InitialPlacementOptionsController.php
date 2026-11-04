<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\InitialPlacementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class InitialPlacementOptionsController extends Controller
{
    public function __construct(private readonly InitialPlacementService $initialPlacementService) {}

    public function __invoke(Request $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        try {
            $result = $this->initialPlacementService->options($owner, $game);
        } catch (GameEngineUnavailable) {
            return $this->errorResponse(
                Response::HTTP_SERVICE_UNAVAILABLE,
                'game_engine_unavailable',
                'The game engine is unavailable.',
            );
        } catch (GameEngineProtocolException) {
            return $this->errorResponse(
                Response::HTTP_BAD_GATEWAY,
                'invalid_game_engine_response',
                'The game engine returned invalid initial placement options.',
            );
        }

        if ($result === null) {
            return $this->errorResponse(
                Response::HTTP_NOT_FOUND,
                'game_not_found',
                'The requested game was not found.',
            );
        }

        if (! $result['available']) {
            return $this->errorResponse(
                Response::HTTP_CONFLICT,
                'initial_placement_not_available',
                'The game is not waiting for this owner to place a settlement and road.',
            );
        }

        return response()->json([
            'schema_version' => 'initial-placement-options-v1',
            'data' => $result['data'],
        ]);
    }

    private function errorResponse(int $status, string $code, string $message): JsonResponse
    {
        return response()->json([
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ], $status);
    }
}
