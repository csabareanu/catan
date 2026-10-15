<?php

namespace App\Rules;

use Closure;

final class CanonicalNonNegativeInt64String
{
    private const MAXIMUM = '9223372036854775807';

    /**
     * Return the shared rules for a canonical non-negative signed 64-bit string.
     *
     * The regex remains a built-in rule so each request can keep its existing
     * field-specific regex validation message.
     *
     * @return array<int, Closure|string>
     */
    public static function rules(): array
    {
        return [
            'string',
            'regex:/^(0|[1-9][0-9]*)$/',
            static function (string $attribute, mixed $value, Closure $fail): void {
                if (! is_string($value)) {
                    return;
                }

                if (strlen($value) > strlen(self::MAXIMUM)
                    || (strlen($value) === strlen(self::MAXIMUM) && strcmp($value, self::MAXIMUM) > 0)) {
                    $fail("The {$attribute} must fit in a signed 64-bit integer.");
                }
            },
        ];
    }
}
