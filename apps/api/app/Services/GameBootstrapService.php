<?php

namespace App\Services;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Jobs\BootstrapGameRun;
use App\Models\Game;
use App\Models\GameCommand;
use App\Models\GameEvent;
use App\Models\GameSeat;
use App\Models\GameSnapshot;
use Illuminate\Support\Facades\DB;
use Throwable;

class GameBootstrapService
{
    public function __construct(private readonly GameEngineClient $gameEngineClient) {}

    /**
     * Claim and persist a deterministic bootstrap run when the game is eligible.
     */
    public function execute(int $gameId): void
    {
        $payload = DB::transaction(function () use ($gameId): ?array {
            $game = Game::query()
                ->with('seats')
                ->lockForUpdate()
                ->find($gameId);

            if ($game === null || $this->hasCommittedBootstrap($game) || ! in_array($game->lifecycle_status, ['queued', 'running'], true)) {
                return null;
            }

            $game->forceFill([
                'lifecycle_status' => 'running',
                'run_attempts' => $game->run_attempts + 1,
                'started_at' => $game->started_at ?? now(),
            ])->save();

            return $this->enginePayload($game);
        });

        if ($payload === null) {
            return;
        }

        $response = $this->gameEngineClient->bootstrapRun($payload);

        $this->persistResult($gameId, $payload, $response);
    }

    /**
     * Record a sanitized terminal failure unless canonical bootstrap history won the race.
     */
    public function recordFailure(int $gameId, ?Throwable $exception): void
    {
        [$failureCode, $failureMessage] = $this->failureMetadata($exception);

        DB::transaction(function () use ($gameId, $failureCode, $failureMessage): void {
            $game = Game::query()->lockForUpdate()->find($gameId);

            if ($game === null
                || $this->hasCommittedBootstrap($game)
                || ! in_array($game->lifecycle_status, ['queued', 'running'], true)) {
                return;
            }

            $game->forceFill([
                'lifecycle_status' => 'failed',
                'result' => null,
                'failure_code' => $failureCode,
                'failure_message' => $failureMessage,
                'completed_at' => now(),
            ])->save();
        });
    }

    private function hasCommittedBootstrap(Game $game): bool
    {
        return $game->commands()
            ->where('idempotency_key', BootstrapGameRun::idempotencyKey($game->getKey()))
            ->exists();
    }

    /**
     * @return array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }
     */
    private function enginePayload(Game $game): array
    {
        return [
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
        ];
    }

    /**
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }  $payload
     * @param  array<string, mixed>  $response
     */
    private function persistResult(int $gameId, array $payload, array $response): void
    {
        DB::transaction(function () use ($gameId, $payload, $response): void {
            $game = Game::query()->lockForUpdate()->find($gameId);

            if ($game === null
                || $this->hasCommittedBootstrap($game)
                || ! in_array($game->lifecycle_status, ['queued', 'running'], true)) {
                return;
            }

            $data = $response['data'];
            $state = $data['state'];
            $events = $data['events'];
            $command = GameCommand::create([
                'game_id' => $game->getKey(),
                'sequence' => 1,
                'idempotency_key' => BootstrapGameRun::idempotencyKey($game->getKey()),
                'acting_seat_number' => null,
                'command_type' => 'bootstrap.v1',
                'payload' => $payload,
                'accepted_at' => now(),
            ]);
            $lastEventSequence = 0;
            $occurredAt = now();

            foreach ($events as $event) {
                GameEvent::create([
                    'game_id' => $game->getKey(),
                    'command_id' => $command->getKey(),
                    'sequence' => $event['sequence'],
                    'event_type' => $event['event_type'],
                    'payload' => $event['payload'],
                    'visibility' => $event['visibility'],
                    'visible_to_seat_number' => $event['visible_to_seat_number'],
                    'occurred_at' => $occurredAt,
                ]);

                $lastEventSequence = max($lastEventSequence, $event['sequence']);
            }

            GameSnapshot::create([
                'game_id' => $game->getKey(),
                'command_sequence' => 1,
                'event_sequence' => $lastEventSequence,
                'state_schema_version' => $data['state_schema_version'],
                'state' => $state,
                'created_at' => now(),
            ]);

            $game->forceFill([
                'lifecycle_status' => 'running',
                'state_schema_version' => $data['state_schema_version'],
                'current_state' => $state,
                'result' => null,
                'last_command_sequence' => 1,
                'last_event_sequence' => $lastEventSequence,
                'completed_at' => null,
                'failure_code' => null,
                'failure_message' => null,
            ])->save();
        });
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function failureMetadata(?Throwable $exception): array
    {
        return match (true) {
            $exception instanceof GameEngineUnavailable => [
                'game_engine_unavailable',
                'The game engine was unavailable after all retry attempts.',
            ],
            $exception instanceof GameEngineProtocolException => [
                'game_engine_protocol',
                'The game engine returned an invalid response.',
            ],
            default => [
                'game_execution_failed',
                'The game execution failed unexpectedly.',
            ],
        };
    }
}
