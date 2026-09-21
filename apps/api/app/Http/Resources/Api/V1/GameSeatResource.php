<?php

namespace App\Http\Resources\Api\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class GameSeatResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'seat_number' => $this->resource->seat_number,
            'controller_type' => $this->resource->controller_type,
            'user_id' => $this->resource->user_id,
            'label' => $this->resource->label,
        ];
    }
}
