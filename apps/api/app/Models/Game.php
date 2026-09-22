<?php

namespace App\Models;

use Database\Factories\GameFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'owner_id',
    'mode',
    'ruleset_key',
    'ruleset_version',
    'seed',
    'seat_count',
    'human_seat_number',
    'lifecycle_status',
    'configuration',
    'board_configuration',
    'state_schema_version',
    'current_state',
    'result',
    'last_command_sequence',
    'last_event_sequence',
    'run_attempts',
    'failure_code',
    'failure_message',
    'started_at',
    'completed_at',
])]
class Game extends Model
{
    /** @use HasFactory<GameFactory> */
    use HasFactory;

    /**
     * Get the user who owns the game.
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * Get the ordered seats in the game.
     */
    public function seats(): HasMany
    {
        return $this->hasMany(GameSeat::class)->orderBy('seat_number');
    }

    /**
     * Get the ordered commands accepted for the game.
     */
    public function commands(): HasMany
    {
        return $this->hasMany(GameCommand::class)->orderBy('sequence');
    }

    /**
     * Get the ordered events produced for the game.
     */
    public function events(): HasMany
    {
        return $this->hasMany(GameEvent::class)->orderBy('sequence');
    }

    /**
     * Get the snapshots ordered by their command position.
     */
    public function snapshots(): HasMany
    {
        return $this->hasMany(GameSnapshot::class)->orderBy('command_sequence');
    }

    /**
     * Get the JSON game configuration attributes.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'seat_count' => 'integer',
            'human_seat_number' => 'integer',
            'configuration' => 'array',
            'board_configuration' => 'array',
            'current_state' => 'array',
            'result' => 'array',
            'last_command_sequence' => 'integer',
            'last_event_sequence' => 'integer',
            'run_attempts' => 'integer',
            'started_at' => 'immutable_datetime',
            'completed_at' => 'immutable_datetime',
        ];
    }
}
