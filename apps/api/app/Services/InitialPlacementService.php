<?php

namespace App\Services;

use App\Exceptions\GameEngineProtocolException;
use App\Models\Game;
use App\Models\GameCommand;
use App\Models\GameEvent;
use App\Models\GameSeat;
use App\Models\GameSnapshot;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class InitialPlacementService
{
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Return Go-generated legal options only at this owner's saved setup boundary.
     *
     * @return array{available: false}|array{
     *     available: true,
     *     data: array{
     *         command_sequence: string,
     *         active_seat_number: int,
     *         round: int,
     *         options: list<array{settlement_vertex_id: string, road_edge_id: string}>
     *     }
     * }|null
     */
    public function options(User $owner, string $gameId): ?array
    {
        $game = $owner->ownedGames()->with('seats')->find($gameId);

        if ($game === null) {
            return null;
        }

        if (! $this->isHumanSetupBoundary($game, $owner)) {
            return ['available' => false];
        }

        $engineResponse = $this->gameEngineClient->initialPlacementOptions([
            'state_schema_version' => $game->state_schema_version,
            'state' => $game->current_state,
        ]);
        $data = $engineResponse['data'];

        return [
            'available' => true,
            'data' => [
                'command_sequence' => (string) $game->last_command_sequence,
                'active_seat_number' => $data['active_seat_number'],
                'round' => $data['round'],
                'options' => $data['options'],
            ],
        ];
    }

    /**
     * Validate and atomically persist one human setup command and its AI continuation.
     *
     * @param  array{
     *     expected_command_sequence: string,
     *     settlement_vertex_id: string,
     *     road_edge_id: string,
     *     idempotency_key: string
     * }  $request
     * @return array{outcome: 'unavailable'|'stale'|'idempotency_conflict'}|array{
     *     outcome: 'accepted',
     *     data: array{
     *         replayed: bool,
     *         lifecycle_status: string,
     *         last_command_sequence: string,
     *         last_event_sequence: string
     *     }
     * }|null
     */
    public function submit(User $owner, string $gameId, array $request): ?array
    {
        return DB::transaction(function () use ($owner, $gameId, $request): ?array {
            $game = $owner->ownedGames()
                ->with('seats')
                ->whereKey($gameId)
                ->lockForUpdate()
                ->first();

            if ($game === null) {
                return null;
            }

            $commandPayload = [
                'settlement_vertex_id' => $request['settlement_vertex_id'],
                'road_edge_id' => $request['road_edge_id'],
            ];
            $existing = $game->commands()
                ->where('idempotency_key', $request['idempotency_key'])
                ->first();

            if ($existing !== null) {
                if ($existing->command_type === 'place_initial_settlement_and_road.v1'
                    && $existing->acting_seat_number === $game->human_seat_number
                    && ($existing->payload['settlement_vertex_id'] ?? null) === $commandPayload['settlement_vertex_id']
                    && ($existing->payload['road_edge_id'] ?? null) === $commandPayload['road_edge_id']
                    && count($existing->payload ?? []) === 2) {
                    return $this->acceptedResult($game, true);
                }

                return ['outcome' => 'idempotency_conflict'];
            }

            if (! $this->isHumanSetupBoundary($game, $owner)) {
                return ['outcome' => 'unavailable'];
            }

            if ($request['expected_command_sequence'] !== (string) $game->last_command_sequence) {
                return ['outcome' => 'stale'];
            }

            $enginePayload = [
                'state_schema_version' => $game->state_schema_version,
                'state' => $game->current_state,
                'game_configuration' => [
                    'seed' => (string) $game->seed,
                    'ruleset_key' => (string) $game->ruleset_key,
                    'map_key' => (string) $game->configuration['map_key'],
                    'seats' => $game->seats
                        ->map(fn (GameSeat $seat): array => [
                            'seat_number' => (int) $seat->seat_number,
                            'controller_type' => (string) $seat->controller_type,
                        ])
                        ->values()
                        ->all(),
                ],
                'next_event_sequence' => $game->last_event_sequence + 1,
                'command' => [
                    'command_type' => 'place_initial_settlement_and_road.v1',
                    'acting_seat_number' => $game->human_seat_number,
                    'payload' => $commandPayload,
                ],
            ];

            $engineResponse = $this->gameEngineClient->continueInitialPlacement($enginePayload);
            $data = $engineResponse['data'];
            $transitions = $data['transitions'];
            $commandKeys = $this->transitionIdempotencyKeys($transitions, $request['idempotency_key']);

            if (count(array_unique($commandKeys)) !== count($commandKeys)
                || $game->commands()->whereIn('idempotency_key', $commandKeys)->exists()) {
                return ['outcome' => 'idempotency_conflict'];
            }

            $commandSequence = $game->last_command_sequence;
            $lastEventSequence = $game->last_event_sequence;
            $state = $game->current_state;

            foreach ($transitions as $index => $transition) {
                $commandSequence++;
                $command = GameCommand::create([
                    'game_id' => $game->getKey(),
                    'sequence' => $commandSequence,
                    'idempotency_key' => $commandKeys[$index],
                    'acting_seat_number' => $transition['acting_seat_number'],
                    'command_type' => $transition['command_type'],
                    'payload' => $transition['payload'],
                    'decision_metadata' => $transition['decision_metadata'],
                    'accepted_at' => now(),
                ]);

                foreach ($transition['events'] as $event) {
                    GameEvent::create([
                        'game_id' => $game->getKey(),
                        'command_id' => $command->getKey(),
                        'sequence' => $event['sequence'],
                        'event_type' => $event['event_type'],
                        'payload' => $event['payload'],
                        'visibility' => $event['visibility'],
                        'visible_to_seat_number' => $event['visible_to_seat_number'],
                        'occurred_at' => now(),
                    ]);
                    $lastEventSequence = $event['sequence'];
                }

                $state = $transition['state'];
                GameSnapshot::create([
                    'game_id' => $game->getKey(),
                    'command_sequence' => $commandSequence,
                    'event_sequence' => $lastEventSequence,
                    'state_schema_version' => $transition['state_schema_version'],
                    'state' => $state,
                    'created_at' => now(),
                ]);
            }

            $lifecycleStatus = $data['stop_reason'] === 'human_input_required'
                ? 'awaiting human input'
                : 'running';

            $game->forceFill([
                'lifecycle_status' => $lifecycleStatus,
                'state_schema_version' => $transitions[array_key_last($transitions)]['state_schema_version'],
                'current_state' => $state,
                'result' => null,
                'last_command_sequence' => $commandSequence,
                'last_event_sequence' => $lastEventSequence,
                'completed_at' => null,
                'failure_code' => null,
                'failure_message' => null,
            ])->save();

            return [
                'outcome' => 'accepted',
                'data' => [
                    'replayed' => false,
                    'lifecycle_status' => $lifecycleStatus,
                    'last_command_sequence' => (string) $commandSequence,
                    'last_event_sequence' => (string) $lastEventSequence,
                ],
            ];
        });
    }

    /**
     * @param  list<array<string, mixed>>  $transitions
     * @return list<string>
     */
    private function transitionIdempotencyKeys(array $transitions, string $humanKey): array
    {
        $keys = [];
        $previousState = null;

        foreach ($transitions as $index => $transition) {
            if ($index === 0) {
                $keys[] = $humanKey;
            } else {
                if (! is_int($previousState['round'] ?? null)
                    || ! is_int($transition['acting_seat_number'] ?? null)) {
                    throw new GameEngineProtocolException(
                        'The game engine omitted setup command identity data.',
                    );
                }

                $keys[] = sprintf(
                    'initial-placement:%d:%d',
                    $previousState['round'],
                    $transition['acting_seat_number'],
                );
            }

            $previousState = $transition['state'];
        }

        return $keys;
    }

    /**
     * @return array{
     *     outcome: 'accepted',
     *     data: array{
     *         replayed: bool,
     *         lifecycle_status: string,
     *         last_command_sequence: string,
     *         last_event_sequence: string
     *     }
     * }
     */
    private function acceptedResult(Game $game, bool $replayed): array
    {
        return [
            'outcome' => 'accepted',
            'data' => [
                'replayed' => $replayed,
                'lifecycle_status' => $game->lifecycle_status,
                'last_command_sequence' => (string) $game->last_command_sequence,
                'last_event_sequence' => (string) $game->last_event_sequence,
            ],
        ];
    }

    private function isHumanSetupBoundary(Game $game, User $owner): bool
    {
        $state = $game->current_state;

        if ($game->lifecycle_status !== 'awaiting human input'
            || $game->state_schema_version !== 'state-v2'
            || ! is_array($state)
            || ($state['phase'] ?? null) !== 'initial_placement'
            || ($state['step'] ?? null) !== 'place_initial_settlement_and_road'
            || ! in_array($state['round'] ?? null, [1, 2], true)
            || ! is_int($state['active_seat_number'] ?? null)
            || $state['active_seat_number'] !== $game->human_seat_number
            || ! is_array($state['seat_order'] ?? null)
            || ! is_array($state['seats'] ?? null)
            || ! in_array($state['active_seat_number'], $state['seat_order'], true)) {
            return false;
        }

        $ownerSeat = $game->seats->first(function (GameSeat $seat) use ($owner, $state): bool {
            return $seat->seat_number === $state['active_seat_number']
                && $seat->controller_type === 'human'
                && $seat->user_id === $owner->getKey();
        });

        if ($ownerSeat === null) {
            return false;
        }

        foreach ($state['seats'] ?? [] as $stateSeat) {
            if (is_array($stateSeat)
                && ($stateSeat['seat_number'] ?? null) === $state['active_seat_number']) {
                return ($stateSeat['controller_type'] ?? null) === 'human';
            }
        }

        return false;
    }
}
