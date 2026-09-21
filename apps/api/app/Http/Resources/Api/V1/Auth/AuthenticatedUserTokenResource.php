<?php

namespace App\Http\Resources\Api\V1\Auth;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuthenticatedUserTokenResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'user' => UserResource::make($this->resource['user']),
            'token' => $this->resource['token'],
            'token_type' => $this->resource['token_type'],
        ];
    }
}
