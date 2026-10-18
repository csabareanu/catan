<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class ListGamesRequest extends FormRequest
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
            'view' => [
                'bail',
                'sometimes',
                'string',
                Rule::in(['all', 'saved_setups', 'in_progress', 'history']),
            ],
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
                'message' => 'The game list request is invalid.',
                'fields' => $validator->errors()->toArray(),
            ],
        ], 422));
    }

    /**
     * Customize the view validation message for API clients.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'view.in' => 'The view must be all, saved_setups, in_progress, or history.',
        ];
    }
}
