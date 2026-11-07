<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameSnapshot;
use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Tests\TestCase;

class GameTurnCommandTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_owner_roll_persists_state_private_events_and_cursors(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->assertSame('running', $game->lifecycle_status);
        $savedState = $game->current_state;
        $nextEventSequence = $game->last_event_sequence + 1;
        $engineResponse = $this->rollResponse($game, $nextEventSequence);
        $this->fakeTurnCommand($engineResponse);

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'human-roll-1');

        $lastCommandSequence = $game->last_command_sequence + 1;
        $lastEventSequence = $nextEventSequence + count($engineResponse['data']['events']) - 1;
        $response->assertOk()->assertExactJson([
            'schema_version' => 'turn-command-v1',
            'data' => [
                'replayed' => false,
                'lifecycle_status' => 'awaiting human input',
                'last_command_sequence' => (string) $lastCommandSequence,
                'last_event_sequence' => (string) $lastEventSequence,
            ],
        ]);

        $this->assertDatabaseHas('game_commands', [
            'game_id' => $game->id,
            'sequence' => $lastCommandSequence,
            'idempotency_key' => 'human-roll-1',
            'acting_seat_number' => 1,
            'command_type' => 'roll_dice.v1',
            'payload' => '[]',
        ]);
        $this->assertDatabaseHas('game_events', [
            'game_id' => $game->id,
            'sequence' => $nextEventSequence + 2,
            'event_type' => 'resources_produced.v1',
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 1,
        ]);
        $this->assertDatabaseHas('game_snapshots', [
            'game_id' => $game->id,
            'command_sequence' => $lastCommandSequence,
            'event_sequence' => $lastEventSequence,
            'state_schema_version' => 'state-v3',
            'state->turn_phase' => 'action',
        ]);

        $game->refresh();
        $this->assertSame('state-v3', $game->state_schema_version);
        $this->assertSame('action', $game->current_state['turn_phase']);
        $this->assertSame($engineResponse['data']['state'], $game->current_state);
        $this->assertSame($lastCommandSequence, $game->last_command_sequence);
        $this->assertSame($lastEventSequence, $game->last_event_sequence);
        $this->assertSame('awaiting human input', $game->lifecycle_status);

        Http::assertSent(function (ClientRequest $request) use ($savedState, $nextEventSequence): bool {
            $body = $request->data();
            $json = json_decode($request->body());

            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/turns/command'
                && ($body['state_schema_version'] ?? null) === 'state-v2'
                && ($body['state'] ?? null) === $savedState
                && ($body['next_event_sequence'] ?? null) === $nextEventSequence
                && ($body['command']['command_type'] ?? null) === 'roll_dice.v1'
                && ($body['command']['acting_seat_number'] ?? null) === 1
                && is_object($json->command->payload ?? null)
                && get_object_vars($json->command->payload) === [];
        });
        Http::assertSentCount(1);
    }

    public function test_owner_roll_persists_the_seven_boundary_without_production(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $nextEventSequence = $game->last_event_sequence + 1;
        $engineResponse = $this->rollResponse($game, $nextEventSequence, seven: true);
        $this->fakeTurnCommand($engineResponse);

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'human-roll-seven');

        $response->assertOk()->assertJsonPath('data.lifecycle_status', 'awaiting human input');
        $game->refresh();
        $this->assertSame('robber_required', $game->current_state['turn_phase']);
        $this->assertSame(7, $game->current_state['last_roll']['total']);
        $this->assertSame([
            'turn_started.v1',
            'dice_rolled.v1',
            'robber_required.v1',
        ], $game->events()->pluck('event_type')->all());
        $this->assertDatabaseCount('game_commands', 1);
        $this->assertDatabaseCount('game_snapshots', 1);
        Http::assertSentCount(1);
    }

    public function test_owner_end_turn_persists_the_next_ai_turn_and_marks_the_game_running(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtNormalTurn($owner, 'action');
        $previousCommandSequence = $game->last_command_sequence;
        $nextEventSequence = $game->last_event_sequence + 1;
        $nextSeat = $game->current_state['seat_order'][1];
        $state = $this->turnState($game, 'awaiting_roll', activeSeat: $nextSeat, lastRoll: null);
        $engineResponse = $this->turnResponse(
            'end_turn.v1',
            1,
            $state,
            [
                $this->event($nextEventSequence, 'turn_ended.v1', ['seat_number' => 1, 'round' => 1, 'turn_number' => 1]),
                $this->event($nextEventSequence + 1, 'turn_started.v1', ['seat_number' => $nextSeat, 'round' => 1, 'turn_number' => 2]),
            ],
        );
        $this->fakeTurnCommand($engineResponse);

        $response = $this->submit($owner, $game, 'end_turn.v1', (string) $game->last_command_sequence, 'human-end-1');

        $response->assertOk()->assertJsonPath('data.lifecycle_status', 'running');
        $game->refresh();
        $this->assertSame($nextSeat, $game->current_state['active_seat_number']);
        $this->assertSame('awaiting_roll', $game->current_state['turn_phase']);
        $this->assertNull($game->current_state['last_roll']);
        $this->assertSame('running', $game->lifecycle_status);
        $this->assertSame(['turn_ended.v1', 'turn_started.v1'], $game->events()->pluck('event_type')->all());
        $this->assertSame($previousCommandSequence + 1, $game->last_command_sequence);
        $this->assertSame($nextEventSequence + 1, $game->last_event_sequence);
    }

    public function test_matching_idempotency_retry_returns_the_original_cursors_without_duplicate_history(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $engineResponse = $this->rollResponse($game, $game->last_event_sequence + 1);
        $this->fakeTurnCommand($engineResponse);
        $sequence = (string) $game->last_command_sequence;

        $first = $this->submit($owner, $game, 'roll_dice.v1', $sequence, 'retryable-roll');
        $retry = $this->submit($owner, $game, 'roll_dice.v1', $sequence, 'retryable-roll');

        $first->assertOk()->assertJsonPath('data.replayed', false);
        $retry->assertOk()->assertJsonPath('data.replayed', true);
        $this->assertSame($first->json('data.last_command_sequence'), $retry->json('data.last_command_sequence'));
        $this->assertSame($first->json('data.last_event_sequence'), $retry->json('data.last_event_sequence'));
        $this->assertDatabaseCount('game_commands', 1);
        $this->assertDatabaseCount('game_events', count($engineResponse['data']['events']));
        $this->assertDatabaseCount('game_snapshots', 1);
        Http::assertSentCount(1);
    }

    public function test_reusing_an_idempotency_key_for_another_command_returns_409(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeTurnCommand($this->rollResponse($game, $game->last_event_sequence + 1));
        $sequence = (string) $game->last_command_sequence;
        $this->submit($owner, $game, 'roll_dice.v1', $sequence, 'reused-turn-key')->assertOk();

        $response = $this->submit($owner, $game, 'end_turn.v1', $sequence, 'reused-turn-key');

        $response->assertConflict()->assertJsonPath('error.code', 'idempotency_key_reused');
        $this->assertDatabaseCount('game_commands', 1);
        Http::assertSentCount(1);
    }

    public function test_stale_expected_sequence_returns_409_without_calling_the_engine(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeNoTurnCommand();

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) ($game->last_command_sequence - 1), 'stale-roll');

        $response->assertConflict()->assertJsonPath('error.code', 'stale_turn_command');
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        Http::assertNothingSent();
    }

    public function test_ai_active_seat_returns_409_without_calling_the_engine(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtNormalTurn($owner, 'awaiting_roll', activeSeat: 2, lastRoll: null);
        $this->fakeNoTurnCommand();

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'ai-seat-roll');

        $response->assertConflict()->assertJsonPath('error.code', 'turn_command_not_available');
        $this->assertDatabaseCount('game_commands', 0);
        Http::assertNothingSent();
    }

    public function test_engine_phase_rejection_returns_409_without_partial_writes(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtNormalTurn($owner, 'robber_required', lastRoll: ['die_one' => 2, 'die_two' => 5, 'total' => 7]);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/turns/command' => Http::response([
                'error' => ['code' => 'invalid_turn_phase', 'message' => 'The command is not allowed.'],
            ], 422),
        ]);

        $response = $this->submit($owner, $game, 'end_turn.v1', (string) $game->last_command_sequence, 'robber-phase-end');

        $response->assertConflict()->assertJsonPath('error.code', 'turn_command_not_available');
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        $this->assertSame('robber_required', $game->fresh()->current_state['turn_phase']);
        Http::assertSentCount(1);
    }

    public function test_invalid_engine_response_returns_502_without_partial_writes(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeTurnCommand(['data' => ['state_schema_version' => 'state-v2']]);

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'bad-engine-response');

        $response->assertStatus(502)->assertJsonPath('error.code', 'invalid_game_engine_response');
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        $this->assertSame($game->current_state, $game->fresh()->current_state);
    }

    public function test_different_owner_receives_404_and_the_engine_is_not_called(): void
    {
        $owner = User::factory()->create();
        $otherOwner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeNoTurnCommand();

        $response = $this->submit($otherOwner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'foreign-game');

        $response->assertNotFound()->assertJsonPath('error.code', 'game_not_found');
        Http::assertNothingSent();
    }

    public function test_submission_requires_authentication_and_an_idempotency_key(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeNoTurnCommand();

        $this->postJson('/api/v1/games/'.$game->id.'/turn-commands', [
            'expected_command_sequence' => (string) $game->last_command_sequence,
            'command_type' => 'roll_dice.v1',
            'payload' => [],
        ])->assertUnauthorized();

        $response = $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->postJson('/api/v1/games/'.$game->id.'/turn-commands', [
                'expected_command_sequence' => (string) $game->last_command_sequence,
                'command_type' => 'roll_dice.v1',
                'payload' => [],
            ]);

        $response->assertUnprocessable()->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('idempotency_key', $response->json('error.fields'));
        Http::assertNothingSent();
    }

    public function test_request_rejects_client_supplied_state_or_acting_seat(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeNoTurnCommand();

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'forbidden-input', [
            'state' => $game->current_state,
            'acting_seat_number' => 1,
        ]);

        $response->assertUnprocessable()->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('state', $response->json('error.fields'));
        $this->assertArrayHasKey('acting_seat_number', $response->json('error.fields'));
        Http::assertNothingSent();
    }

    public function test_request_rejects_a_nonempty_payload_without_calling_the_engine(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $this->fakeNoTurnCommand();

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'dice-input', [
            'payload' => ['die_one' => 6, 'die_two' => 6],
        ]);

        $response->assertUnprocessable()->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey('payload', $response->json('error.fields'));
        Http::assertNothingSent();
    }

    public function test_database_failure_rolls_back_command_events_snapshot_and_state(): void
    {
        $owner = User::factory()->create();
        $game = $this->gameAtTurnReady($owner);
        $savedState = $game->current_state;
        $this->fakeTurnCommand($this->rollResponse($game, $game->last_event_sequence + 1));
        GameSnapshot::creating(static function (): void {
            throw new RuntimeException('snapshot persistence unavailable');
        });

        $response = $this->submit($owner, $game, 'roll_dice.v1', (string) $game->last_command_sequence, 'rollback-roll');

        $response->assertServerError();
        $this->assertDatabaseCount('game_commands', 0);
        $this->assertDatabaseCount('game_events', 0);
        $this->assertDatabaseCount('game_snapshots', 0);
        $this->assertSame($savedState, $game->fresh()->current_state);
        $this->assertSame('running', $game->fresh()->lifecycle_status);
    }

    private function gameAtTurnReady(User $owner): Game
    {
        $fixture = $this->initialPlacementFixture();
        $transitions = $fixture['data']['transitions'];
        $state = $transitions[array_key_last($transitions)]['state'];
        $board = $transitions[0]['state']['board'];
        $seats = [
            ['seat_number' => 1, 'controller_type' => 'human'],
            ['seat_number' => 2, 'controller_type' => 'ai'],
            ['seat_number' => 3, 'controller_type' => 'ai'],
        ];
        $state['board'] = $board;
        $state['seats'] = $seats;

        $game = Game::factory()->for($owner, 'owner')->create([
            'mode' => 'human_vs_ai',
            'ruleset_key' => $board['ruleset']['key'],
            'ruleset_version' => $board['ruleset']['version'],
            'seed' => $board['seed'],
            'seat_count' => count($seats),
            'human_seat_number' => 1,
            'lifecycle_status' => 'running',
            'configuration' => [
                'ai_count' => 2,
                'map_key' => $board['map']['key'],
                'map_version' => $board['map']['version'],
                'board_schema_version' => $board['board_schema_version'],
            ],
            'board_configuration' => $board,
            'state_schema_version' => 'state-v2',
            'current_state' => $state,
            'last_command_sequence' => count($transitions),
            'last_event_sequence' => $this->lastEventSequence($transitions),
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

    private function gameAtNormalTurn(User $owner, string $turnPhase, int $activeSeat = 1, ?array $lastRoll = ['die_one' => 4, 'die_two' => 5, 'total' => 9]): Game
    {
        $game = $this->gameAtTurnReady($owner);
        $state = $this->turnState($game, $turnPhase, $activeSeat, $lastRoll);
        $game->forceFill([
            'state_schema_version' => 'state-v3',
            'current_state' => $state,
            'lifecycle_status' => 'awaiting human input',
            'last_command_sequence' => $game->last_command_sequence + 1,
            'last_event_sequence' => $game->last_event_sequence + 3,
        ])->save();

        return $game->refresh()->load('seats');
    }

    private function turnState(Game $game, string $turnPhase, int $activeSeat = 1, ?array $lastRoll = ['die_one' => 4, 'die_two' => 5, 'total' => 9]): array
    {
        $state = $game->current_state;
        unset($state['step']);
        $state['phase'] = 'normal_turn';
        $state['round'] = 1;
        $state['turn_number'] = 1;
        $state['active_seat_number'] = $activeSeat;
        $state['turn_phase'] = $turnPhase;
        $desert = collect($state['board']['hexes'])->firstWhere('terrain', 'desert');
        $state['robber_position'] = $desert['id'];
        $state['last_roll'] = $lastRoll;
        foreach ($state['players'] as &$player) {
            $player['cities'] = [];
        }
        unset($player);

        return $state;
    }

    private function rollResponse(Game $game, int $nextEventSequence, bool $seven = false): array
    {
        $dice = $seven
            ? ['die_one' => 2, 'die_two' => 5, 'total' => 7]
            : ['die_one' => 4, 'die_two' => 5, 'total' => 9];
        $state = $this->turnState($game, $seven ? 'robber_required' : 'action', 1, $dice);
        $events = [
            $this->event($nextEventSequence, 'turn_started.v1', ['seat_number' => 1, 'round' => 1, 'turn_number' => 1]),
            $this->event($nextEventSequence + 1, 'dice_rolled.v1', ['seat_number' => 1, ...$dice]),
        ];

        if ($seven) {
            $events[] = $this->event($nextEventSequence + 2, 'robber_required.v1', ['seat_number' => 1]);
        } else {
            $state['players'][0]['resources']['lumber']++;
            $events[] = [
                'sequence' => $nextEventSequence + 2,
                'event_type' => 'resources_produced.v1',
                'payload' => ['seat_number' => 1, 'delta' => ['lumber' => 1, 'wool' => 0, 'grain' => 0, 'brick' => 0, 'ore' => 0]],
                'visibility' => 'seat_private',
                'visible_to_seat_number' => 1,
            ];
        }

        return $this->turnResponse('roll_dice.v1', 1, $state, $events);
    }

    private function turnResponse(string $commandType, int $actingSeat, array $state, array $events): array
    {
        return [
            'data' => [
                'turn_command_schema_version' => '1',
                'execution_schema_version' => '1',
                'command_type' => $commandType,
                'acting_seat_number' => $actingSeat,
                'state_schema_version' => 'state-v3',
                'state' => $state,
                'events' => $events,
            ],
        ];
    }

    private function event(int $sequence, string $type, array $payload): array
    {
        return [
            'sequence' => $sequence,
            'event_type' => $type,
            'payload' => $payload,
            'visibility' => 'public',
            'visible_to_seat_number' => null,
        ];
    }

    private function submit(User $owner, Game $game, string $commandType, string $expectedSequence, string $idempotencyKey, array $extra = []): TestResponse
    {
        return $this->withToken($owner->createToken('test-client')->plainTextToken)
            ->withHeader('Idempotency-Key', $idempotencyKey)
            ->postJson('/api/v1/games/'.$game->id.'/turn-commands', [
                'expected_command_sequence' => $expectedSequence,
                'command_type' => $commandType,
                'payload' => [],
                ...$extra,
            ]);
    }

    private function fakeTurnCommand(array $response): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/turns/command' => Http::response($response, 200),
        ]);
    }

    private function fakeNoTurnCommand(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/turns/command' => Http::response([], 200),
        ]);
    }

    private function initialPlacementFixture(): array
    {
        $fixturePath = __DIR__.'/../Fixtures/initial-placement-ai-run.json';

        return json_decode((string) file_get_contents($fixturePath), true, 512, JSON_THROW_ON_ERROR);
    }

    private function lastEventSequence(array $transitions): int
    {
        $sequences = [];
        foreach ($transitions as $transition) {
            foreach ($transition['events'] as $event) {
                $sequences[] = $event['sequence'];
            }
        }

        return max($sequences);
    }
}
