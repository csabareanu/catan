<?php

use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\CreateGameController;
use App\Http\Controllers\Api\V1\GameController;
use App\Http\Controllers\Api\V1\GameReplayController;
use App\Http\Controllers\Api\V1\GenerateBoardController;
use App\Http\Controllers\Api\V1\InitialPlacementOptionsController;
use App\Http\Controllers\Api\V1\StartGameRunController;
use App\Http\Controllers\Api\V1\SubmitInitialPlacementController;
use App\Http\Controllers\Api\V1\SubmitTurnCommandController;
use Illuminate\Support\Facades\Route;

Route::post('/v1/boards/generate', GenerateBoardController::class);

Route::post('/v1/games', CreateGameController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.store');

Route::post('/v1/games/{game}/run', StartGameRunController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.run');

Route::get('/v1/games/{game}/initial-placement/options', InitialPlacementOptionsController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.initial-placement.options');

Route::post('/v1/games/{game}/initial-placement', SubmitInitialPlacementController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.initial-placement.submit');

Route::post('/v1/games/{game}/turn-commands', SubmitTurnCommandController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.turn-commands.submit');

Route::get('/v1/games', [GameController::class, 'index'])
    ->middleware('auth:sanctum')
    ->name('api.v1.games.index');

Route::get('/v1/games/{game}/replay', GameReplayController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.games.replay');

Route::get('/v1/games/{game}', [GameController::class, 'show'])
    ->middleware('auth:sanctum')
    ->name('api.v1.games.show');

Route::delete('/v1/games/{game}', [GameController::class, 'destroy'])
    ->middleware('auth:sanctum')
    ->name('api.v1.games.destroy');

Route::post('/v1/auth/register', RegisterController::class)
    ->middleware('throttle:auth-register')
    ->name('api.v1.auth.register');

Route::post('/v1/auth/login', LoginController::class)
    ->middleware('throttle:auth-login')
    ->name('api.v1.auth.login');

Route::post('/v1/auth/logout', LogoutController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.auth.logout');

Route::get('/v1/auth/me', CurrentUserController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.auth.me');
