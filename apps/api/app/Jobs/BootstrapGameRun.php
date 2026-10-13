<?php

namespace App\Jobs;

use App\Exceptions\GameEngineUnavailable;
use App\Services\GameBootstrapService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class BootstrapGameRun implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /**
     * Allow two retries after the initial attempt.
     */
    public function tries(): int
    {
        return 3;
    }

    /**
     * Back off transient engine failures between attempts.
     *
     * @return list<int>
     */
    public function backoff(): array
    {
        return [5, 30];
    }

    /**
     * Create a new job instance.
     */
    public function __construct(public readonly int $gameId) {}

    /**
     * Return the stable command identity used by the bootstrap execution.
     */
    public static function idempotencyKey(int $gameId): string
    {
        return 'bootstrap:'.$gameId;
    }

    /**
     * Allow only one queued bootstrap job for a game at a time.
     */
    public function uniqueId(): string
    {
        return (string) $this->gameId;
    }

    /**
     * Execute the bootstrap orchestration for this game.
     */
    public function handle(GameBootstrapService $gameBootstrapService): void
    {
        try {
            $gameBootstrapService->execute($this->gameId);
        } catch (GameEngineUnavailable $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            $this->fail($exception);
        }
    }

    /**
     * Persist a terminal failure after the queue has exhausted or stopped retrying.
     */
    public function failed(?Throwable $exception): void
    {
        app(GameBootstrapService::class)->recordFailure($this->gameId, $exception);
    }
}
