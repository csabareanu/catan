<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Auth\LoginRequest;
use App\Http\Resources\Api\V1\Auth\AuthenticatedUserTokenResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Hash;
use Symfony\Component\HttpFoundation\Response;

class LoginController extends Controller
{
    public function __invoke(LoginRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $user = User::query()->where('email', $validated['email'])->first();

        if ($user === null || ! Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'error' => [
                    'code' => 'invalid_credentials',
                    'message' => 'The provided credentials are invalid.',
                ],
            ], Response::HTTP_UNAUTHORIZED);
        }

        $token = $user->createToken($validated['token_name'] ?? 'api-client')->plainTextToken;

        return AuthenticatedUserTokenResource::make([
            'user' => $user,
            'token' => $token,
            'token_type' => 'Bearer',
        ])->response();
    }
}
