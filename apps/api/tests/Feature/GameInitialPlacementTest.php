<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameEvent;
use App\Models\User;
use App\Services\InitialPlacementService;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GameInitialPlacementTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_an_owner_receives_legal_options_for_their_saved_human_setup_boundary(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $pair = $this->firstLegalPairFromFixture();
        $engineResponse = $this->optionsResponse($game->current_state, [$pair]);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/initial-placement/options' => Http::response($engineResponse, 200),
        ]);

        $response = $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertOk()->assertExactJson([
            'schema_version' => 'initial-placement-options-v1',
            'data' => [
                'command_sequence' => '2',
                'active_seat_number' => 1,
                'round' => 1,
                'options' => [$pair],
            ],
        ]);
        $response->assertJsonMissingPath('data.state')
            ->assertJsonMissingPath('data.players')
            ->assertJsonMissingPath('data.resources');

        Http::assertSent(function (ClientRequest $request) use ($game): bool {
            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/initial-placement/options'
                && $request->data() === [
                    'state_schema_version' => 'state-v2',
                    'state' => $game->current_state,
                ];
        });
        Http::assertSentCount(1);
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_a_different_owner_cannot_request_another_games_options(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();

        $response = $this->withToken($otherUser->createToken('test-client')->plainTextToken)
            ->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertNotFound()->assertExactJson([
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ]);
        Http::assertNothingSent();
    }

    public function test_options_are_unavailable_outside_the_saved_human_setup_boundary(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $game->forceFill(['lifecycle_status' => 'running'])->save();
        Http::preventStrayRequests();
        Http::fake();

        $response = $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertConflict()->assertJsonPath('error.code', 'initial_placement_not_available');
        Http::assertNothingSent();
    }

    public function test_options_are_unavailable_when_the_active_state_seat_is_not_the_owners_seat(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $state = $game->current_state;
        $state['active_seat_number'] = 3;
        $game->forceFill(['current_state' => $state])->save();
        Http::preventStrayRequests();
        Http::fake();

        $response = $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertConflict()->assertJsonPath('error.code', 'initial_placement_not_available');
        Http::assertNothingSent();
    }

    public function test_an_invalid_engine_options_response_is_rejected_without_leaking_it_to_the_owner(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $invalidResponse = $this->optionsResponse($game->current_state, [$this->firstLegalPairFromFixture()]);
        $invalidResponse['data']['round'] = 2;
        $invalidResponse['data']['resources'] = ['lumber' => 99];
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/initial-placement/options' => Http::response($invalidResponse, 200),
        ]);

        $response = $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertStatus(502)->assertExactJson([
            'error' => [
                'code' => 'invalid_game_engine_response',
                'message' => 'The game engine returned invalid initial placement options.',
            ],
        ]);
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_options_require_authentication(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();

        $response = $this->getJson('/api/v1/games/'.$game->id.'/initial-placement/options');

        $response->assertUnauthorized();
        Http::assertNothingSent();
    }

    public function test_owner_submission_persists_the_human_command_and_ai_continuation_in_order(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $savedInputState = $game->current_state;
        $pair = $this->firstLegalPairFromFixture();
        $engineResponse = $this->continuationResponse($game, 6);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response($engineResponse, 200),
        ]);

        $response = $this->submitPlacement($owner, $game, $pair, 'human-setup-command-1', '2');

        $response->assertOk()->assertExactJson([
            'schema_version' => 'initial-placement-command-v1',
            'data' => [
                'replayed' => false,
                'lifecycle_status' => 'awaiting human input',
                'last_command_sequence' => '7',
                'last_event_sequence' => '14',
            ],
        ]);

        $game->refresh();
        $this->assertSame(7, $game->last_command_sequence);
        $this->assertSame(14, $game->last_event_sequence);
        $this->assertSame('awaiting human input', $game->lifecycle_status);
        $this->assertSame($engineResponse['data']['transitions'][4]['state'], $game->current_state);

        $commands = $game->commands()->get();
        $this->assertSame([3, 4, 5, 6, 7], $commands->pluck('sequence')->all());
        $this->assertSame([
            'human-setup-command-1',
            'initial-placement:1:3',
            'initial-placement:1:2',
            'initial-placement:2:2',
            'initial-placement:2:3',
        ], $commands->pluck('idempotency_key')->all());
        $this->assertNull($commands[0]->decision_metadata);
        $this->assertSame('random_placement.v1', $commands[1]->decision_metadata['policy_version']);
        $this->assertSame([3, 4, 5, 6, 7], $game->snapshots()->pluck('command_sequence')->all());
        $this->assertSame([4, 6, 8, 11, 14], $game->snapshots()->pluck('event_sequence')->all());
        $this->assertSame(range(3, 14), $game->events()->pluck('sequence')->all());
        $this->assertSame(5, $game->snapshots()->count());

        Http::assertSent(function (ClientRequest $request) use ($game, $pair, $savedInputState): bool {
            $body = $request->data();

            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/runs/initial-placement/continue'
                && ($body['state_schema_version'] ?? null) === 'state-v2'
                && ($body['state'] ?? null) === $savedInputState
                && ($body['game_configuration']['seed'] ?? null) === (string) $game->seed
                && ($body['game_configuration']['ruleset_key'] ?? null) === $game->ruleset_key
                && ($body['game_configuration']['map_key'] ?? null) === $game->configuration['map_key']
                && ($body['next_event_sequence'] ?? null) === 3
                && ($body['command']['command_type'] ?? null) === 'place_initial_settlement_and_road.v1'
                && ($body['command']['acting_seat_number'] ?? null) === 1
                && ($body['command']['payload'] ?? null) === $pair;
        });
        Http::assertSentCount(1);
    }

    public function test_a_submission_that_reaches_turn_ready_leaves_the_game_running(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner, 6);
        $pair = $this->initialPlacementFixture()['data']['transitions'][7]['payload'];
        $engineResponse = $this->continuationResponse($game, 7);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response($engineResponse, 200),
        ]);

        $this->submitPlacement($owner, $game, $pair, 'human-setup-command-final', '7')
            ->assertOk()
            ->assertExactJson([
                'schema_version' => 'initial-placement-command-v1',
                'data' => [
                    'replayed' => false,
                    'lifecycle_status' => 'running',
                    'last_command_sequence' => '8',
                    'last_event_sequence' => '18',
                ],
            ]);

        $game->refresh();
        $this->assertSame('running', $game->lifecycle_status);
        $this->assertSame('turn_ready', $game->current_state['phase']);
        $this->assertSame(8, $game->last_command_sequence);
        $this->assertSame(18, $game->last_event_sequence);
    }

    public function test_a_matching_retry_is_reported_as_replayed_without_calling_the_engine_again(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $pair = $this->firstLegalPairFromFixture();
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response(
                $this->continuationResponse($game, 6),
                200,
            ),
        ]);

        $this->submitPlacement($owner, $game, $pair, 'retryable-human-key', '2')->assertOk();
        $retry = $this->submitPlacement($owner, $game, $pair, 'retryable-human-key', '2');

        $retry->assertOk()->assertJsonPath('data.replayed', true)
            ->assertJsonPath('data.last_command_sequence', '7')
            ->assertJsonPath('data.last_event_sequence', '14');
        $this->assertSame(5, $game->commands()->count());
        $this->assertSame(12, $game->events()->count());
        $this->assertSame(5, $game->snapshots()->count());
        Http::assertSentCount(1);
    }

    public function test_reusing_an_idempotency_key_for_a_different_payload_conflicts(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $pair = $this->firstLegalPairFromFixture();
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response(
                $this->continuationResponse($game, 6),
                200,
            ),
        ]);

        $this->submitPlacement($owner, $game, $pair, 'single-use-human-key', '2')->assertOk();
        $differentPair = [
            'settlement_vertex_id' => 'vertex:unused',
            'road_edge_id' => 'edge:unused',
        ];

        $this->submitPlacement($owner, $game, $differentPair, 'single-use-human-key', '2')
            ->assertConflict()
            ->assertJsonPath('error.code', 'idempotency_key_reused');

        $this->assertSame(5, $game->commands()->count());
        Http::assertSentCount(1);
    }

    public function test_a_stale_command_sequence_does_not_call_the_engine_or_write_history(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();

        $this->submitPlacement(
            $owner,
            $game,
            $this->firstLegalPairFromFixture(),
            'stale-human-key',
            '1',
        )->assertConflict()->assertJsonPath('error.code', 'stale_initial_placement');

        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        Http::assertNothingSent();
    }

    public function test_an_illegal_engine_rejection_does_not_write_history(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response([
                'error' => [
                    'code' => 'illegal_placement',
                    'message' => 'The engine message is not returned to the client.',
                ],
            ], 422),
        ]);

        $this->submitPlacement(
            $owner,
            $game,
            ['settlement_vertex_id' => 'vertex:illegal', 'road_edge_id' => 'edge:illegal'],
            'illegal-human-key',
            '2',
        )->assertUnprocessable()->assertExactJson([
            'error' => [
                'code' => 'illegal_initial_placement',
                'message' => 'The selected settlement and road are not a legal setup placement.',
            ],
        ]);

        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_an_invalid_continuation_response_is_rejected_without_writing_history(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $invalidResponse = $this->continuationResponse($game, 6);
        $invalidResponse['data']['transitions'][1]['events'][0]['sequence'] = 200;
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response($invalidResponse, 200),
        ]);

        $this->submitPlacement(
            $owner,
            $game,
            $this->firstLegalPairFromFixture(),
            'invalid-response-human-key',
            '2',
        )->assertStatus(502)->assertJsonPath('error.code', 'invalid_game_engine_response');

        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
    }

    public function test_another_owner_cannot_submit_a_placement(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();

        $this->submitPlacement(
            $otherUser,
            $game,
            $this->firstLegalPairFromFixture(),
            'foreign-human-key',
            '2',
        )->assertNotFound()->assertJsonPath('error.code', 'game_not_found');

        Http::assertNothingSent();
    }

    public function test_submission_requires_authentication_and_the_idempotency_header(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();
        $body = [
            'expected_command_sequence' => '2',
            ...$this->firstLegalPairFromFixture(),
        ];

        $this->postJson('/api/v1/games/'.$game->id.'/initial-placement', $body)->assertUnauthorized();
        $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->postJson('/api/v1/games/'.$game->id.'/initial-placement', $body)
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed');

        Http::assertNothingSent();
    }

    public function test_submission_rejects_client_supplied_state_or_seat_identity(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        Http::preventStrayRequests();
        Http::fake();

        $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->withHeader('Idempotency-Key', 'client-seat-is-not-authoritative')
            ->postJson('/api/v1/games/'.$game->id.'/initial-placement', [
                'expected_command_sequence' => '2',
                ...$this->firstLegalPairFromFixture(),
                'state' => $game->current_state,
                'acting_seat_number' => 1,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonStructure(['error' => ['fields' => ['state', 'acting_seat_number']]]);

        Http::assertNothingSent();
    }

    public function test_a_database_failure_rolls_back_all_commands_events_and_snapshots(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtHumanSetupBoundary($owner);
        $pair = $this->firstLegalPairFromFixture();
        $engineResponse = $this->continuationResponse($game, 6);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement/continue' => Http::response($engineResponse, 200),
        ]);
        GameEvent::create([
            'game_id' => $game->getKey(),
            'command_id' => null,
            'sequence' => 5,
            'event_type' => 'test.collision',
            'payload' => [],
            'visibility' => 'public',
            'visible_to_seat_number' => null,
            'occurred_at' => now(),
        ]);

        try {
            app(InitialPlacementService::class)->submit($owner, (string) $game->getKey(), [
                'expected_command_sequence' => '2',
                ...$pair,
                'idempotency_key' => 'database-failure-human-key',
            ]);
            $this->fail('Expected the event sequence collision to abort the transaction.');
        } catch (QueryException) {
            // The test collision proves the DB constraint fails after earlier inserts begin.
        }

        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 1);
        $this->assertDatabaseCount('game_snapshots', 0);
        $game->refresh();
        $this->assertSame(2, $game->last_command_sequence);
        $this->assertSame(2, $game->last_event_sequence);
        $this->assertSame('awaiting human input', $game->lifecycle_status);
    }

    /**
     * @return array{settlement_vertex_id: string, road_edge_id: string}
     */
    private function firstLegalPairFromFixture(): array
    {
        $fixture = $this->initialPlacementFixture();

        return $fixture['data']['transitions'][2]['payload'];
    }

    /**
     * @param  list<array{settlement_vertex_id: string, road_edge_id: string}>  $options
     * @return array{data: array<string, mixed>}
     */
    private function optionsResponse(array $state, array $options): array
    {
        return [
            'data' => [
                'initial_placement_options_schema_version' => '1',
                'active_seat_number' => $state['active_seat_number'],
                'round' => $state['round'],
                'options' => $options,
            ],
        ];
    }

    private function gameAtHumanSetupBoundary(User $owner, int $transitionIndex = 1): Game
    {
        $fixture = $this->initialPlacementFixture();
        $state = $fixture['data']['transitions'][$transitionIndex]['state'];
        $board = $fixture['data']['transitions'][0]['state']['board'];
        $state['board'] = $board;
        $seats = [
            ['seat_number' => 1, 'controller_type' => 'human'],
            ['seat_number' => 2, 'controller_type' => 'ai'],
            ['seat_number' => 3, 'controller_type' => 'ai'],
        ];
        $state['seats'] = $seats;

        $game = Game::factory()->for($owner, 'owner')->create([
            'mode' => 'human_vs_ai',
            'ruleset_key' => $board['ruleset']['key'],
            'ruleset_version' => $board['ruleset']['version'],
            'seed' => $board['seed'],
            'seat_count' => count($seats),
            'human_seat_number' => 1,
            'lifecycle_status' => 'awaiting human input',
            'configuration' => [
                'ai_count' => 2,
                'map_key' => $board['map']['key'],
                'map_version' => $board['map']['version'],
                'board_schema_version' => $board['board_schema_version'],
            ],
            'board_configuration' => $board,
            'state_schema_version' => 'state-v2',
            'current_state' => $state,
            'last_command_sequence' => $transitionIndex + 1,
            'last_event_sequence' => $this->lastEventSequence($fixture['data']['transitions'][$transitionIndex]),
        ]);

        foreach ($seats as $seat) {
            $game->seats()->create([
                ...$seat,
                'user_id' => $seat['seat_number'] === 1 ? $owner->getKey() : null,
                'label' => $seat['seat_number'] === 1 ? 'Human' : 'AI '.($seat['seat_number'] - 1),
            ]);
        }

        return $game->load('seats');
    }

    /**
     * @return array{data: array{transitions: list<array<string, mixed>>}}
     */
    private function initialPlacementFixture(): array
    {
        $fixturePath = __DIR__.'/../Fixtures/initial-placement-ai-run.json';

        return json_decode((string) file_get_contents($fixturePath), true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * @param  array{settlement_vertex_id: string, road_edge_id: string}  $pair
     */
    private function submitPlacement(
        User $owner,
        Game $game,
        array $pair,
        string $idempotencyKey,
        string $expectedCommandSequence,
    ) {
        return $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->withHeader('Idempotency-Key', $idempotencyKey)
            ->postJson('/api/v1/games/'.$game->id.'/initial-placement', [
                'expected_command_sequence' => $expectedCommandSequence,
                ...$pair,
            ]);
    }

    /**
     * @return array{data: array{setup_continuation_schema_version: string, stop_reason: string, transitions: list<array<string, mixed>>}}
     */
    private function continuationResponse(Game $game, int $lastTransitionIndex): array
    {
        $fixture = $this->initialPlacementFixture();
        $sourceTransitions = $fixture['data']['transitions'];
        $board = $sourceTransitions[0]['state']['board'];
        $seats = [
            ['seat_number' => 1, 'controller_type' => 'human'],
            ['seat_number' => 2, 'controller_type' => 'ai'],
            ['seat_number' => 3, 'controller_type' => 'ai'],
        ];
        $firstTransitionIndex = $game->last_command_sequence;
        $transitions = [];

        for ($index = $firstTransitionIndex; $index <= $lastTransitionIndex; $index++) {
            $transition = $sourceTransitions[$index];
            $transition['state']['board'] = $board;
            $transition['state']['seats'] = $seats;
            if ($index === $firstTransitionIndex) {
                $transition['decision_metadata'] = null;
            }
            $transitions[] = $transition;
        }

        $finalTransition = $transitions[array_key_last($transitions)];

        return [
            'data' => [
                'setup_continuation_schema_version' => '1',
                'stop_reason' => $finalTransition['state']['phase'] === 'turn_ready'
                    ? 'turn_ready'
                    : 'human_input_required',
                'transitions' => $transitions,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $transition
     */
    private function lastEventSequence(array $transition): int
    {
        $events = $transition['events'];

        return $events[array_key_last($events)]['sequence'];
    }
}
