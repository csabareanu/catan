<?php

namespace App\Models;

use Database\Factories\GameCommandFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'game_id',
    'sequence',
    'idempotency_key',
    'acting_seat_number',
    'command_type',
    'payload',
    'accepted_at',
])]
class GameCommand extends Model
{
    /** @use HasFactory<GameCommandFactory> */
    use HasFactory;

    /**
     * Disable Laravel's implicit created_at and updated_at columns.
     */
    public $timestamps = false;

    /**
     * Get the game containing this command.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * Get the events produced by this command.
     */
    public function events(): HasMany
    {
        return $this->hasMany(GameEvent::class, 'command_id')->orderBy('sequence');
    }

    /**
     * Get the typed command attributes.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'game_id' => 'integer',
            'sequence' => 'integer',
            'acting_seat_number' => 'integer',
            'payload' => 'array',
            'accepted_at' => 'immutable_datetime',
        ];
    }
}
