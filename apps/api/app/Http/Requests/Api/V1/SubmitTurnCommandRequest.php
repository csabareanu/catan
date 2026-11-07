<?php

namespace App\Http\Requests\Api\V1;

use App\Rules\CanonicalNonNegativeInt64String;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class SubmitTurnCommandRequest extends FormRequest
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
            'command_type' => ['bail', 'required', 'string', 'in:roll_dice.v1,end_turn.v1'],
            'payload' => ['bail', 'present', 'array', 'size:0'],
            'idempotency_key' => ['bail', 'required', 'string', 'min:1', 'max:255'],
            'state' => ['prohibited'],
            'game_state' => ['prohibited'],
            'acting_seat_number' => ['prohibited'],
            'active_seat_number' => ['prohibited'],
            'human_seat_number' => ['prohibited'],
            'seat_number' => ['prohibited'],
            'seed' => ['prohibited'],
            'dice' => ['prohibited'],
        ];
    }

    /**
     * Take the idempotency key from its documented header, never from the JSON body.
     *
     * @return array<string, mixed>
     */
    public function validationData(): array
    {
        return [
            ...$this->all(),
            'idempotency_key' => $this->header('Idempotency-Key'),
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'error' => [
                'code' => 'validation_failed',
                'message' => 'The turn command request is invalid.',
                'fields' => $validator->errors()->toArray(),
            ],
        ], 422));
    }
}
