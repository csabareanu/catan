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
     * Claim and persist a deterministic initial-placement run when eligible.
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

        $response = $this->gameEngineClient->initialPlacementRun($payload);

        $this->persistResult($gameId, $payload, $response);
    }

    /**
     * Record a sanitized terminal failure unless canonical run history won the race.
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
            $game = Game::query()
                ->with('seats')
                ->lockForUpdate()
                ->find($gameId);

            if ($game === null
                || $this->hasCommittedBootstrap($game)
                || ! in_array($game->lifecycle_status, ['queued', 'running'], true)) {
                return;
            }

            $this->validatePersistableResponse($game, $payload, $response);

            $data = $response['data'];
            $transitions = $data['transitions'];
            $lastEventSequence = 0;
            $state = [];
            $previousState = null;

            foreach ($transitions as $index => $transition) {
                $commandSequence = $index + 1;
                $command = GameCommand::create([
                    'game_id' => $game->getKey(),
                    'sequence' => $commandSequence,
                    'idempotency_key' => $this->transitionIdempotencyKey($game->getKey(), $transition, $previousState),
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

                    $lastEventSequence = max($lastEventSequence, $event['sequence']);
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

                $previousState = $state;
            }

            $game->forceFill([
                'lifecycle_status' => $data['stop_reason'] === 'human_input_required'
                    ? 'awaiting human input'
                    : 'running',
                'state_schema_version' => $transitions[array_key_last($transitions)]['state_schema_version'],
                'current_state' => $state,
                'result' => null,
                'last_command_sequence' => count($transitions),
                'last_event_sequence' => $lastEventSequence,
                'completed_at' => null,
                'failure_code' => null,
                'failure_message' => null,
            ])->save();
        });
    }

    /**
     * Keep setup transition identity stable across queue retries.
     *
     * @param  array<string, mixed>  $transition
     * @param  array<string, mixed>|null  $previousState
     */
    private function transitionIdempotencyKey(int $gameId, array $transition, ?array $previousState): string
    {
        if ($transition['command_type'] === 'place_initial_settlement_and_road.v1'
            && ! is_int($previousState['round'] ?? null)) {
            throw new GameEngineProtocolException('The initial placement run omitted the previous state round.');
        }

        return match ($transition['command_type']) {
            'bootstrap.v1' => BootstrapGameRun::idempotencyKey($gameId),
            'begin_initial_placement.v1' => 'initial-placement:start',
            'place_initial_settlement_and_road.v1' => sprintf(
                'initial-placement:%d:%d',
                $previousState['round'],
                $transition['acting_seat_number'],
            ),
        };
    }

    /**
     * Ensure the response still describes the game whose history is about to
     * be committed. The client validates the transport contract; this second
     * boundary validates identity against the persisted game configuration.
     *
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }  $payload
     * @param  array<string, mixed>  $response
     */
    private function validatePersistableResponse(Game $game, array $payload, array $response): void
    {
        $data = $response['data'] ?? null;
        $configuration = $game->configuration;
        $boardConfiguration = $game->board_configuration;
        $transitions = is_array($data) ? ($data['transitions'] ?? null) : null;
        $responseRuleset = is_array($data) ? ($data['ruleset'] ?? null) : null;
        $responseMap = is_array($data) ? ($data['map'] ?? null) : null;
        $bootstrapTransition = is_array($transitions) ? ($transitions[0] ?? null) : null;
        $finalTransition = is_array($transitions) && $transitions !== []
            ? $transitions[array_key_last($transitions)]
            : null;
        $bootstrapState = is_array($bootstrapTransition) ? ($bootstrapTransition['state'] ?? null) : null;
        $state = is_array($finalTransition) ? ($finalTransition['state'] ?? null) : null;
        $stateBoard = is_array($bootstrapState) ? ($bootstrapState['board'] ?? null) : null;
        $expectedSeats = $this->enginePayload($game)['seats'];

        if (! is_array($data)
            || ! is_array($configuration)
            || ! is_array($boardConfiguration)
            || ! is_array($responseRuleset)
            || ! is_array($responseMap)
            || ($data['setup_run_schema_version'] ?? null) !== '1'
            || ! in_array($data['stop_reason'] ?? null, ['human_input_required', 'turn_ready'], true)
            || ! is_array($transitions)
            || ! array_is_list($transitions)
            || count($transitions) < 2
            || ! is_array($bootstrapTransition)
            || ! is_array($finalTransition)
            || ! is_array($bootstrapState)
            || ! is_array($state)
            || ! is_array($stateBoard)
            || $payload !== $this->enginePayload($game)
            || ($data['seed'] ?? null) !== (string) $game->seed
            || ($responseRuleset['key'] ?? null) !== (string) $game->ruleset_key
            || ($responseRuleset['version'] ?? null) !== (string) $game->ruleset_version
            || ($responseMap['key'] ?? null) !== ($configuration['map_key'] ?? null)
            || ($responseMap['version'] ?? null) !== ($configuration['map_version'] ?? null)
            || ($bootstrapTransition['payload'] ?? null) !== $payload
            || $stateBoard !== $boardConfiguration
            || ! $this->matchesSeatConfiguration($bootstrapState['seats'] ?? null, $expectedSeats)
            || ! $this->matchesSeatConfiguration($state['seats'] ?? null, $expectedSeats)) {
            throw new GameEngineProtocolException(
                'The game engine returned setup data for a different persisted game.',
            );
        }
    }

    /**
     * @param  list<array{seat_number: int, controller_type: string}>  $expectedSeats
     */
    private function matchesSeatConfiguration(mixed $actualSeats, array $expectedSeats): bool
    {
        if (! is_array($actualSeats)
            || ! array_is_list($actualSeats)
            || count($actualSeats) !== count($expectedSeats)) {
            return false;
        }

        foreach ($expectedSeats as $index => $expectedSeat) {
            $actualSeat = $actualSeats[$index] ?? null;

            if (! is_array($actualSeat)
                || ($actualSeat['seat_number'] ?? null) !== $expectedSeat['seat_number']
                || ($actualSeat['controller_type'] ?? null) !== $expectedSeat['controller_type']) {
                return false;
            }
        }

        return true;
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
