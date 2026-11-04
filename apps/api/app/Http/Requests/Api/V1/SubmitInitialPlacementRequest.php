<?php

namespace App\Http\Requests\Api\V1;

use App\Rules\CanonicalNonNegativeInt64String;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class SubmitInitialPlacementRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'expected_command_sequence' => [
                'bail',
                'required',
                ...CanonicalNonNegativeInt64String::rules(),
            ],
            'settlement_vertex_id' => ['bail', 'required', 'string', 'min:1', 'max:255'],
            'road_edge_id' => ['bail', 'required', 'string', 'min:1', 'max:255'],
            'idempotency_key' => ['bail', 'required', 'string', 'min:1', 'max:255'],
            'state' => ['prohibited'],
            'game_state' => ['prohibited'],
            'acting_seat_number' => ['prohibited'],
            'active_seat_number' => ['prohibited'],
            'human_seat_number' => ['prohibited'],
            'seat_number' => ['prohibited'],
        ];
    }

    /**
     * Take the idempotency key from its documented header, never from the JSON body.
     *
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        $all = $this->all();

        return [
            ...$all,
            'idempotency_key' => $this->header('Idempotency-Key'),
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'error' => [
                'code' => 'validation_failed',
                'message' => 'The initial placement request is invalid.',
                'fields' => $validator->errors()->toArray(),
            ],
        ], 422));
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'expected_command_sequence.regex' => 'The expected_command_sequence must be a canonical non-negative integer string.',
            'settlement_vertex_id.required' => 'A settlement vertex must be selected.',
            'road_edge_id.required' => 'A road edge must be selected.',
            'idempotency_key.required' => 'The Idempotency-Key header is required.',
            'idempotency_key.max' => 'The Idempotency-Key header must not exceed 255 characters.',
        ];
    }
}
