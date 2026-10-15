<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameEvent;
use App\Models\GameSeat;
use App\Models\GameSnapshot;
use App\Models\User;
use App\Services\GameReplayProjection;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GameReplayTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_it_projects_context_visible_events_and_a_safe_checkpoint_frame(): void
    {
        $game = Game::factory()->create([
            'state_schema_version' => 'state-v1',
            'current_state' => [
                'phase' => 'playing',
                'secret' => 'canonical-only',
            ],
            'result' => ['winner_seat_number' => 1],
            'started_at' => CarbonImmutable::parse('2026-10-01 10:00:00 UTC'),
            'completed_at' => null,
        ]);
        GameSeat::factory()->for($game)->create([
            'seat_number' => 2,
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI 1',
        ]);
        GameSeat::factory()->for($game)->create([
            'seat_number' => 1,
            'controller_type' => 'human',
            'user_id' => $game->owner_id,
            'label' => 'Owner',
        ]);

        GameEvent::factory()->for($game)->create([
            'sequence' => 1,
            'event_type' => 'game_initialized.v1',
            'payload' => ['public' => true],
            'occurred_at' => CarbonImmutable::parse('2026-10-01 10:00:01 UTC'),
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 2,
            'event_type' => 'ai_secret.v1',
            'payload' => ['secret' => 'ai-only'],
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 2,
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 3,
            'event_type' => 'owner_secret.v1',
            'payload' => ['secret' => 'owner-only'],
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 1,
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 4,
            'event_type' => 'malformed_private.v1',
            'payload' => ['secret' => 'invalid'],
            'visibility' => 'seat_private',
            'visible_to_seat_number' => null,
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 5,
            'event_type' => 'road_built.v1',
            'payload' => ['edge_id' => 'e-1'],
            'occurred_at' => CarbonImmutable::parse('2026-10-01 10:00:05 UTC'),
        ]);

        $firstSnapshot = GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 0,
            'event_sequence' => 0,
            'state' => ['phase' => 'created'],
            'created_at' => CarbonImmutable::parse('2026-10-01 10:00:00 UTC'),
        ]);
        $selectedSnapshot = GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 3,
            'event_sequence' => 5,
            'state' => [
                'phase' => 'playing',
                'active_seat_number' => 1,
                'roads' => ['e-1' => ['owner_seat_number' => 1]],
                'board' => ['hexes' => ['private-board-data']],
                'seats' => [['seat_number' => 1, 'resources' => ['wood' => 4]]],
                'resources' => ['wood' => 4],
                'development_cards' => ['year_of_plenty'],
                'secret' => 'canonical-only',
            ],
            'created_at' => CarbonImmutable::parse('2026-10-01 10:00:03 UTC'),
        ]);

        $game->load('seats');
        $projection = (new GameReplayProjection)->project(
            game: $game,
            seats: $game->seats,
            events: $game->events()->get(),
            snapshots: $game->snapshots()->get(),
            frame: $selectedSnapshot,
            requestedAfterSequence: '0',
            limit: 2,
        );

        $this->assertSame(
            ['schema_version', 'context', 'events', 'event_cursor', 'snapshot_index', 'frame'],
            array_keys($projection),
        );
        $this->assertSame('replay-v1', $projection['schema_version']);
        $this->assertSame($game->board_configuration, $projection['context']['board']);
        $this->assertSame([
            [
                'seat_number' => 1,
                'controller_type' => 'human',
                'label' => 'Owner',
            ],
            [
                'seat_number' => 2,
                'controller_type' => 'ai',
                'label' => 'AI 1',
            ],
        ], $projection['context']['seats']);
        $this->assertArrayNotHasKey('owner_id', $projection['context']['game']);
        $this->assertArrayNotHasKey('current_state', $projection['context']['game']);
        $this->assertArrayNotHasKey('result', $projection['context']['game']);

        $this->assertSame(['1', '3'], array_column($projection['events'], 'sequence'));
        $this->assertSame(['game_initialized.v1', 'owner_secret.v1'], array_column($projection['events'], 'event_type'));
        $this->assertSame([
            'requested_after_sequence' => '0',
            'returned_through_sequence' => '3',
            'has_more' => true,
            'next_after_sequence' => '3',
        ], $projection['event_cursor']);

        $this->assertSame([
            [
                'command_sequence' => '0',
                'event_sequence' => '0',
                'state_schema_version' => 'state-v1',
                'created_at' => '2026-10-01T10:00:00.000000Z',
            ],
            [
                'command_sequence' => '3',
                'event_sequence' => '5',
                'state_schema_version' => 'state-v1',
                'created_at' => '2026-10-01T10:00:03.000000Z',
            ],
        ], $projection['snapshot_index']);
        $this->assertArrayNotHasKey('state', $projection['snapshot_index'][0]);

        $this->assertSame([
            'command_sequence' => '3',
            'event_sequence' => '5',
            'state_schema_version' => 'state-v1',
            'public_projection_schema_version' => 'replay-public-v1',
            'public_state' => [
                'phase' => 'playing',
                'active_seat_number' => 1,
                'roads' => ['e-1' => ['owner_seat_number' => 1]],
            ],
            'viewer_state' => null,
        ], $projection['frame']);
        $this->assertArrayNotHasKey('board', $projection['frame']['public_state']);
        $this->assertArrayNotHasKey('seats', $projection['frame']['public_state']);
        $this->assertArrayNotHasKey('resources', $projection['frame']['public_state']);
        $this->assertArrayNotHasKey('development_cards', $projection['frame']['public_state']);
        $this->assertArrayNotHasKey('current_state', $projection);
    }

    public function test_an_ai_only_game_projects_public_events_without_private_ai_events(): void
    {
        $game = Game::factory()->create([
            'human_seat_number' => null,
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 1,
            'event_type' => 'public_event.v1',
        ]);
        GameEvent::factory()->for($game)->create([
            'sequence' => 2,
            'event_type' => 'ai_private_event.v1',
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 1,
        ]);

        $projection = (new GameReplayProjection)->project(
            game: $game,
            seats: collect(),
            events: $game->events()->get(),
            snapshots: collect(),
            frame: null,
            requestedAfterSequence: '0',
            limit: 50,
        );

        $this->assertSame(['1'], array_column($projection['events'], 'sequence'));
        $this->assertFalse($projection['event_cursor']['has_more']);
        $this->assertNull($projection['frame']);
    }

    public function test_an_empty_history_returns_an_empty_page_and_null_frame(): void
    {
        $game = Game::factory()->create();

        $projection = (new GameReplayProjection)->project(
            game: $game,
            seats: collect(),
            events: collect(),
            snapshots: collect(),
            frame: null,
            requestedAfterSequence: '12',
            limit: 10,
        );

        $this->assertSame([], $projection['events']);
        $this->assertSame([
            'requested_after_sequence' => '12',
            'returned_through_sequence' => null,
            'has_more' => false,
            'next_after_sequence' => null,
        ], $projection['event_cursor']);
        $this->assertSame([], $projection['snapshot_index']);
        $this->assertNull($projection['frame']);
    }

    public function test_an_owner_can_retrieve_an_empty_replay_with_safe_context(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'current_state' => [
                'phase' => 'canonical-only',
            ],
            'result' => ['winner_seat_number' => 1],
            'failure_message' => 'internal failure',
        ]);
        $this->createReplaySeats($game, $owner);

        $response = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay');

        $response->assertOk()
            ->assertJsonStructure([
                'schema_version',
                'context' => [
                    'game',
                    'board',
                    'seats',
                ],
                'events',
                'event_cursor',
                'snapshot_index',
                'frame',
            ])
            ->assertJsonPath('schema_version', 'replay-v1')
            ->assertJsonPath('context.game.id', $game->id)
            ->assertJsonPath('events', [])
            ->assertJsonPath('snapshot_index', [])
            ->assertJsonPath('frame', null)
            ->assertJsonMissingPath('context.game.owner_id')
            ->assertJsonMissingPath('context.game.current_state')
            ->assertJsonMissingPath('context.game.result')
            ->assertJsonMissingPath('context.game.failure_message');
        $this->assertSame(
            [1, 2],
            array_column($response->json('context.seats'), 'seat_number'),
        );
    }

    public function test_an_owner_can_retrieve_visible_paged_events_and_the_latest_checkpoint(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'state_schema_version' => 'state-v1',
            'last_command_sequence' => 5,
        ]);
        $this->createReplaySeats($game, $owner);

        $this->createReplayEvent($game, 1, 'public_one.v1');
        $this->createReplayEvent($game, 2, 'ai_private.v1', [
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 2,
            'payload' => ['secret' => 'ai-only'],
        ]);
        $this->createReplayEvent($game, 3, 'owner_private.v1', [
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 1,
            'payload' => ['secret' => 'owner-only'],
        ]);
        $this->createReplayEvent($game, 4, 'public_four.v1');
        $this->createReplayEvent($game, 5, 'public_five.v1');
        $this->createReplayEvent($game, 6, 'future_public.v1');
        GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 0,
            'event_sequence' => 0,
            'state' => ['phase' => 'created'],
        ]);
        GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 5,
            'event_sequence' => 5,
            'state' => [
                'phase' => 'playing',
                'board' => ['immutable' => true],
                'seats' => [['seat_number' => 1]],
            ],
        ]);

        $firstResponse = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay?limit=2');

        $firstResponse->assertOk()
            ->assertJsonPath('frame.command_sequence', '5')
            ->assertJsonPath('frame.event_sequence', '5')
            ->assertJsonPath('event_cursor.requested_after_sequence', '0')
            ->assertJsonPath('event_cursor.returned_through_sequence', '3')
            ->assertJsonPath('event_cursor.has_more', true)
            ->assertJsonPath('event_cursor.next_after_sequence', '3')
            ->assertJsonPath('snapshot_index.1.command_sequence', '5')
            ->assertJsonMissingPath('snapshot_index.1.state');
        $this->assertSame(['1', '3'], array_column($firstResponse->json('events'), 'sequence'));
        $this->assertSame(['public_one.v1', 'owner_private.v1'], array_column($firstResponse->json('events'), 'event_type'));
        $this->assertArrayNotHasKey('board', $firstResponse->json('frame.public_state'));
        $this->assertArrayNotHasKey('seats', $firstResponse->json('frame.public_state'));

        $secondResponse = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay?after_event_sequence=3&limit=2');

        $secondResponse->assertOk()
            ->assertJsonPath('event_cursor.requested_after_sequence', '3')
            ->assertJsonPath('event_cursor.returned_through_sequence', '5')
            ->assertJsonPath('event_cursor.has_more', false)
            ->assertJsonPath('event_cursor.next_after_sequence', null);
        $this->assertSame(['4', '5'], array_column($secondResponse->json('events'), 'sequence'));
    }

    public function test_historical_replay_uses_the_nearest_checkpoint_and_stops_events_at_that_frame(): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'last_command_sequence' => 10,
        ]);
        $this->createReplaySeats($game, $owner);

        foreach (range(1, 6) as $sequence) {
            $this->createReplayEvent($game, $sequence, 'public_'.$sequence.'.v1');
        }
        GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 3,
            'event_sequence' => 3,
            'state' => ['phase' => 'at-three'],
        ]);
        GameSnapshot::factory()->for($game)->create([
            'command_sequence' => 10,
            'event_sequence' => 6,
            'state' => ['phase' => 'at-ten'],
        ]);

        $response = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay?at_command_sequence=5');

        $response->assertOk()
            ->assertJsonPath('frame.command_sequence', '3')
            ->assertJsonPath('frame.event_sequence', '3')
            ->assertJsonPath('frame.public_state.phase', 'at-three');
        $this->assertSame(['1', '2', '3'], array_column($response->json('events'), 'sequence'));
        $this->assertSame(['3', '10'], array_column($response->json('snapshot_index'), 'command_sequence'));
    }

    #[DataProvider('replayLifecycleStatuses')]
    public function test_an_owner_can_retrieve_replay_context_for_each_lifecycle_status(string $status): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create([
            'lifecycle_status' => $status,
            'failure_message' => $status === 'failed' ? 'internal failure' : null,
            'result' => $status === 'completed' ? ['winner_seat_number' => 1] : null,
        ]);

        $response = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay');

        $response->assertOk()
            ->assertJsonPath('context.game.lifecycle_status', $status)
            ->assertJsonMissingPath('context.game.failure_message')
            ->assertJsonMissingPath('context.game.result');
    }

    /**
     * @return array<string, array{string}>
     */
    public static function replayLifecycleStatuses(): array
    {
        return [
            'created' => ['created'],
            'queued' => ['queued'],
            'running' => ['running'],
            'completed' => ['completed'],
            'failed' => ['failed'],
        ];
    }

    public function test_an_unauthenticated_request_cannot_retrieve_a_replay(): void
    {
        $game = Game::factory()->create();

        $this->getJson('/api/v1/games/'.$game->id.'/replay')
            ->assertUnauthorized()
            ->assertExactJson([
                'error' => [
                    'code' => 'unauthenticated',
                    'message' => 'Authentication is required.',
                ],
            ]);
    }

    public function test_an_owner_cannot_retrieve_a_foreign_or_missing_replay(): void
    {
        $owner = User::factory()->create();
        $otherUser = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $foreignGame = Game::factory()->for($otherUser, 'owner')->create();
        $expectedError = [
            'error' => [
                'code' => 'game_not_found',
                'message' => 'The requested game was not found.',
            ],
        ];

        $this->withToken($token)
            ->getJson('/api/v1/games/'.$foreignGame->id.'/replay')
            ->assertNotFound()
            ->assertExactJson($expectedError);
        $this->withToken($token)
            ->getJson('/api/v1/games/999999/replay')
            ->assertNotFound()
            ->assertExactJson($expectedError);
    }

    #[DataProvider('invalidReplayQueries')]
    public function test_invalid_replay_parameters_return_validation_errors(string $query, string $field): void
    {
        $owner = User::factory()->create();
        $token = $owner->createToken('test-client')->plainTextToken;
        $game = Game::factory()->for($owner, 'owner')->create();

        $response = $this->withToken($token)
            ->getJson('/api/v1/games/'.$game->id.'/replay?'.$query);

        $response->assertUnprocessable()
            ->assertJsonPath('error.code', 'validation_failed');
        $this->assertArrayHasKey($field, $response->json('error.fields'));
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function invalidReplayQueries(): array
    {
        return [
            'negative event cursor' => ['after_event_sequence=-1', 'after_event_sequence'],
            'leading zero event cursor' => ['after_event_sequence=01', 'after_event_sequence'],
            'non-numeric frame position' => ['at_command_sequence=abc', 'at_command_sequence'],
            'too large frame position' => ['at_command_sequence=9223372036854775808', 'at_command_sequence'],
            'zero page size' => ['limit=0', 'limit'],
            'page size above maximum' => ['limit=101', 'limit'],
        ];
    }

    private function createReplaySeats(Game $game, User $owner): void
    {
        GameSeat::factory()->for($game)->create([
            'seat_number' => 2,
            'controller_type' => 'ai',
            'user_id' => null,
            'label' => 'AI 1',
        ]);
        GameSeat::factory()->for($game)->create([
            'seat_number' => 1,
            'controller_type' => 'human',
            'user_id' => $owner->id,
            'label' => 'Owner',
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function createReplayEvent(Game $game, int $sequence, string $eventType, array $attributes = []): GameEvent
    {
        return GameEvent::factory()->for($game)->create(array_merge([
            'sequence' => $sequence,
            'event_type' => $eventType,
        ], $attributes));
    }
}
