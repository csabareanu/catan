<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\Api\V1\Auth\AuthenticatedUserResource;
use Illuminate\Http\Request;

class CurrentUserController extends Controller
{
    /**
     * Handle the incoming request.
     */
    public function __invoke(Request $request): AuthenticatedUserResource
    {
        return new AuthenticatedUserResource($request->user());
    }
}
