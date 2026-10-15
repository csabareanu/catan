<?php

namespace App\Services;

use App\Models\Game;
use App\Models\GameEvent;
use App\Models\GameSeat;
use App\Models\GameSnapshot;
use Illuminate\Support\Collection;

class GameReplayProjection
{
    /**
     * Canonical state fields that are safe to expose as changing public frame data.
     *
     * Immutable board and seat data are deliberately supplied by the replay
     * context instead of being copied into every frame.
     *
     * @var list<string>
     */
    private const PUBLIC_STATE_FIELDS = [
        'phase',
        'active_seat_number',
        'turn_phase',
        'robber_position',
        'roads',
        'buildings',
        'public_awards',
        'public_scores',
    ];

    /**
     * Build the public replay-v1 document from already-loaded records.
     *
     * The caller supplies a bounded event collection and the selected full
     * snapshot separately from the metadata-only snapshot index. This keeps
     * query bounds and checkpoint selection visible at the endpoint boundary.
     *
     * @param  Collection<int, GameSeat>  $seats
     * @param  Collection<int, GameEvent>  $events
     * @param  Collection<int, GameSnapshot>  $snapshots
     * @return array<string, mixed>
     */
    public function project(
        Game $game,
        Collection $seats,
        Collection $events,
        Collection $snapshots,
        ?GameSnapshot $frame,
        string $requestedAfterSequence,
        int $limit,
    ): array {
        $visibleEvents = $events
            ->filter(fn (GameEvent $event): bool => $this->isVisibleEvent($game, $event))
            ->filter(fn (GameEvent $event): bool => $event->sequence > (int) $requestedAfterSequence)
            ->sortBy(fn (GameEvent $event): int => $event->sequence)
            ->values();
        $eventPage = $visibleEvents->take($limit)->values();
        $lastEvent = $eventPage->last();
        $hasMore = $visibleEvents->count() > $limit;

        return [
            'schema_version' => 'replay-v1',
            'context' => [
                'game' => $this->projectGameContext($game),
                'board' => $game->board_configuration ?? [],
                'seats' => $seats
                    ->sortBy(fn (GameSeat $seat): int => $seat->seat_number)
                    ->map(fn (GameSeat $seat): array => $this->projectSeat($seat))
                    ->values()
                    ->all(),
            ],
            'events' => $eventPage
                ->map(fn (GameEvent $event): array => $this->projectEvent($event))
                ->all(),
            'event_cursor' => [
                'requested_after_sequence' => $requestedAfterSequence,
                'returned_through_sequence' => $lastEvent instanceof GameEvent
                    ? (string) $lastEvent->sequence
                    : null,
                'has_more' => $hasMore,
                'next_after_sequence' => $hasMore && $lastEvent instanceof GameEvent
                    ? (string) $lastEvent->sequence
                    : null,
            ],
            'snapshot_index' => $snapshots
                ->sortBy(fn (GameSnapshot $snapshot): int => $snapshot->command_sequence)
                ->map(fn (GameSnapshot $snapshot): array => $this->projectSnapshotIndex($snapshot))
                ->values()
                ->all(),
            'frame' => $frame instanceof GameSnapshot
                ? $this->projectFrame($frame)
                : null,
        ];
    }

    /**
     * Determine whether an event belongs in the owner's or spectator view.
     */
    private function isVisibleEvent(Game $game, GameEvent $event): bool
    {
        if ($event->visibility === 'public') {
            return $event->visible_to_seat_number === null;
        }

        return $event->visibility === 'seat_private'
            && $game->human_seat_number !== null
            && $event->visible_to_seat_number === $game->human_seat_number;
    }

    /**
     * @return array<string, mixed>
     */
    private function projectGameContext(Game $game): array
    {
        return [
            'id' => $game->getKey(),
            'mode' => $game->mode,
            'lifecycle_status' => $game->lifecycle_status,
            'ruleset_key' => $game->ruleset_key,
            'ruleset_version' => $game->ruleset_version,
            'state_schema_version' => $game->state_schema_version,
            'seed' => $game->seed,
            'seat_count' => $game->seat_count,
            'human_seat_number' => $game->human_seat_number,
            'started_at' => $game->started_at?->toISOString(),
            'completed_at' => $game->completed_at?->toISOString(),
            'created_at' => $game->created_at?->toISOString(),
        ];
    }

    /**
     * @return array{seat_number: int, controller_type: string, label: string|null}
     */
    private function projectSeat(GameSeat $seat): array
    {
        return [
            'seat_number' => $seat->seat_number,
            'controller_type' => $seat->controller_type,
            'label' => $seat->label,
        ];
    }

    /**
     * @return array{sequence: string, event_type: string, payload: array<string, mixed>, occurred_at: string|null}
     */
    private function projectEvent(GameEvent $event): array
    {
        return [
            'sequence' => (string) $event->sequence,
            'event_type' => $event->event_type,
            'payload' => is_array($event->payload) ? $event->payload : [],
            'occurred_at' => $event->occurred_at?->toISOString(),
        ];
    }

    /**
     * @return array{command_sequence: string, event_sequence: string, state_schema_version: string, created_at: string|null}
     */
    private function projectSnapshotIndex(GameSnapshot $snapshot): array
    {
        return [
            'command_sequence' => (string) $snapshot->command_sequence,
            'event_sequence' => (string) $snapshot->event_sequence,
            'state_schema_version' => $snapshot->state_schema_version,
            'created_at' => $snapshot->created_at?->toISOString(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function projectFrame(GameSnapshot $snapshot): array
    {
        $state = is_array($snapshot->state) ? $snapshot->state : [];

        return [
            'command_sequence' => (string) $snapshot->command_sequence,
            'event_sequence' => (string) $snapshot->event_sequence,
            'state_schema_version' => $snapshot->state_schema_version,
            'public_projection_schema_version' => 'replay-public-v1',
            'public_state' => $this->projectPublicState($state),
            'viewer_state' => null,
        ];
    }

    /**
     * @param  array<string, mixed>  $state
     * @return array<string, mixed>
     */
    private function projectPublicState(array $state): array
    {
        return collect(self::PUBLIC_STATE_FIELDS)
            ->filter(fn (string $field): bool => array_key_exists($field, $state))
            ->mapWithKeys(fn (string $field): array => [$field => $state[$field]])
            ->all();
    }
}
