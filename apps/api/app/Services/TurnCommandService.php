<?php

namespace App\Services;

use App\Models\Game;
use App\Models\GameCommand;
use App\Models\GameEvent;
use App\Models\GameSeat;
use App\Models\GameSnapshot;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class TurnCommandService
{
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Validate, execute, and atomically persist one human turn command.
     *
     * @param  array{
     *     expected_command_sequence: string,
     *     command_type: 'roll_dice.v1'|'end_turn.v1',
     *     payload: array<mixed>,
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

            $humanSeatNumber = $this->ownerHumanSeatNumber($game, $owner);
            if ($humanSeatNumber === null) {
                return ['outcome' => 'unavailable'];
            }

            $existing = $game->commands()
                ->where('idempotency_key', $request['idempotency_key'])
                ->first();

            if ($existing !== null) {
                return $this->existingCommandResult($game, $existing, $request, $humanSeatNumber);
            }

            if (! $this->isHumanCommandBoundary($game, $humanSeatNumber)) {
                return ['outcome' => 'unavailable'];
            }

            if ($request['expected_command_sequence'] !== (string) $game->last_command_sequence) {
                return ['outcome' => 'stale'];
            }

            $engineResponse = $this->gameEngineClient->turnCommand([
                'state_schema_version' => $game->state_schema_version,
                'state' => $game->current_state,
                'next_event_sequence' => $game->last_event_sequence + 1,
                'command' => [
                    'command_type' => $request['command_type'],
                    'acting_seat_number' => $humanSeatNumber,
                    'payload' => (object) [],
                ],
            ]);
            $data = $engineResponse['data'];
            $commandSequence = $game->last_command_sequence + 1;
            $events = $data['events'];
            $lastEventSequence = $events[array_key_last($events)]['sequence'];
            $state = $data['state'];
            $lifecycleStatus = $this->lifecycleStatusForState($state, $humanSeatNumber);
            $acceptedAt = now();

            $command = GameCommand::create([
                'game_id' => $game->getKey(),
                'sequence' => $commandSequence,
                'idempotency_key' => $request['idempotency_key'],
                'acting_seat_number' => $humanSeatNumber,
                'command_type' => $request['command_type'],
                'payload' => [],
                'decision_metadata' => null,
                'accepted_at' => $acceptedAt,
            ]);

            foreach ($events as $event) {
                GameEvent::create([
                    'game_id' => $game->getKey(),
                    'command_id' => $command->getKey(),
                    'sequence' => $event['sequence'],
                    'event_type' => $event['event_type'],
                    'payload' => $event['payload'],
                    'visibility' => $event['visibility'],
                    'visible_to_seat_number' => $event['visible_to_seat_number'],
                    'occurred_at' => $acceptedAt,
                ]);
            }

            GameSnapshot::create([
                'game_id' => $game->getKey(),
                'command_sequence' => $commandSequence,
                'event_sequence' => $lastEventSequence,
                'state_schema_version' => $data['state_schema_version'],
                'state' => $state,
                'created_at' => $acceptedAt,
            ]);

            $game->forceFill([
                'lifecycle_status' => $lifecycleStatus,
                'state_schema_version' => $data['state_schema_version'],
                'current_state' => $state,
                'last_command_sequence' => $commandSequence,
                'last_event_sequence' => $lastEventSequence,
            ])->save();

            return $this->acceptedResult(
                false,
                $lifecycleStatus,
                $commandSequence,
                $lastEventSequence,
            );
        });
    }

    /**
     * @return array{outcome: 'idempotency_conflict'}|array{
     *     outcome: 'accepted',
     *     data: array{
     *         replayed: bool,
     *         lifecycle_status: string,
     *         last_command_sequence: string,
     *         last_event_sequence: string
     *     }
     * }
     */
    private function existingCommandResult(Game $game, GameCommand $existing, array $request, int $humanSeatNumber): array
    {
        if ($existing->command_type !== $request['command_type']
            || $existing->acting_seat_number !== $humanSeatNumber
            || $existing->payload !== []
            || $request['expected_command_sequence'] !== (string) ($existing->sequence - 1)) {
            return ['outcome' => 'idempotency_conflict'];
        }

        $snapshot = $game->snapshots()
            ->where('command_sequence', $existing->sequence)
            ->first();

        if ($snapshot === null || ! is_array($snapshot->state)) {
            return ['outcome' => 'idempotency_conflict'];
        }

        return $this->acceptedResult(
            true,
            $this->lifecycleStatusForState($snapshot->state, $humanSeatNumber),
            $existing->sequence,
            $snapshot->event_sequence,
        );
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
    private function acceptedResult(bool $replayed, string $lifecycleStatus, int $commandSequence, int $eventSequence): array
    {
        return [
            'outcome' => 'accepted',
            'data' => [
                'replayed' => $replayed,
                'lifecycle_status' => $lifecycleStatus,
                'last_command_sequence' => (string) $commandSequence,
                'last_event_sequence' => (string) $eventSequence,
            ],
        ];
    }

    private function ownerHumanSeatNumber(Game $game, User $owner): ?int
    {
        $humanSeatNumber = $game->human_seat_number;

        if (! is_int($humanSeatNumber)) {
            return null;
        }

        $ownerSeat = $game->seats->first(function (GameSeat $seat) use ($owner, $humanSeatNumber): bool {
            return $seat->seat_number === $humanSeatNumber
                && $seat->controller_type === 'human'
                && $seat->user_id === $owner->getKey();
        });

        return $ownerSeat === null ? null : $humanSeatNumber;
    }

    private function isHumanCommandBoundary(Game $game, int $humanSeatNumber): bool
    {
        $state = $game->current_state;

        if (! is_array($state)) {
            return false;
        }

        if ($game->state_schema_version === 'state-v2') {
            if ($game->lifecycle_status !== 'running'
                || ($state['phase'] ?? null) !== 'turn_ready'
                || ($state['active_seat_number'] ?? null) !== 0
                || ! is_array($state['seat_order'] ?? null)
                || ! array_is_list($state['seat_order'])) {
                return false;
            }

            $activeSeatNumber = $state['seat_order'][0] ?? null;
        } elseif ($game->state_schema_version === 'state-v3') {
            if ($game->lifecycle_status !== 'awaiting human input'
                || ($state['phase'] ?? null) !== 'normal_turn') {
                return false;
            }

            $activeSeatNumber = $state['active_seat_number'] ?? null;
        } else {
            return false;
        }

        if (! is_int($activeSeatNumber)
            || $activeSeatNumber !== $humanSeatNumber
            || ! is_array($state['seats'] ?? null)) {
            return false;
        }

        foreach ($state['seats'] as $seat) {
            if (is_array($seat) && ($seat['seat_number'] ?? null) === $activeSeatNumber) {
                return ($seat['controller_type'] ?? null) === 'human';
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $state
     */
    private function lifecycleStatusForState(array $state, int $humanSeatNumber): string
    {
        return ($state['active_seat_number'] ?? null) === $humanSeatNumber
            ? 'awaiting human input'
            : 'running';
    }
}
