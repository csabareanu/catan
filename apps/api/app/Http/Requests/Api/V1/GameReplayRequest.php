<?php

namespace App\Http\Requests\Api\V1;

use App\Rules\CanonicalNonNegativeInt64String;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class GameReplayRequest extends FormRequest
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
            'after_event_sequence' => [
                'sometimes',
                'bail',
                ...CanonicalNonNegativeInt64String::rules(),
            ],
            'limit' => ['sometimes', 'bail', 'integer', 'between:1,100'],
            'at_command_sequence' => [
                'sometimes',
                'bail',
                ...CanonicalNonNegativeInt64String::rules(),
            ],
        ];
    }

    /**
     * Get the validated event cursor, defaulting to the beginning of history.
     */
    public function afterEventSequence(): string
    {
        return (string) ($this->validated('after_event_sequence') ?? '0');
    }

    /**
     * Get the validated page size, defaulting to the public replay limit.
     */
    public function limit(): int
    {
        return (int) ($this->validated('limit') ?? 50);
    }

    /**
     * Get the requested command position, when one was supplied.
     */
    public function atCommandSequence(): ?string
    {
        $value = $this->validated('at_command_sequence');

        return $value === null ? null : (string) $value;
    }

    /**
     * Return stable JSON for public API validation failures.
     */
    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'error' => [
                'code' => 'validation_failed',
                'message' => 'The game replay request is invalid.',
                'fields' => $validator->errors()->toArray(),
            ],
        ], 422));
    }

    /**
     * Customize messages for malformed replay parameters.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'after_event_sequence.regex' => 'The after_event_sequence must be a canonical non-negative integer string.',
            'at_command_sequence.regex' => 'The at_command_sequence must be a canonical non-negative integer string.',
            'limit.between' => 'The limit must be between 1 and 100.',
        ];
    }
}
