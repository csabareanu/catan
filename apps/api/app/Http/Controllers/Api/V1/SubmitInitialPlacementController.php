<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Exceptions\InitialPlacementCommandRejected;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SubmitInitialPlacementRequest;
use App\Models\User;
use App\Services\InitialPlacementService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class SubmitInitialPlacementController extends Controller
{
    public function __construct(private readonly InitialPlacementService $initialPlacementService) {}

    public function __invoke(SubmitInitialPlacementRequest $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        try {
            $result = $this->initialPlacementService->submit($owner, $game, $request->validated());
        } catch (InitialPlacementCommandRejected) {
            return $this->errorResponse(
                HttpResponse::HTTP_UNPROCESSABLE_ENTITY,
                'illegal_initial_placement',
                'The selected settlement and road are not a legal setup placement.',
            );
        } catch (GameEngineUnavailable) {
            return $this->errorResponse(
                HttpResponse::HTTP_SERVICE_UNAVAILABLE,
                'game_engine_unavailable',
                'The game engine is unavailable.',
            );
        } catch (GameEngineProtocolException) {
            return $this->errorResponse(
                HttpResponse::HTTP_BAD_GATEWAY,
                'invalid_game_engine_response',
                'The game engine returned an invalid initial placement response.',
            );
        }

        if ($result === null) {
            return $this->errorResponse(
                HttpResponse::HTTP_NOT_FOUND,
                'game_not_found',
                'The requested game was not found.',
            );
        }

        if ($result['outcome'] !== 'accepted') {
            [$code, $message] = match ($result['outcome']) {
                'stale' => [
                    'stale_initial_placement',
                    'The game has advanced since these placement options were loaded.',
                ],
                'idempotency_conflict' => [
                    'idempotency_key_reused',
                    'The Idempotency-Key was already used for a different command.',
                ],
                default => [
                    'initial_placement_not_available',
                    'The game is not waiting for this owner to place a settlement and road.',
                ],
            };

            return $this->errorResponse(HttpResponse::HTTP_CONFLICT, $code, $message);
        }

        return response()->json([
            'schema_version' => 'initial-placement-command-v1',
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
