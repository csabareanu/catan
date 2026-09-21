<?php

namespace App\Models;

use Database\Factories\GameSeatFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'game_id',
    'seat_number',
    'controller_type',
    'user_id',
    'label',
])]
class GameSeat extends Model
{
    /** @use HasFactory<GameSeatFactory> */
    use HasFactory;

    /**
     * Get the game containing this seat.
     */
    public function game(): BelongsTo
    {
        return $this->belongsTo(Game::class);
    }

    /**
     * Get the user controlling this seat, when it is human-controlled.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the typed seat attributes.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'seat_number' => 'integer',
            'user_id' => 'integer',
        ];
    }
}
