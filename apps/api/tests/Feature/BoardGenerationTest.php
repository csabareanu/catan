<?php

namespace Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class BoardGenerationTest extends TestCase
{
    public function test_it_forwards_a_valid_request_and_returns_the_board_contract(): void
    {
        $payload = [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
        ];
        $boardResponse = $this->boardResponse();

        Http::fake([
            '*' => Http::response($boardResponse, 200),
        ]);

        $response = $this->postJson('/api/v1/boards/generate', $payload);

        $response->assertOk()->assertExactJson($boardResponse);
        Http::assertSent(function (ClientRequest $request) use ($payload): bool {
            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/boards/generate'
                && $request->data() === $payload;
        });
    }

    public function test_validation_fails_without_calling_the_game_engine(): void
    {
        Http::fake();

        $response = $this->postJson('/api/v1/boards/generate', [
            'seed' => '0894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('error.code', 'validation_failed')
            ->assertJsonPath('error.fields.seed.0', 'The seed must be a canonical non-negative integer string.');
        Http::assertNothingSent();
    }

    public function test_unavailable_game_engine_returns_a_safe_503_error(): void
    {
        Http::fake(function (): never {
            throw new ConnectionException('connection refused');
        });

        $response = $this->postJson('/api/v1/boards/generate', $this->validPayload());

        $response->assertStatus(503)->assertExactJson([
            'error' => [
                'code' => 'game_engine_unavailable',
                'message' => 'The board generation service is unavailable.',
            ],
        ]);
    }

    public function test_malformed_game_engine_response_returns_a_safe_502_error(): void
    {
        Http::fake([
            '*' => Http::response(['data' => ['seed' => '894177203164']], 200),
        ]);

        $response = $this->postJson('/api/v1/boards/generate', $this->validPayload());

        $response->assertStatus(502)->assertExactJson([
            'error' => [
                'code' => 'invalid_game_engine_response',
                'message' => 'The board generation service returned an invalid response.',
            ],
        ]);
    }

    /**
     * @return array{seed: string, ruleset_key: string, map_key: string}
     */
    private function validPayload(): array
    {
        return [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
        ];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    private function boardResponse(): array
    {
        return [
            'data' => [
                'board_schema_version' => '1',
                'seed' => '894177203164',
                'ruleset' => [
                    'key' => 'base',
                    'version' => '1.0.0',
                ],
                'map' => [
                    'key' => 'standard',
                    'version' => '1.0.0',
                    'orientation' => 'pointy',
                ],
                'hexes' => [],
                'vertices' => [],
                'edges' => [],
                'ports' => [],
            ],
        ];
    }
}
