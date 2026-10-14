<?php

namespace Tests\Feature;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Jobs\BootstrapGameRun;
use App\Models\Game;
use App\Models\GameCommand;
use App\Models\GameEvent;
use App\Models\GameSnapshot;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

class GameRunTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_an_owner_can_queue_a_created_game_once(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();
        Queue::fake();
        Http::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertStatus(202)
            ->assertJsonPath('data.id', $game->id)
            ->assertJsonPath('data.lifecycle_status', 'queued');
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'lifecycle_status' => 'queued',
        ]);
        Queue::assertPushed(BootstrapGameRun::class, function (BootstrapGameRun $job) use ($game): bool {
            return $job->gameId === $game->id;
        });
        Queue::assertPushedTimes(BootstrapGameRun::class, 1);
        Http::assertNothingSent();
    }

    public function test_an_observable_queue_dispatch_failure_is_retryable(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();
        Http::fake();
        Queue::fake()->beforePushing(function (): never {
            throw new RuntimeException('queue storage unavailable');
        });

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertStatus(503)->assertExactJson([
            'error' => [
                'code' => 'queue_dispatch_failed',
                'message' => 'The game could not be queued for execution.',
            ],
        ]);
        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame('queue_dispatch_failed', $game->failure_code);
        $this->assertSame(
            'The game could not be queued for execution.',
            $game->failure_message,
        );
        $this->assertNotNull($game->completed_at);
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();

        Queue::fake();

        $retryResponse = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $retryResponse->assertStatus(202)
            ->assertJsonPath('data.lifecycle_status', 'queued');
        Queue::assertPushedTimes(BootstrapGameRun::class, 1);
        Queue::assertPushed(BootstrapGameRun::class, function (BootstrapGameRun $job) use ($game): bool {
            return $job->gameId === $game->id;
        });
    }

    public function test_bootstrap_job_persists_the_canonical_state_and_history(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        $engineResponse = $this->bootstrapResponse($game);
        Http::fake([
            '*' => Http::response($engineResponse, 200),
        ]);

        $this->runBootstrapJob($game);

        $game->refresh();
        $command = GameCommand::query()->where('game_id', $game->id)->sole();
        $event = GameEvent::query()->where('game_id', $game->id)->sole();
        $snapshot = GameSnapshot::query()->where('game_id', $game->id)->sole();

        $this->assertSame('running', $game->lifecycle_status);
        $this->assertSame(1, $game->run_attempts);
        $this->assertNotNull($game->started_at);
        $this->assertNull($game->completed_at);
        $this->assertNull($game->result);
        $this->assertSame('state-v1', $game->state_schema_version);
        $this->assertSame($engineResponse['data']['state'], $game->current_state);
        $this->assertSame(1, $game->last_command_sequence);
        $this->assertSame(1, $game->last_event_sequence);

        $this->assertSame(1, $command->sequence);
        $this->assertSame(BootstrapGameRun::idempotencyKey($game->id), $command->idempotency_key);
        $this->assertNull($command->acting_seat_number);
        $this->assertSame('bootstrap.v1', $command->command_type);
        $this->assertSame($this->bootstrapPayload($game), $command->payload);

        $this->assertSame($command->id, $event->command_id);
        $this->assertSame(1, $event->sequence);
        $this->assertSame('game_initialized.v1', $event->event_type);
        $this->assertSame($engineResponse['data']['events'][0]['payload'], $event->payload);
        $this->assertSame('public', $event->visibility);
        $this->assertNull($event->visible_to_seat_number);
        $this->assertNotNull($event->occurred_at);

        $this->assertSame(1, $snapshot->command_sequence);
        $this->assertSame(1, $snapshot->event_sequence);
        $this->assertSame('state-v1', $snapshot->state_schema_version);
        $this->assertSame($engineResponse['data']['state'], $snapshot->state);

        Http::assertSent(function (ClientRequest $request) use ($game): bool {
            return $request->data() === $this->bootstrapPayload($game);
        });
    }

    public function test_bootstrap_job_can_resume_a_running_game_without_history(): void
    {
        $startedAt = now()->subMinute()->startOfSecond();
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'running',
            'run_attempts' => 3,
            'started_at' => $startedAt,
        ]);
        Http::fake([
            '*' => Http::response($this->bootstrapResponse($game), 200),
        ]);

        $this->runBootstrapJob($game);

        $game->refresh();
        $this->assertSame(4, $game->run_attempts);
        $this->assertSame($startedAt->timestamp, $game->started_at->timestamp);
        $this->assertSame('running', $game->lifecycle_status);
        $this->assertDatabaseCount('game_commands', 1);
        $this->assertDatabaseCount('game_events', 1);
        $this->assertDatabaseCount('game_snapshots', 1);
    }

    public function test_duplicate_bootstrap_delivery_does_not_call_engine_or_duplicate_history(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        Http::fake([
            '*' => Http::response($this->bootstrapResponse($game), 200),
        ]);

        $this->runBootstrapJob($game);
        $this->runBootstrapJob($game);

        Http::assertSentCount(1);
        $this->assertDatabaseCount('game_commands', 1);
        $this->assertDatabaseCount('game_events', 1);
        $this->assertDatabaseCount('game_snapshots', 1);
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'run_attempts' => 1,
            'last_command_sequence' => 1,
            'last_event_sequence' => 1,
        ]);
    }

    public function test_a_stale_bootstrap_job_does_not_run_a_terminal_game(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'completed',
        ]);
        Http::fake();

        $this->runBootstrapJob($game);

        Http::assertNothingSent();
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'lifecycle_status' => 'completed',
            'run_attempts' => 0,
        ]);
    }

    public function test_bootstrap_job_has_a_bounded_retry_policy(): void
    {
        $job = new BootstrapGameRun(1);

        $this->assertSame(3, $job->tries());
        $this->assertSame([5, 30], $job->backoff());
    }

    public function test_engine_unavailability_is_retried_without_terminal_failure(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        Http::fake(function (): never {
            throw new ConnectionException('connection refused');
        });

        $job = new BootstrapGameRun($game->getKey());

        try {
            app()->call([$job, 'handle']);
            $this->fail('The unavailable engine exception was not rethrown.');
        } catch (GameEngineUnavailable $exception) {
            $this->assertSame('The game engine could not be reached.', $exception->getMessage());
        }

        $game->refresh();
        $this->assertSame('running', $game->lifecycle_status);
        $this->assertSame(1, $game->run_attempts);
        $this->assertNull($game->failure_code);
        $this->assertNull($game->failure_message);
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_exhausted_engine_unavailability_marks_the_game_failed(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        $attemptCount = 0;
        Http::fake(function () use (&$attemptCount): never {
            $attemptCount++;
            throw new ConnectionException('connection refused');
        });

        $lastException = null;
        $lastJob = null;

        for ($attempt = 1; $attempt <= 3; $attempt++) {
            $lastJob = new BootstrapGameRun($game->getKey());

            try {
                app()->call([$lastJob, 'handle']);
                $this->fail('The unavailable engine exception was not rethrown.');
            } catch (GameEngineUnavailable $exception) {
                $lastException = $exception;
            }
        }

        $this->assertNotNull($lastJob);
        $this->assertNotNull($lastException);
        $lastJob->failed($lastException);

        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame(3, $game->run_attempts);
        $this->assertNotNull($game->started_at);
        $this->assertNotNull($game->completed_at);
        $this->assertSame('game_engine_unavailable', $game->failure_code);
        $this->assertSame(
            'The game engine was unavailable after all retry attempts.',
            $game->failure_message,
        );
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        $this->assertSame(3, $attemptCount);
    }

    public function test_protocol_failure_marks_the_game_failed_without_history(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        Http::fake([
            '*' => Http::response([
                'error' => [
                    'code' => 'invalid_seats',
                    'message' => 'The bootstrap run must contain three or four unique seats.',
                ],
            ], 422),
        ]);

        $job = (new BootstrapGameRun($game->getKey()))->withFakeQueueInteractions();
        app()->call([$job, 'handle']);

        $job->assertFailedWith(GameEngineProtocolException::class);
        $this->assertNotNull($job->job->failedWith);
        $job->failed($job->job->failedWith);

        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame(1, $game->run_attempts);
        $this->assertSame('game_engine_protocol', $game->failure_code);
        $this->assertSame(
            'The game engine returned an invalid response.',
            $game->failure_message,
        );
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        Http::assertSentCount(1);
    }

    public function test_malformed_engine_response_marks_the_game_failed_without_history(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        $engineResponse = $this->bootstrapResponse($game);
        unset($engineResponse['data']['state']);
        Http::fake([
            '*' => Http::response($engineResponse, 200),
        ]);

        $job = (new BootstrapGameRun($game->getKey()))->withFakeQueueInteractions();
        app()->call([$job, 'handle']);

        $job->assertFailedWith(GameEngineProtocolException::class);
        $this->assertNotNull($job->job->failedWith);
        $job->failed($job->job->failedWith);

        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame(1, $game->run_attempts);
        $this->assertNotNull($game->completed_at);
        $this->assertNull($game->result);
        $this->assertSame('game_engine_protocol', $game->failure_code);
        $this->assertSame(
            'The game engine returned an invalid response.',
            $game->failure_message,
        );
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        Http::assertSentCount(1);
    }

    public function test_persisted_bootstrap_metadata_mismatch_marks_the_game_failed_without_history(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        $engineResponse = $this->bootstrapResponse($game);
        $engineResponse['data']['ruleset']['version'] = '9.9.9';
        $engineResponse['data']['state']['board']['ruleset']['version'] = '9.9.9';
        Http::fake([
            '*' => Http::response($engineResponse, 200),
        ]);

        $job = (new BootstrapGameRun($game->getKey()))->withFakeQueueInteractions();
        app()->call([$job, 'handle']);

        $job->assertFailedWith(GameEngineProtocolException::class);
        $this->assertNotNull($job->job->failedWith);
        $job->failed($job->job->failedWith);

        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame('game_engine_protocol', $game->failure_code);
        $this->assertSame(
            'The game engine returned an invalid response.',
            $game->failure_message,
        );
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_unexpected_failure_marks_the_game_failed_with_sanitized_metadata(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        Http::fake(function (): never {
            throw new RuntimeException('database password must not be persisted');
        });

        $job = (new BootstrapGameRun($game->getKey()))->withFakeQueueInteractions();
        app()->call([$job, 'handle']);

        $job->assertFailedWith(RuntimeException::class);
        $this->assertNotNull($job->job->failedWith);
        $job->failed($job->job->failedWith);

        $game->refresh();
        $this->assertSame('failed', $game->lifecycle_status);
        $this->assertSame(1, $game->run_attempts);
        $this->assertSame('game_execution_failed', $game->failure_code);
        $this->assertSame(
            'The game execution failed unexpectedly.',
            $game->failure_message,
        );
        $this->assertStringNotContainsString('database password', $game->failure_message);
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_persistence_failure_rolls_back_history_before_marking_the_game_failed(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        $engineResponse = $this->bootstrapResponse($game);
        Http::fake([
            '*' => Http::response($engineResponse, 200),
        ]);

        GameSnapshot::creating(static function (): never {
            throw new RuntimeException('snapshot persistence unavailable');
        });

        try {
            $job = (new BootstrapGameRun($game->getKey()))->withFakeQueueInteractions();
            app()->call([$job, 'handle']);

            $job->assertFailed();
            $this->assertNotNull($job->job->failedWith);
            $job->failed($job->job->failedWith);

            $game->refresh();
            $this->assertSame('failed', $game->lifecycle_status);
            $this->assertSame('game_execution_failed', $game->failure_code);
            $this->assertDatabaseCount('game_commands', 0);
            $this->assertDatabaseCount('game_events', 0);
            $this->assertDatabaseCount('game_snapshots', 0);
        } finally {
            GameSnapshot::flushEventListeners();
        }
    }

    public function test_a_late_failure_callback_does_not_overwrite_a_successful_bootstrap(): void
    {
        $game = $this->gameWithSeats([
            'lifecycle_status' => 'queued',
        ]);
        Http::fake([
            '*' => Http::response($this->bootstrapResponse($game), 200),
        ]);

        $this->runBootstrapJob($game);
        $job = new BootstrapGameRun($game->getKey());
        $job->failed(new GameEngineProtocolException('late failure'));

        $game->refresh();
        $this->assertSame('running', $game->lifecycle_status);
        $this->assertNull($game->failure_code);
        $this->assertNull($game->failure_message);
        $this->assertNull($game->completed_at);
        $this->assertDatabaseCount('game_commands', 1);
        $this->assertDatabaseCount('game_events', 1);
        $this->assertDatabaseCount('game_snapshots', 1);
    }

    public function test_repeated_start_requests_do_not_queue_duplicate_jobs(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();
        Queue::fake();
        Http::fake();

        $firstResponse = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');
        $secondResponse = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $firstResponse->assertStatus(202);
        $secondResponse->assertStatus(202)
            ->assertJsonPath('data.lifecycle_status', 'queued');
        Queue::assertPushedTimes(BootstrapGameRun::class, 1);
        Http::assertNothingSent();
    }

    public function test_a_failed_game_without_bootstrap_history_can_be_requeued(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'lifecycle_status' => 'failed',
            'failure_code' => 'game_engine_unavailable',
            'failure_message' => 'The engine timed out.',
            'completed_at' => now(),
            'run_attempts' => 3,
        ]);
        Queue::fake();
        Http::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertStatus(202)
            ->assertJsonPath('data.lifecycle_status', 'queued');
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'lifecycle_status' => 'queued',
            'failure_code' => null,
            'failure_message' => null,
            'completed_at' => null,
            'run_attempts' => 3,
        ]);
        Queue::assertPushedTimes(BootstrapGameRun::class, 1);
        Http::assertNothingSent();
    }

    public function test_a_saved_human_game_is_not_queued_again(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'lifecycle_status' => 'awaiting human input',
        ]);
        Queue::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertOk()
            ->assertJsonPath('data.lifecycle_status', 'awaiting human input');
        Queue::assertNothingPushed();
    }

    public function test_a_completed_game_cannot_be_started_again(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'lifecycle_status' => 'completed',
        ]);
        Queue::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertStatus(409)->assertExactJson([
            'error' => [
                'code' => 'game_run_not_startable',
                'message' => 'The game cannot be started in its current state.',
            ],
        ]);
        Queue::assertNothingPushed();
    }

    public function test_a_failed_game_with_bootstrap_history_cannot_be_started_again(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'lifecycle_status' => 'failed',
        ]);
        GameCommand::factory()->for($game, 'game')->create([
            'idempotency_key' => BootstrapGameRun::idempotencyKey($game->id),
        ]);
        Queue::fake();

        $response = $this->withToken($token)->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertStatus(409)->assertExactJson([
            'error' => [
                'code' => 'game_run_not_startable',
                'message' => 'The game cannot be started in its current state.',
            ],
        ]);
        Queue::assertNothingPushed();
    }

    public function test_a_foreign_or_missing_game_is_not_revealed(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $foreignGame = Game::factory()->for($otherUser, 'owner')->create();
        Queue::fake();

        $expectedError = [
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ];

        $this->withToken($token)
            ->postJson('/api/v1/games/'.$foreignGame->id.'/run')
            ->assertNotFound()
            ->assertExactJson($expectedError);
        $this->withToken($token)
            ->postJson('/api/v1/games/999999/run')
            ->assertNotFound()
            ->assertExactJson($expectedError);
        Queue::assertNothingPushed();
    }

    public function test_an_unauthenticated_request_cannot_start_a_game(): void
    {
        $game = Game::factory()->create();
        Queue::fake();

        $response = $this->postJson('/api/v1/games/'.$game->id.'/run');

        $response->assertUnauthorized()->assertExactJson([
            'error' => [
                'code' => 'unauthenticated',
                'message' => 'Authentication is required.',
            ],
        ]);
        Queue::assertNothingPushed();
        $this->assertDatabaseHas('games', [
            'id' => $game->id,
            'lifecycle_status' => 'created',
        ]);
    }

    private function runBootstrapJob(Game $game): void
    {
        $job = new BootstrapGameRun($game->getKey());

        app()->call([$job, 'handle']);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function gameWithSeats(array $attributes = []): Game
    {
        $game = Game::factory()->create($attributes);
        $game->seats()->create([
            'seat_number' => 1,
            'controller_type' => 'human',
            'user_id' => $game->owner_id,
            'label' => 'Human',
        ]);
        $game->seats()->create([
            'seat_number' => 2,
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI 1',
        ]);
        $game->seats()->create([
            'seat_number' => 3,
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI 2',
        ]);

        return $game->load('seats');
    }

    /**
     * @return array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }
     */
    private function bootstrapPayload(Game $game): array
    {
        return [
            'seed' => $game->seed,
            'ruleset_key' => $game->ruleset_key,
            'map_key' => $game->configuration['map_key'],
            'seats' => [
                ['seat_number' => 1, 'controller_type' => 'human'],
                ['seat_number' => 2, 'controller_type' => 'ai'],
                ['seat_number' => 3, 'controller_type' => 'ai'],
            ],
        ];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    private function bootstrapResponse(Game $game): array
    {
        $board = $game->board_configuration;

        return [
            'data' => [
                'execution_schema_version' => '1',
                'state_schema_version' => 'state-v1',
                'seed' => $game->seed,
                'ruleset' => [
                    'key' => $game->ruleset_key,
                    'version' => $game->ruleset_version,
                ],
                'map' => $board['map'],
                'state' => [
                    'phase' => 'initialized',
                    'board' => $board,
                    'seats' => $this->bootstrapPayload($game)['seats'],
                ],
                'events' => [
                    [
                        'sequence' => 1,
                        'event_type' => 'game_initialized.v1',
                        'payload' => [
                            'seed' => $game->seed,
                            'seat_count' => $game->seat_count,
                        ],
                        'visibility' => 'public',
                        'visible_to_seat_number' => null,
                    ],
                ],
            ],
        ];
    }
}
