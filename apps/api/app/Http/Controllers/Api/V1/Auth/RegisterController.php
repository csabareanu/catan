<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\RegisterRequest;
use App\Http\Resources\Api\V1\Auth\AuthenticatedUserTokenResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

class RegisterController extends Controller
{
    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);
        $token = $user->createToken($validated['token_name'] ?? 'api-client')->plainTextToken;

        $response = AuthenticatedUserTokenResource::make([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ])->response();
        $response->setStatusCode(Response::HTTP_CREATED);

        return $response;
    }
}
