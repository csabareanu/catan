<?php

namespace Tests\Feature;

use App\Models\Game;
use App\Models\GameCommand;
use App\Models\GameEvent;
use App\Models\GameSnapshot;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Tests\TestCase;

class GameExecutionPersistenceTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_versioned_execution_records_persist_with_ordered_relationships_and_array_payloads(): void
    {
        $game = Game::factory()->create();
        $firstCommand = GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'command-1',
            'command_type' => 'initialize.v1',
            'payload' => ['seed' => '894177203164'],
        ]);
        $secondCommand = GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 2,
            'idempotency_key' => 'command-2',
            'command_type' => 'roll_dice.v1',
            'payload' => ['seat_number' => 1],
        ]);
        $secondEvent = GameEvent::factory()->for($game, 'game')->for($secondCommand, 'command')->create([
            'sequence' => 2,
            'event_type' => 'dice_rolled.v1',
            'payload' => ['total' => 7],
        ]);
        $firstEvent = GameEvent::factory()->for($game, 'game')->for($firstCommand, 'command')->create([
            'sequence' => 1,
            'event_type' => 'game_initialized.v1',
            'payload' => ['ruleset_version' => '1.0.0'],
        ]);
        $secondSnapshot = GameSnapshot::factory()->for($game, 'game')->create([
            'command_sequence' => 2,
            'event_sequence' => 2,
            'state_schema_version' => 'state-v1',
            'state' => ['turn' => 1, 'last_roll' => 7],
        ]);
        $firstSnapshot = GameSnapshot::factory()->for($game, 'game')->create([
            'command_sequence' => 0,
            'event_sequence' => 0,
            'state_schema_version' => 'state-v1',
            'state' => ['turn' => 0],
        ]);

        $game->load(['commands', 'events', 'snapshots']);

        $this->assertSame([1, 2], $game->commands->pluck('sequence')->all());
        $this->assertSame([1, 2], $game->events->pluck('sequence')->all());
        $this->assertSame([0, 2], $game->snapshots->pluck('command_sequence')->all());
        $this->assertSame(['seed' => '894177203164'], $game->commands[0]->payload);
        $this->assertSame(['total' => 7], $game->events[1]->payload);
        $this->assertSame(['turn' => 0], $game->snapshots[0]->state);
        $this->assertIsArray($game->commands[0]->payload);
        $this->assertIsArray($game->events[1]->payload);
        $this->assertIsArray($game->snapshots[0]->state);
        $this->assertTrue($firstCommand->game->is($game));
        $this->assertTrue($secondEvent->command->is($secondCommand));
        $this->assertTrue($firstSnapshot->game->is($game));
        $this->assertSame('state-v1', $secondSnapshot->state_schema_version);
        $this->assertSame('public', $firstEvent->visibility);

        $this->assertDatabaseCount('game_commands', 2);
        $this->assertDatabaseCount('game_events', 2);
        $this->assertDatabaseCount('game_snapshots', 2);
    }

    public function test_command_sequence_is_unique_per_game(): void
    {
        $game = Game::factory()->create();

        GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'command-1',
        ]);

        $this->expectException(QueryException::class);

        GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'command-2',
        ]);
    }

    public function test_command_idempotency_key_is_unique_per_game(): void
    {
        $game = Game::factory()->create();

        GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'retry-key',
        ]);

        $this->expectException(QueryException::class);

        GameCommand::factory()->for($game, 'game')->create([
            'sequence' => 2,
            'idempotency_key' => 'retry-key',
        ]);
    }

    public function test_the_same_idempotency_key_can_be_used_for_different_games(): void
    {
        $firstGame = Game::factory()->create();
        $secondGame = Game::factory()->create();

        GameCommand::factory()->for($firstGame, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'retry-key',
        ]);
        GameCommand::factory()->for($secondGame, 'game')->create([
            'sequence' => 1,
            'idempotency_key' => 'retry-key',
        ]);

        $this->assertDatabaseCount('game_commands', 2);
    }

    public function test_event_sequence_is_unique_per_game(): void
    {
        $game = Game::factory()->create();

        GameEvent::factory()->for($game, 'game')->create([
            'sequence' => 1,
        ]);

        $this->expectException(QueryException::class);

        GameEvent::factory()->for($game, 'game')->create([
            'sequence' => 1,
        ]);
    }

    public function test_snapshot_command_position_is_unique_per_game(): void
    {
        $game = Game::factory()->create();

        GameSnapshot::factory()->for($game, 'game')->create([
            'command_sequence' => 4,
        ]);

        $this->expectException(QueryException::class);

        GameSnapshot::factory()->for($game, 'game')->create([
            'command_sequence' => 4,
        ]);
    }

    public function test_event_visibility_metadata_is_preserved(): void
    {
        $game = Game::factory()->create();
        $publicEvent = GameEvent::factory()->for($game, 'game')->create([
            'sequence' => 1,
            'visibility' => 'public',
            'visible_to_seat_number' => null,
        ]);
        $privateEvent = GameEvent::factory()->for($game, 'game')->create([
            'sequence' => 2,
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 2,
        ]);

        $game->load('events');

        $this->assertSame('public', $game->events[0]->visibility);
        $this->assertNull($game->events[0]->visible_to_seat_number);
        $this->assertSame('seat_private', $game->events[1]->visibility);
        $this->assertSame(2, $game->events[1]->visible_to_seat_number);
        $this->assertTrue($publicEvent->game->is($game));
        $this->assertTrue($privateEvent->game->is($game));
    }

    public function test_deleting_a_game_cascades_to_execution_history(): void
    {
        $game = Game::factory()->create();
        $command = GameCommand::factory()->for($game, 'game')->create();
        $event = GameEvent::factory()->for($game, 'game')->for($command, 'command')->create();
        $snapshot = GameSnapshot::factory()->for($game, 'game')->create();

        $game->delete();

        $this->assertDatabaseMissing('game_commands', ['id' => $command->id]);
        $this->assertDatabaseMissing('game_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('game_snapshots', ['id' => $snapshot->id]);
    }

    public function test_deleting_an_owner_cascades_to_game_execution_history(): void
    {
        $owner = User::factory()->create();
        $game = Game::factory()->for($owner, 'owner')->create();
        $command = GameCommand::factory()->for($game, 'game')->create();
        $event = GameEvent::factory()->for($game, 'game')->for($command, 'command')->create();
        $snapshot = GameSnapshot::factory()->for($game, 'game')->create();

        $owner->delete();

        $this->assertDatabaseMissing('games', ['id' => $game->id]);
        $this->assertDatabaseMissing('game_commands', ['id' => $command->id]);
        $this->assertDatabaseMissing('game_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('game_snapshots', ['id' => $snapshot->id]);
    }
}
