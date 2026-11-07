<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Exceptions\TurnCommandRejected;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\SubmitTurnCommandRequest;
use App\Models\User;
use App\Services\TurnCommandService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

class SubmitTurnCommandController extends Controller
{
    public function __construct(private readonly TurnCommandService $turnCommandService) {}

    public function __invoke(SubmitTurnCommandRequest $request, string $game): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();

        try {
            $result = $this->turnCommandService->submit($owner, $game, $request->validated());
        } catch (TurnCommandRejected) {
            return $this->errorResponse(
                HttpResponse::HTTP_CONFLICT,
                'turn_command_not_available',
                'The turn command is not available at the current game boundary.',
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
                'The game engine returned an invalid turn command response.',
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
                    'stale_turn_command',
                    'The game has advanced since this command was prepared.',
                ],
                'idempotency_conflict' => [
                    'idempotency_key_reused',
                    'The Idempotency-Key was already used for a different command.',
                ],
                default => [
                    'turn_command_not_available',
                    'The game is not waiting for this owner to submit a turn command.',
                ],
            };

            return $this->errorResponse(HttpResponse::HTTP_CONFLICT, $code, $message);
        }

        return response()->json([
            'schema_version' => 'turn-command-v1',
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
