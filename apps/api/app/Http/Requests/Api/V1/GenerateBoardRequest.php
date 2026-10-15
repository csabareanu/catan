<?php

namespace App\Http\Requests\Api\V1;

use App\Rules\CanonicalNonNegativeInt64String;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class GenerateBoardRequest extends FormRequest
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
            'seed' => [
                'bail',
                'required',
                ...CanonicalNonNegativeInt64String::rules(),
            ],
            'ruleset_key' => ['bail', 'required', 'string', Rule::in(['base'])],
            'map_key' => ['bail', 'required', 'string', Rule::in(['standard'])],
        ];
    }

    /**
     * Return stable JSON for public API validation failures.
     */
    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'error' => [
                'code' => 'validation_failed',
                'message' => 'The board generation request is invalid.',
                'fields' => $validator->errors()->toArray(),
            ],
        ], 422));
    }

    /**
     * Customize validation messages that are useful to API clients.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'seed.regex' => 'The seed must be a canonical non-negative integer string.',
            'ruleset_key.in' => 'The ruleset_key must be base.',
            'map_key.in' => 'The map_key must be standard.',
        ];
    }
}
