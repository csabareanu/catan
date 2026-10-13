<?php

namespace App\Services;

use App\Jobs\BootstrapGameRun;
use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class GameRunService
{
    /**
     * Queue a new bootstrap or retry an unfinished failed bootstrap.
     *
     * @return array{
     *     game: Game,
     *     outcome: 'accepted'|'in_progress'|'saved'|'conflict'
     * }|null
     */
    public function start(User $owner, string $gameId): ?array
    {
        $result = DB::transaction(function () use ($owner, $gameId): ?array {
            $game = $owner->ownedGames()
                ->whereKey($gameId)
                ->lockForUpdate()
                ->first();

            if ($game === null) {
                return null;
            }

            if ($game->lifecycle_status === 'created' || $this->canRetry($game)) {
                $game->forceFill([
                    'lifecycle_status' => 'queued',
                    'failure_code' => null,
                    'failure_message' => null,
                    'completed_at' => null,
                ])->save();

                return [
                    'game' => $game->load('seats'),
                    'outcome' => 'accepted',
                ];
            }

            $outcome = match ($game->lifecycle_status) {
                'queued', 'running' => 'in_progress',
                'awaiting human input' => 'saved',
                default => 'conflict',
            };

            return [
                'game' => $game->load('seats'),
                'outcome' => $outcome,
            ];
        });

        if ($result !== null && $result['outcome'] === 'accepted') {
            BootstrapGameRun::dispatch($result['game']->getKey());
        }

        return $result;
    }

    private function canRetry(Game $game): bool
    {
        if ($game->lifecycle_status !== 'failed') {
            return false;
        }

        return ! $game->commands()
            ->where('idempotency_key', BootstrapGameRun::idempotencyKey($game->getKey()))
            ->exists();
    }
}
