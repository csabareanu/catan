<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $rateLimitedResponse = static function (Request $request, array $headers): JsonResponse {
            return response()->json([
                'error' => [
                    'code' => 'rate_limited',
                    'message' => 'Too many authentication attempts. Please try again later.',
                ],
            ], Response::HTTP_TOO_MANY_REQUESTS, $headers);
        };

        RateLimiter::for('auth-login', function (Request $request) use ($rateLimitedResponse): Limit {
            return Limit::perMinute(5)
                ->by(Str::lower(trim((string) $request->input('email'))).'|'.$request->ip())
                ->response($rateLimitedResponse);
        });

        RateLimiter::for('auth-register', function (Request $request) use ($rateLimitedResponse): Limit {
            return Limit::perMinute(3)
                ->by((string) $request->ip())
                ->response($rateLimitedResponse);
        });
    }
}
