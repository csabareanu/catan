<?php

namespace App\Services;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class GameEngineClient
{
    private readonly string $baseUrl;

    private readonly float $timeout;

    /**
     * Create a new class instance.
     */
    public function __construct()
    {
        $this->baseUrl = rtrim((string) config('services.game_engine.url'), '/');
        $this->timeout = (float) config('services.game_engine.timeout', 2.0);
    }

    /**
     * Generate a board through the stateless Go service.
     *
     * @param  array{seed: string, ruleset_key: string, map_key: string}  $payload
     * @return array<string, mixed>
     */
    public function generateBoard(array $payload): array
    {
        try {
            $response = Http::baseUrl($this->baseUrl)
                ->acceptJson()
                ->asJson()
                ->timeout($this->timeout)
                ->post('/v1/boards/generate', $payload);
        } catch (ConnectionException $exception) {
            throw new GameEngineUnavailable(
                'The game engine could not be reached.',
                previous: $exception,
            );
        }

        if (! $response->successful()) {
            throw new GameEngineProtocolException(
                sprintf('The game engine returned HTTP %d.', $response->status()),
            );
        }

        $body = $response->json();

        if (! $this->isBoardResponse($body)) {
            throw new GameEngineProtocolException('The game engine returned an invalid board response.');
        }

        return $body;
    }

    private function isBoardResponse(mixed $body): bool
    {
        if (! is_array($body) || ! is_array($body['data'] ?? null)) {
            return false;
        }

        $data = $body['data'];
        $ruleset = $data['ruleset'] ?? null;
        $map = $data['map'] ?? null;

        return is_string($data['board_schema_version'] ?? null)
            && is_string($data['seed'] ?? null)
            && is_array($ruleset)
            && is_string($ruleset['key'] ?? null)
            && is_string($ruleset['version'] ?? null)
            && is_array($map)
            && is_string($map['key'] ?? null)
            && is_string($map['version'] ?? null)
            && is_string($map['orientation'] ?? null)
            && is_array($data['hexes'] ?? null)
            && is_array($data['vertices'] ?? null)
            && is_array($data['edges'] ?? null)
            && is_array($data['ports'] ?? null);
    }
}
