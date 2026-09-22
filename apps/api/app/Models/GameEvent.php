<?php

namespace App\Models;

use Database\Factories\GameEventFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'game_id',
    'command_id',
    'sequence',
    'event_type',
    'payload',
    'visibility',
    'visible_to_seat_number',
    'occurred_at',
])]
class GameEvent extends Model
{
    /** @use HasFactory<GameEventFactory> */
    use HasFactory;

    /**
     * Disable Laravel's implicit created_at and updated_at columns.
     */
    public $timestamps = false;

    /**
     * Get the game containing this event.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * Get the command that produced this event, when one exists.
     */
    public function command(): BelongsTo
    {
        return $this->belongsTo(GameCommand::class, 'command_id');
    }

    /**
     * Get the typed event attributes.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'game_id' => 'integer',
            'command_id' => 'integer',
            'sequence' => 'integer',
            'visible_to_seat_number' => 'integer',
            'payload' => 'array',
            'occurred_at' => 'immutable_datetime',
        ];
    }
}
