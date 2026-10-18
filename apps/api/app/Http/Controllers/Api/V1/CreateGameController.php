<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\GameCreationKeyConflict;
use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\CreateGameRequest;
use App\Http\Resources\Api\V1\GameResource;
use App\Models\User;
use App\Services\GameCreationService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class CreateGameController extends Controller
{
    public function __construct(private readonly GameCreationService $gameCreationService) {}

    /**
     * Handle the incoming request.
     */
    public function __invoke(CreateGameRequest $request): JsonResponse
    {
        /** @var User $owner */
        $owner = $request->user();
        try {
            $game = $this->gameCreationService->create($owner, $request->validated());
        } catch (GameCreationKeyConflict) {
            return $this->errorResponse(
                Response::HTTP_CONFLICT,
                'game_creation_key_conflict',
                'The creation key has already been used for a different game configuration.',
            );
        } catch (GameEngineUnavailable) {
            return $this->errorResponse(
                Response::HTTP_SERVICE_UNAVAILABLE,
                'game_engine_unavailable',
                'The board generation service is unavailable.',
            );
        } catch (GameEngineProtocolException) {
            return $this->errorResponse(
                Response::HTTP_BAD_GATEWAY,
                'invalid_game_engine_response',
                'The board generation service returned an invalid response.',
            );
        }

        $response = (new GameResource($game))->response();
        $response->setStatusCode($game->wasRecentlyCreated ? Response::HTTP_CREATED : Response::HTTP_OK);

        return $response;
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
