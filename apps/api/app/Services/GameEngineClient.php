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
        $body = $this->post('/v1/boards/generate', $payload);

        if (! $this->isBoardResponse($body)) {
            throw new GameEngineProtocolException('The game engine returned an invalid board response.');
        }

        return $body;
    }

    /**
     * Bootstrap a deterministic run through the stateless Go service.
     *
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     * @return array<string, mixed>
     */
    public function bootstrapRun(array $payload): array
    {
        $body = $this->post('/v1/runs/bootstrap', $payload);

        if (! $this->isBootstrapResponse($body, $payload)) {
            throw new GameEngineProtocolException('The game engine returned an invalid bootstrap response.');
        }

        return $body;
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function post(string $path, array $payload): mixed
    {
        try {
            $response = Http::baseUrl($this->baseUrl)
                ->acceptJson()
                ->asJson()
                ->timeout($this->timeout)
                ->post($path, $payload);
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

        return $response->json();
    }

    private function isBoardResponse(mixed $body): bool
    {
        return is_array($body) && $this->isBoardData($body['data'] ?? null);
    }

    private function isBoardData(mixed $data): bool
    {
        if (! is_array($data)) {
            return false;
        }

        return is_string($data['board_schema_version'] ?? null)
            && is_string($data['seed'] ?? null)
            && $this->isRulesetData($data['ruleset'] ?? null)
            && $this->isMapData($data['map'] ?? null)
            && is_array($data['hexes'] ?? null)
            && is_array($data['vertices'] ?? null)
            && is_array($data['edges'] ?? null)
            && is_array($data['ports'] ?? null);
    }

    /**
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     */
    private function isBootstrapResponse(mixed $body, array $payload): bool
    {
        if (! is_array($body) || ! is_array($body['data'] ?? null)) {
            return false;
        }

        $data = $body['data'];
        $ruleset = $data['ruleset'] ?? null;
        $map = $data['map'] ?? null;
        $state = $data['state'] ?? null;
        $events = $data['events'] ?? null;

        if (($data['execution_schema_version'] ?? null) !== '1'
            || ($data['state_schema_version'] ?? null) !== 'state-v1'
            || ($data['seed'] ?? null) !== $payload['seed']
            || ! $this->isRulesetData($ruleset)
            || ($ruleset['key'] ?? null) !== $payload['ruleset_key']
            || ! $this->isMapData($map)
            || ($map['key'] ?? null) !== $payload['map_key']
            || ! is_array($state)
            || ($state['phase'] ?? null) !== 'initialized'
            || ! $this->isBoardData($state['board'] ?? null)
            || (($state['board']['board_schema_version'] ?? null) !== '1')
            || ! $this->isBoardMetadataConsistent($state['board'], $data)
            || ! $this->isSeatList($state['seats'] ?? null, $payload['seats'])
            || ! $this->isEventList($events, $payload['seed'], count($payload['seats']))) {
            return false;
        }

        return true;
    }

    private function isRulesetData(mixed $ruleset): bool
    {
        return is_array($ruleset)
            && is_string($ruleset['key'] ?? null)
            && is_string($ruleset['version'] ?? null);
    }

    private function isMapData(mixed $map): bool
    {
        return is_array($map)
            && is_string($map['key'] ?? null)
            && is_string($map['version'] ?? null)
            && is_string($map['orientation'] ?? null);
    }

    /**
     * @param  list<array{seat_number: int, controller_type: 'human'|'ai'}>|null  $expectedSeats
     */
    private function isSeatList(mixed $seats, ?array $expectedSeats = null): bool
    {
        if (! is_array($seats)
            || ! array_is_list($seats)
            || ! in_array(count($seats), [3, 4], true)) {
            return false;
        }

        foreach ($seats as $index => $seat) {
            if (! is_array($seat)
                || ($seat['seat_number'] ?? null) !== $index + 1
                || ! in_array($seat['controller_type'] ?? null, ['human', 'ai'], true)) {
                return false;
            }

            if ($expectedSeats !== null) {
                $expectedSeat = $expectedSeats[$index] ?? null;

                if (! is_array($expectedSeat)
                    || ($seat['seat_number'] ?? null) !== ($expectedSeat['seat_number'] ?? null)
                    || ($seat['controller_type'] ?? null) !== ($expectedSeat['controller_type'] ?? null)) {
                    return false;
                }
            }
        }

        return true;
    }

    private function isBoardMetadataConsistent(array $board, array $responseData): bool
    {
        $ruleset = $responseData['ruleset'] ?? null;
        $map = $responseData['map'] ?? null;
        $boardRuleset = $board['ruleset'] ?? null;
        $boardMap = $board['map'] ?? null;

        return is_array($ruleset)
            && is_array($map)
            && is_array($boardRuleset)
            && is_array($boardMap)
            && ($board['seed'] ?? null) === ($responseData['seed'] ?? null)
            && ($boardRuleset['key'] ?? null) === ($ruleset['key'] ?? null)
            && ($boardRuleset['version'] ?? null) === ($ruleset['version'] ?? null)
            && ($boardMap['key'] ?? null) === ($map['key'] ?? null)
            && ($boardMap['version'] ?? null) === ($map['version'] ?? null)
            && ($boardMap['orientation'] ?? null) === ($map['orientation'] ?? null);
    }

    private function isEventList(mixed $events, string $seed, int $seatCount): bool
    {
        if (! is_array($events) || ! array_is_list($events) || $events === []) {
            return false;
        }

        foreach ($events as $index => $event) {
            if (! is_array($event)
                || ($event['sequence'] ?? null) !== $index + 1
                || ! is_string($event['event_type'] ?? null)
                || ($event['event_type'] ?? '') === ''
                || ! is_array($event['payload'] ?? null)
                || ! in_array($event['visibility'] ?? null, ['public', 'seat_private'], true)
                || ! array_key_exists('visible_to_seat_number', $event)) {
                return false;
            }

            $visibleToSeatNumber = $event['visible_to_seat_number'];

            if (($event['visibility'] === 'public' && $visibleToSeatNumber !== null)
                || ($event['visibility'] === 'seat_private'
                    && (! is_int($visibleToSeatNumber)
                        || $visibleToSeatNumber < 1
                        || $visibleToSeatNumber > $seatCount))) {
                return false;
            }
        }

        return $this->isInitializationEvent($events[0], $seed, $seatCount);
    }

    private function isInitializationEvent(mixed $event, string $seed, int $seatCount): bool
    {
        if (! is_array($event) || ! is_array($event['payload'] ?? null)) {
            return false;
        }

        $payload = $event['payload'];

        return ($event['sequence'] ?? null) === 1
            && ($event['event_type'] ?? null) === 'game_initialized.v1'
            && ($payload['seed'] ?? null) === $seed
            && ($payload['seat_count'] ?? null) === $seatCount
            && ($event['visibility'] ?? null) === 'public'
            && array_key_exists('visible_to_seat_number', $event)
            && $event['visible_to_seat_number'] === null;
    }
}
