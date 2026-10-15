<?php

namespace Tests\Unit;

use App\Rules\CanonicalNonNegativeInt64String;
use Illuminate\Support\Facades\Validator;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class CanonicalNonNegativeInt64StringTest extends TestCase
{
    public function test_it_accepts_canonical_values_through_the_signed_64_bit_boundary(): void
    {
        foreach (['0', '1', '9223372036854775807'] as $value) {
            $validator = Validator::make(
                ['value' => $value],
                ['value' => CanonicalNonNegativeInt64String::rules()],
            );

            $this->assertFalse($validator->fails(), "Expected {$value} to be valid.");
        }
    }

    #[DataProvider('invalidValues')]
    public function test_it_rejects_noncanonical_and_out_of_range_values(string $value): void
    {
        $validator = Validator::make(
            ['value' => $value],
            ['value' => CanonicalNonNegativeInt64String::rules()],
        );

        $this->assertTrue($validator->fails());
    }

    /**
     * @return array<string, array{string}>
     */
    public static function invalidValues(): array
    {
        return [
            'negative value' => ['-1'],
            'leading zero' => ['01'],
            'signed 64-bit overflow' => ['9223372036854775808'],
        ];
    }
}
