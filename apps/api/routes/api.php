<?php

use App\Http\Controllers\Api\V1\Auth\CurrentUserController;
use App\Http\Controllers\Api\V1\Auth\LoginController;
use App\Http\Controllers\Api\V1\Auth\LogoutController;
use App\Http\Controllers\Api\V1\Auth\RegisterController;
use App\Http\Controllers\Api\V1\GenerateBoardController;
use Illuminate\Support\Facades\Route;

Route::post('/v1/boards/generate', GenerateBoardController::class);

Route::post('/v1/auth/register', RegisterController::class)
    ->name('api.v1.auth.register');

Route::post('/v1/auth/login', LoginController::class)
    ->name('api.v1.auth.login');

Route::post('/v1/auth/logout', LogoutController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.auth.logout');

Route::get('/v1/auth/me', CurrentUserController::class)
    ->middleware('auth:sanctum')
    ->name('api.v1.auth.me');
