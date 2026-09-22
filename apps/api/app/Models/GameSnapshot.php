<?php

namespace App\Models;

use Database\Factories\GameSnapshotFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'game_id',
    'command_sequence',
    'event_sequence',
    'state_schema_version',
    'state',
    'created_at',
])]
class GameSnapshot extends Model
{
    /** @use HasFactory<GameSnapshotFactory> */
    use HasFactory;

    /**
     * Disable Laravel's implicit updated_at column.
     */
    public $timestamps = false;

    /**
     * Get the game containing this snapshot.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * Get the typed snapshot attributes.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'game_id' => 'integer',
            'command_sequence' => 'integer',
            'event_sequence' => 'integer',
            'state' => 'array',
            'created_at' => 'immutable_datetime',
        ];
    }
}
