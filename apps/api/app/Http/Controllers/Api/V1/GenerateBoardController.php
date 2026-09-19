<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\GenerateBoardRequest;
use App\Services\GameEngineClient;
use Illuminate\Http\JsonResponse;

class GenerateBoardController extends Controller
{
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Handle the incoming request.
     */
    public function __invoke(GenerateBoardRequest $request): JsonResponse
    {
        try {
            return response()->json($this->gameEngineClient->generateBoard($request->validated()));
        } catch (GameEngineUnavailable) {
            return $this->errorResponse(
                503,
                'game_engine_unavailable',
                'The board generation service is unavailable.',
            );
        } catch (GameEngineProtocolException) {
            return $this->errorResponse(
                502,
                'invalid_game_engine_response',
                'The board generation service returned an invalid response.',
            );
        }
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
