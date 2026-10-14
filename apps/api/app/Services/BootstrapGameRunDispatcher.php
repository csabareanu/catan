<?php

namespace App\Services;

use App\Jobs\BootstrapGameRun;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Throwable;

class BootstrapGameRunDispatcher
{
    public function __construct(
        private readonly Dispatcher $dispatcher,
        private readonly CacheRepository $cache,
    ) {}

    /**
     * Dispatch one unique bootstrap job and release its lock if queue insertion fails.
     */
    public function dispatch(int $gameId): void
    {
        $job = new BootstrapGameRun($gameId);
        $lock = new UniqueLock($this->cache);

        if (! $lock->acquire($job)) {
            return;
        }

        try {
            $this->dispatcher->dispatch($job);
        } catch (Throwable $exception) {
            $lock->release($job);

            throw $exception;
        }
    }
}
