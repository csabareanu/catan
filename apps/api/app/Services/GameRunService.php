<?php

namespace App\Services;

use App\Jobs\BootstrapGameRun;
use App\Models\Game;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;

class GameRunService
{
    public function __construct(private readonly BootstrapGameRunDispatcher $bootstrapGameRunDispatcher) {}

    /**
     * Queue a new bootstrap or retry an unfinished failed bootstrap.
     *
     * @return array{
     *     game: Game,
     *     outcome: 'accepted'|'dispatch_failed'|'in_progress'|'saved'|'conflict'
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
            try {
                $this->bootstrapGameRunDispatcher->dispatch($result['game']->getKey());
            } catch (Throwable) {
                $failedGame = $this->recordDispatchFailure($result['game']->getKey());

                if ($failedGame !== null) {
                    return [
                        'game' => $failedGame,
                        'outcome' => 'dispatch_failed',
                    ];
                }
            }
        }

        return $result;
    }

    private function recordDispatchFailure(int $gameId): ?Game
    {
        return DB::transaction(function () use ($gameId): ?Game {
            $game = Game::query()
                ->with('seats')
                ->lockForUpdate()
                ->find($gameId);

            if ($game === null
                || $this->hasCommittedBootstrap($game)
                || ! in_array($game->lifecycle_status, ['queued', 'running'], true)) {
                return null;
            }

            $game->forceFill([
                'lifecycle_status' => 'failed',
                'result' => null,
                'failure_code' => 'queue_dispatch_failed',
                'failure_message' => 'The game could not be queued for execution.',
                'completed_at' => now(),
            ])->save();

            return $game;
        });
    }

    private function hasCommittedBootstrap(Game $game): bool
    {
        return $game->commands()
            ->where('idempotency_key', BootstrapGameRun::idempotencyKey($game->getKey()))
            ->exists();
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
