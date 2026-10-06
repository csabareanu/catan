<?php

namespace Tests\Feature;

use App\Exceptions\GameEngineProtocolException;
use App\Exceptions\GameEngineUnavailable;
use App\Services\GameEngineClient;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GameEngineClientTest extends TestCase
{
    public function test_it_forwards_the_exact_bootstrap_payload_and_accepts_a_valid_response(): void
    {
        $payload = $this->bootstrapPayload();
        $engineResponse = $this->bootstrapResponse();
        Http::fake([
            '*' => Http::response($engineResponse, 200),
        ]);

        $response = app(GameEngineClient::class)->bootstrapRun($payload);

        $this->assertSame($engineResponse, $response);
        Http::assertSent(function (ClientRequest $request) use ($payload): bool {
            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/runs/bootstrap'
                && $request->data() === $payload;
        });
        Http::assertSentCount(1);
    }

    public function test_it_classifies_a_connection_failure_as_engine_unavailable(): void
    {
        Http::fake(function (): never {
            throw new ConnectionException('connection refused');
        });

        $this->expectException(GameEngineUnavailable::class);
        $this->expectExceptionMessage('The game engine could not be reached.');

        app(GameEngineClient::class)->bootstrapRun($this->bootstrapPayload());
    }

    public function test_it_classifies_a_non_success_response_as_a_protocol_failure(): void
    {
        Http::fake([
            '*' => Http::response([
                'error' => [
                    'code' => 'invalid_seats',
                    'message' => 'The bootstrap run must contain three or four unique seats.',
                ],
            ], 422),
        ]);

        $this->expectException(GameEngineProtocolException::class);
        $this->expectExceptionMessage('The game engine returned HTTP 422.');

        app(GameEngineClient::class)->bootstrapRun($this->bootstrapPayload());
    }

    public function test_it_rejects_malformed_successful_responses(): void
    {
        $missingState = $this->bootstrapResponse();
        unset($missingState['data']['state']);

        $invalidEventSequence = $this->bootstrapResponse();
        $invalidEventSequence['data']['events'][0]['sequence'] = '1';

        foreach ([
            'missing data envelope' => ['unexpected' => []],
            'missing state' => $missingState,
            'invalid event sequence type' => $invalidEventSequence,
        ] as $case => $engineResponse) {
            Http::fake([
                '*' => Http::response($engineResponse, 200),
            ]);

            try {
                app(GameEngineClient::class)->bootstrapRun($this->bootstrapPayload());
                $this->fail("The {$case} response was accepted.");
            } catch (GameEngineProtocolException $exception) {
                $this->assertSame(
                    'The game engine returned an invalid bootstrap response.',
                    $exception->getMessage(),
                );
            }
        }
    }

    /**
     * @return array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }
     */
    private function bootstrapPayload(): array
    {
        return [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
            'seats' => [
                ['seat_number' => 1, 'controller_type' => 'human'],
                ['seat_number' => 2, 'controller_type' => 'ai'],
                ['seat_number' => 3, 'controller_type' => 'ai'],
            ],
        ];
    }

    /**
     * @return array{data: array<string, mixed>}
     */
    private function bootstrapResponse(): array
    {
        return [
            'data' => [
                'execution_schema_version' => '1',
                'state_schema_version' => 'state-v1',
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
                'state' => [
                    'phase' => 'initialized',
                    'board' => [
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
                    'seats' => [
                        ['seat_number' => 1, 'controller_type' => 'human'],
                        ['seat_number' => 2, 'controller_type' => 'ai'],
                        ['seat_number' => 3, 'controller_type' => 'ai'],
                    ],
                ],
                'events' => [
                    [
                        'sequence' => 1,
                        'event_type' => 'game_initialized.v1',
                        'payload' => [
                            'seed' => '894177203164',
                            'seat_count' => 3,
                        ],
                        'visibility' => 'public',
                        'visible_to_seat_number' => null,
                    ],
                ],
            ],
        ];
    }
}
