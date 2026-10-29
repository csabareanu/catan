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
     * Run initial placement through the stateless Go service.
     *
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     * @return array<string, mixed>
     */
    public function initialPlacementRun(array $payload): array
    {
        $body = $this->post('/v1/runs/initial-placement', $payload);

        if (! $this->isInitialPlacementRunResponse($body, $payload)) {
            throw new GameEngineProtocolException('The game engine returned an invalid initial placement run response.');
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

    /**
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     */
    private function isInitialPlacementRunResponse(mixed $body, array $payload): bool
    {
        if (! is_array($body)
            || ! is_array($body['data'] ?? null)
            || ! $this->isSeatList($payload['seats'] ?? null)
        ) {
            return false;
        }

        $data = $body['data'];
        $ruleset = $data['ruleset'] ?? null;
        $map = $data['map'] ?? null;
        $transitions = $data['transitions'] ?? null;
        $seatCount = count($payload['seats']);

        if (($data['setup_run_schema_version'] ?? null) !== '1'
            || ($data['seed'] ?? null) !== $payload['seed']
            || ! $this->isRulesetData($ruleset)
            || ($ruleset['key'] ?? null) !== $payload['ruleset_key']
            || ! $this->isMapData($map)
            || ($map['key'] ?? null) !== $payload['map_key']
            || ! in_array($data['stop_reason'] ?? null, ['human_input_required', 'turn_ready'], true)
            || ! is_array($transitions)
            || ! array_is_list($transitions)
            || count($transitions) < 2
            || count($transitions) > 2 + 2 * $seatCount) {
            return false;
        }

        $bootstrap = $transitions[0] ?? null;

        if (! $this->isInitialPlacementBootstrapTransition($bootstrap, $data, $payload)) {
            return false;
        }

        $expectedEventSequence = count($bootstrap['events']) + 1;
        $setupStart = $transitions[1] ?? null;

        if (! $this->isInitialPlacementStartTransition($setupStart, $data, $payload, $expectedEventSequence)) {
            return false;
        }

        $expectedEventSequence += count($setupStart['events']);
        $previousState = $setupStart['state'];

        for ($index = 2; $index < count($transitions); $index++) {
            $transition = $transitions[$index];

            if (! $this->isInitialPlacementPolicyTransition(
                $transition,
                $previousState,
                $data,
                $payload,
                $expectedEventSequence,
            )) {
                return false;
            }

            $expectedEventSequence += count($transition['events']);
            $previousState = $transition['state'];
        }

        $activeSeatNumber = $previousState['active_seat_number'] ?? null;
        $activeSeat = is_int($activeSeatNumber) ? ($payload['seats'][$activeSeatNumber - 1] ?? null) : null;

        if ($data['stop_reason'] === 'human_input_required') {
            return ($previousState['phase'] ?? null) === 'initial_placement'
                && is_array($activeSeat)
                && ($activeSeat['seat_number'] ?? null) === $activeSeatNumber
                && ($activeSeat['controller_type'] ?? null) === 'human';
        }

        if (($previousState['phase'] ?? null) !== 'turn_ready'
            || ($previousState['active_seat_number'] ?? null) !== 0) {
            return false;
        }

        foreach ($payload['seats'] as $seat) {
            if ($seat['controller_type'] !== 'ai') {
                return false;
            }
        }

        $lastTransition = $transitions[array_key_last($transitions)];
        $lastEvents = $lastTransition['events'];
        $lastEvent = $lastEvents[array_key_last($lastEvents)];

        return ($lastEvent['event_type'] ?? null) === 'initial_placement_completed.v1';
    }

    /**
     * @param  array<string, mixed>  $responseData
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     */
    private function isInitialPlacementBootstrapTransition(mixed $transition, array $responseData, array $payload): bool
    {
        if (! is_array($transition)
            || ($transition['command_type'] ?? null) !== 'bootstrap.v1'
            || ! array_key_exists('acting_seat_number', $transition)
            || $transition['acting_seat_number'] !== null
            || ! array_key_exists('decision_metadata', $transition)
            || $transition['decision_metadata'] !== null
            || array_key_exists('command_sequence', $transition)
            || ($transition['state_schema_version'] ?? null) !== 'state-v1'
            || ! is_array($transition['payload'] ?? null)
            || ($transition['payload']['seed'] ?? null) !== $payload['seed']
            || ($transition['payload']['ruleset_key'] ?? null) !== $payload['ruleset_key']
            || ($transition['payload']['map_key'] ?? null) !== $payload['map_key']
            || ! $this->isSeatList($transition['payload']['seats'] ?? null, $payload['seats'])
            || ! is_array($transition['state'] ?? null)
            || ($transition['state']['phase'] ?? null) !== 'initialized'
            || ! $this->isBoardData($transition['state']['board'] ?? null)
            || ($transition['state']['board']['board_schema_version'] ?? null) !== '1'
            || ! $this->isBoardMetadataConsistent($transition['state']['board'], $responseData)
            || ! $this->isSeatList($transition['state']['seats'] ?? null, $payload['seats'])
            || ! is_array($transition['events'] ?? null)
            || ! array_is_list($transition['events'])
            || count($transition['events']) !== 1
            || ! $this->isPublicInitialPlacementRunEvent($transition['events'][0], 1, 'game_initialized.v1')
            || ! $this->isInitializationEvent($transition['events'][0], $payload['seed'], count($payload['seats']))) {
            return false;
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $responseData
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     */
    private function isInitialPlacementStartTransition(
        mixed $transition,
        array $responseData,
        array $payload,
        int $expectedEventSequence,
    ): bool {
        if (! is_array($transition)
            || ($transition['command_type'] ?? null) !== 'begin_initial_placement.v1'
            || ! array_key_exists('acting_seat_number', $transition)
            || $transition['acting_seat_number'] !== null
            || ! array_key_exists('decision_metadata', $transition)
            || $transition['decision_metadata'] !== null
            || array_key_exists('command_sequence', $transition)
            || ($transition['state_schema_version'] ?? null) !== 'state-v2'
            || ! is_array($transition['payload'] ?? null)
            || $transition['payload'] !== []
            || ! $this->isPlacementRunState($transition['state'] ?? null, $responseData, $payload['seats'])
            || ($transition['state']['phase'] ?? null) !== 'initial_placement'
            || ($transition['state']['round'] ?? null) !== 1
            || ($transition['state']['active_seat_number'] ?? null) !== ($transition['state']['seat_order'][0] ?? null)
            || ($transition['state']['step'] ?? null) !== 'place_initial_settlement_and_road'
            || ! is_array($transition['events'] ?? null)
            || ! array_is_list($transition['events'])
            || count($transition['events']) !== 1
            || ! $this->isPublicInitialPlacementRunEvent(
                $transition['events'][0],
                $expectedEventSequence,
                'initial_placement_started.v1',
            )) {
            return false;
        }

        $eventPayload = $transition['events'][0]['payload'];

        return ($eventPayload['seat_order'] ?? null) === $transition['state']['seat_order']
            && ($eventPayload['round'] ?? null) === 1
            && ($eventPayload['active_seat_number'] ?? null) === $transition['state']['active_seat_number'];
    }

    /**
     * @param  array<string, mixed>  $previousState
     * @param  array<string, mixed>  $responseData
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: 'human'|'ai'}>
     * }  $payload
     */
    private function isInitialPlacementPolicyTransition(
        mixed $transition,
        array $previousState,
        array $responseData,
        array $payload,
        int $expectedEventSequence,
    ): bool {
        if (! is_array($transition)
            || ($transition['command_type'] ?? null) !== 'place_initial_settlement_and_road.v1'
            || ! array_key_exists('acting_seat_number', $transition)
            || ! is_int($transition['acting_seat_number'])
            || $transition['acting_seat_number'] !== ($previousState['active_seat_number'] ?? null)
            || ! array_key_exists('decision_metadata', $transition)
            || ! is_array($transition['decision_metadata'])
            || ($transition['decision_metadata']['policy_version'] ?? null) !== 'random_placement.v1'
            || ! is_string($transition['decision_metadata']['option_id'] ?? null)
            || $transition['decision_metadata']['option_id'] === ''
            || array_key_exists('command_sequence', $transition)
            || ($transition['state_schema_version'] ?? null) !== 'state-v2'
            || ! is_array($transition['payload'] ?? null)
            || count($transition['payload']) !== 2
            || ! is_string($transition['payload']['settlement_vertex_id'] ?? null)
            || $transition['payload']['settlement_vertex_id'] === ''
            || ! is_string($transition['payload']['road_edge_id'] ?? null)
            || $transition['payload']['road_edge_id'] === ''
            || ! $this->isPlacementRunState($transition['state'] ?? null, $responseData, $payload['seats'])) {
            return false;
        }

        $actingSeatNumber = $transition['acting_seat_number'];
        $actingSeat = $payload['seats'][$actingSeatNumber - 1] ?? null;

        if (($previousState['phase'] ?? null) !== 'initial_placement'
            || ! is_array($actingSeat)
            || ($actingSeat['seat_number'] ?? null) !== $actingSeatNumber
            || ($actingSeat['controller_type'] ?? null) !== 'ai') {
            return false;
        }

        $previousPlayer = $previousState['players'][$actingSeatNumber - 1] ?? null;
        $nextPlayer = $transition['state']['players'][$actingSeatNumber - 1] ?? null;

        if (! is_array($previousPlayer)
            || ! is_array($nextPlayer)
            || count($nextPlayer['settlements']) !== count($previousPlayer['settlements']) + 1
            || count($nextPlayer['roads']) !== count($previousPlayer['roads']) + 1
            || ! in_array($transition['payload']['settlement_vertex_id'], $nextPlayer['settlements'], true)
            || ! in_array($transition['payload']['road_edge_id'], $nextPlayer['roads'], true)) {
            return false;
        }

        $expectedEventTypes = [
            'initial_settlement_placed.v1',
            'initial_road_placed.v1',
        ];

        if (($previousState['round'] ?? null) === 2) {
            $expectedEventTypes[] = 'initial_resources_granted.v1';
        }

        if (($transition['state']['phase'] ?? null) === 'turn_ready') {
            if (($previousState['round'] ?? null) !== 2) {
                return false;
            }

            $expectedEventTypes[] = 'initial_placement_completed.v1';
        }

        $events = $transition['events'] ?? null;

        if (! is_array($events) || ! array_is_list($events) || count($events) !== count($expectedEventTypes)) {
            return false;
        }

        foreach ($expectedEventTypes as $index => $eventType) {
            $event = $events[$index];

            if (! $this->isPublicInitialPlacementRunEvent($event, $expectedEventSequence + $index, $eventType)) {
                return false;
            }

            $eventPayload = $event['payload'];

            if ($index === 0
                && (($eventPayload['seat_number'] ?? null) !== $actingSeatNumber
                    || ($eventPayload['settlement_vertex_id'] ?? null) !== $transition['payload']['settlement_vertex_id'])) {
                return false;
            }

            if ($index === 1
                && (($eventPayload['seat_number'] ?? null) !== $actingSeatNumber
                    || ($eventPayload['settlement_vertex_id'] ?? null) !== $transition['payload']['settlement_vertex_id']
                    || ($eventPayload['road_edge_id'] ?? null) !== $transition['payload']['road_edge_id'])) {
                return false;
            }

            if ($eventType === 'initial_resources_granted.v1'
                && (($eventPayload['seat_number'] ?? null) !== $actingSeatNumber
                    || ! $this->isResourceCounts($eventPayload['resources'] ?? null))) {
                return false;
            }

            if ($eventType === 'initial_placement_completed.v1'
                && (($eventPayload['seat_order'] ?? null) !== $previousState['seat_order']
                    || ($eventPayload['next_phase'] ?? null) !== 'turn_ready')) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $responseData
     * @param  list<array{seat_number: int, controller_type: 'human'|'ai'}>  $expectedSeats
     */
    private function isPlacementRunState(mixed $state, array $responseData, array $expectedSeats): bool
    {
        if (! is_array($state)
            || ! in_array($state['phase'] ?? null, ['initial_placement', 'turn_ready'], true)
            || ! is_array($state['seat_order'] ?? null)
            || ! array_is_list($state['seat_order'])
            || count($state['seat_order']) !== count($expectedSeats)
            || ! is_int($state['round'] ?? null)
            || ! in_array($state['round'], [1, 2], true)
            || ! is_int($state['active_seat_number'] ?? null)
            || ! is_string($state['step'] ?? null)
            || ! $this->isBoardData($state['board'] ?? null)
            || ($state['board']['board_schema_version'] ?? null) !== '1'
            || ! $this->isBoardMetadataConsistent($state['board'], $responseData)
            || ! $this->isSeatList($state['seats'] ?? null, $expectedSeats)
            || ! is_array($state['players'] ?? null)
            || ! array_is_list($state['players'])
            || count($state['players']) !== count($expectedSeats)) {
            return false;
        }

        $expectedSeatNumbers = array_column($expectedSeats, 'seat_number');
        $seenSeatNumbers = [];

        foreach ($state['seat_order'] as $seatNumber) {
            if (! is_int($seatNumber)
                || ! in_array($seatNumber, $expectedSeatNumbers, true)
                || isset($seenSeatNumbers[$seatNumber])) {
                return false;
            }

            $seenSeatNumbers[$seatNumber] = true;
        }

        foreach ($state['players'] as $index => $player) {
            if (! is_array($player)
                || ($player['seat_number'] ?? null) !== $index + 1
                || ! $this->isResourceCounts($player['resources'] ?? null)
                || ! is_array($player['settlements'] ?? null)
                || ! array_is_list($player['settlements'])
                || ! is_array($player['roads'] ?? null)
                || ! array_is_list($player['roads'])) {
                return false;
            }

            foreach (array_merge($player['settlements'], $player['roads']) as $pieceId) {
                if (! is_string($pieceId) || $pieceId === '') {
                    return false;
                }
            }
        }

        if ($state['phase'] === 'turn_ready') {
            return $state['round'] === 2
                && $state['active_seat_number'] === 0
                && $state['step'] === '';
        }

        return in_array($state['active_seat_number'], $state['seat_order'], true)
            && $state['step'] === 'place_initial_settlement_and_road';
    }

    private function isPublicInitialPlacementRunEvent(mixed $event, int $expectedSequence, string $eventType): bool
    {
        return is_array($event)
            && ($event['sequence'] ?? null) === $expectedSequence
            && ($event['event_type'] ?? null) === $eventType
            && is_array($event['payload'] ?? null)
            && ($event['visibility'] ?? null) === 'public'
            && array_key_exists('visible_to_seat_number', $event)
            && $event['visible_to_seat_number'] === null;
    }

    private function isResourceCounts(mixed $resources): bool
    {
        if (! is_array($resources)) {
            return false;
        }

        foreach (['lumber', 'wool', 'grain', 'brick', 'ore'] as $resource) {
            if (! is_int($resources[$resource] ?? null) || $resources[$resource] < 0) {
                return false;
            }
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
