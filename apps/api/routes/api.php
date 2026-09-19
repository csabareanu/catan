<?php

use App\Http\Controllers\Api\V1\GenerateBoardController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/v1/boards/generate', GenerateBoardController::class);

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
