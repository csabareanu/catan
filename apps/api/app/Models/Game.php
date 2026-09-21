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
        ];
    }
}
