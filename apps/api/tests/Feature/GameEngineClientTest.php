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

    public function test_it_forwards_the_initial_placement_payload_and_accepts_a_valid_response(): void
    {
        $payload = $this->initialPlacementPayload();
        $engineResponse = $this->initialPlacementRunResponse($payload);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement' => Http::response($engineResponse, 200),
        ]);

        $response = app(GameEngineClient::class)->initialPlacementRun($payload);

        $this->assertSame($engineResponse, $response);
        Http::assertSent(function (ClientRequest $request) use ($payload): bool {
            return $request->method() === 'POST'
                && $request->url() === 'http://127.0.0.1:8080/v1/runs/initial-placement'
                && $request->data() === $payload;
        });
        Http::assertSentCount(1);
    }

    public function test_it_accepts_a_run_that_pauses_before_the_first_human_placement(): void
    {
        $payload = $this->bootstrapPayload();
        $engineResponse = $this->initialPlacementRunResponse($payload);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement' => Http::response($engineResponse, 200),
        ]);

        $response = app(GameEngineClient::class)->initialPlacementRun($payload);

        $this->assertSame($engineResponse, $response);
        $this->assertCount(2, $response['data']['transitions']);
    }

    public function test_it_accepts_a_completed_ai_only_run_with_second_round_events(): void
    {
        $payload = $this->initialPlacementAiPayload();
        $engineResponse = $this->initialPlacementRunResponse($payload);
        Http::preventStrayRequests();
        Http::fake([
            'http://127.0.0.1:8080/v1/runs/initial-placement' => Http::response($engineResponse, 200),
        ]);

        $response = app(GameEngineClient::class)->initialPlacementRun($payload);

        $this->assertSame('turn_ready', $response['data']['stop_reason']);
        $this->assertSame('turn_ready', $response['data']['transitions'][array_key_last($response['data']['transitions'])]['state']['phase']);
    }

    public function test_it_rejects_malformed_or_mismatched_initial_placement_responses(): void
    {
        $payload = $this->initialPlacementPayload();
        $invalidResponseMutations = [
            'missing data envelope' => function (array $response): array {
                unset($response['data']);

                return $response;
            },
            'unsupported run schema' => function (array $response): array {
                $response['data']['setup_run_schema_version'] = '2';

                return $response;
            },
            'mismatched seed' => function (array $response): array {
                $response['data']['seed'] = '894177203165';

                return $response;
            },
            'mismatched bootstrap seats' => function (array $response): array {
                $response['data']['transitions'][0]['payload']['seats'][0]['controller_type'] = 'human';

                return $response;
            },
            'wrong transition order' => function (array $response): array {
                $response['data']['transitions'][1]['command_type'] = 'place_initial_settlement_and_road.v1';

                return $response;
            },
            'incorrect setup state schema' => function (array $response): array {
                $response['data']['transitions'][1]['state_schema_version'] = 'state-v1';

                return $response;
            },
            'mismatched placement state seats' => function (array $response): array {
                $response['data']['transitions'][2]['state']['seats'][1]['controller_type'] = 'ai';

                return $response;
            },
            'human actor has policy decision' => function (array $response): array {
                $response['data']['transitions'][2]['acting_seat_number'] = 2;

                return $response;
            },
            'missing policy decision metadata' => function (array $response): array {
                unset($response['data']['transitions'][2]['decision_metadata']);

                return $response;
            },
            'unsupported policy version' => function (array $response): array {
                $response['data']['transitions'][2]['decision_metadata']['policy_version'] = 'random_placement.v2';

                return $response;
            },
            'empty policy option ID' => function (array $response): array {
                $response['data']['transitions'][2]['decision_metadata']['option_id'] = '';

                return $response;
            },
            'system transition has policy decision metadata' => function (array $response): array {
                $response['data']['transitions'][1]['decision_metadata'] = [
                    'policy_version' => 'random_placement.v1',
                    'option_id' => 'option-1',
                ];

                return $response;
            },
            'transition supplies command sequence' => function (array $response): array {
                $response['data']['transitions'][2]['command_sequence'] = 3;

                return $response;
            },
            'non-contiguous event sequence' => function (array $response): array {
                $response['data']['transitions'][2]['events'][0]['sequence'] = 5;

                return $response;
            },
            'private setup event' => function (array $response): array {
                $response['data']['transitions'][2]['events'][0]['visibility'] = 'seat_private';

                return $response;
            },
            'public event has recipient' => function (array $response): array {
                $response['data']['transitions'][2]['events'][0]['visible_to_seat_number'] = 1;

                return $response;
            },
            'road event differs from accepted command' => function (array $response): array {
                $response['data']['transitions'][2]['events'][1]['payload']['road_edge_id'] = 'edge-other';

                return $response;
            },
            'state omits the accepted road' => function (array $response): array {
                $response['data']['transitions'][2]['state']['players'][0]['roads'] = [];

                return $response;
            },
            'stop reason disagrees with final state' => function (array $response): array {
                $response['data']['stop_reason'] = 'turn_ready';

                return $response;
            },
        ];

        foreach ($invalidResponseMutations as $case => $mutate) {
            $engineResponse = $mutate($this->initialPlacementRunResponse($payload));
            Http::preventStrayRequests();
            Http::fake([
                'http://127.0.0.1:8080/v1/runs/initial-placement' => Http::response($engineResponse, 200),
            ]);

            $exception = null;

            try {
                app(GameEngineClient::class)->initialPlacementRun($payload);
            } catch (GameEngineProtocolException $caught) {
                $exception = $caught;
            }

            $this->assertInstanceOf(GameEngineProtocolException::class, $exception, "The {$case} response was accepted.");
            $this->assertSame(
                'The game engine returned an invalid initial placement run response.',
                $exception->getMessage(),
            );
        }
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

        $mismatchedSeed = $this->bootstrapResponse();
        $mismatchedSeed['data']['seed'] = '894177203165';

        $mismatchedBoardSeed = $this->bootstrapResponse();
        $mismatchedBoardSeed['data']['state']['board']['seed'] = '894177203165';

        $mismatchedSeats = $this->bootstrapResponse();
        $mismatchedSeats['data']['state']['seats'][0]['controller_type'] = 'ai';

        $mismatchedSeatCount = $this->bootstrapResponse();
        $mismatchedSeatCount['data']['events'][0]['payload']['seat_count'] = 4;

        $nonContiguousEvents = $this->bootstrapResponse();
        $nonContiguousEvents['data']['events'][] = [
            'sequence' => 3,
            'event_type' => 'bootstrap_checked.v1',
            'payload' => [],
            'visibility' => 'public',
            'visible_to_seat_number' => null,
        ];

        $invalidVisibility = $this->bootstrapResponse();
        $invalidVisibility['data']['events'][0]['visibility'] = 'private';

        $invalidPublicRecipient = $this->bootstrapResponse();
        $invalidPublicRecipient['data']['events'][0]['visible_to_seat_number'] = 1;

        $invalidPrivateRecipient = $this->bootstrapResponse();
        $invalidPrivateRecipient['data']['events'][] = [
            'sequence' => 2,
            'event_type' => 'bootstrap_checked.v1',
            'payload' => [],
            'visibility' => 'seat_private',
            'visible_to_seat_number' => 4,
        ];

        foreach ([
            'missing data envelope' => ['unexpected' => []],
            'missing state' => $missingState,
            'invalid event sequence type' => $invalidEventSequence,
            'mismatched seed' => $mismatchedSeed,
            'mismatched board seed' => $mismatchedBoardSeed,
            'mismatched seats' => $mismatchedSeats,
            'mismatched initialization seat count' => $mismatchedSeatCount,
            'non-contiguous events' => $nonContiguousEvents,
            'invalid visibility' => $invalidVisibility,
            'invalid public recipient' => $invalidPublicRecipient,
            'invalid private recipient' => $invalidPrivateRecipient,
        ] as $case => $engineResponse) {
            Http::fake([
                '*' => Http::response($engineResponse, 200),
            ]);

            $rejected = false;

            try {
                app(GameEngineClient::class)->bootstrapRun($this->bootstrapPayload());
            } catch (GameEngineProtocolException $exception) {
                $rejected = true;
                $this->assertSame(
                    'The game engine returned an invalid bootstrap response.',
                    $exception->getMessage(),
                );
            }

            $this->assertTrue($rejected, "The {$case} response was accepted.");
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
     * @return array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }
     */
    private function initialPlacementPayload(): array
    {
        return [
            'seed' => '894177203164',
            'ruleset_key' => 'base',
            'map_key' => 'standard',
            'seats' => [
                ['seat_number' => 1, 'controller_type' => 'ai'],
                ['seat_number' => 2, 'controller_type' => 'human'],
                ['seat_number' => 3, 'controller_type' => 'ai'],
            ],
        ];
    }

    /**
     * @return array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }
     */
    private function initialPlacementAiPayload(): array
    {
        $payload = $this->initialPlacementPayload();

        foreach ($payload['seats'] as &$seat) {
            $seat['controller_type'] = 'ai';
        }

        unset($seat);

        return $payload;
    }

    /**
     * @param  array{
     *     seed: string,
     *     ruleset_key: string,
     *     map_key: string,
     *     seats: list<array{seat_number: int, controller_type: string}>
     * }  $payload
     * @return array{data: array<string, mixed>}
     *
     * The captured Go response stores its invariant board geometry once; this
     * helper restores that board to each transition state before the HTTP fake.
     */
    private function initialPlacementRunResponse(array $payload): array
    {
        $fixturePath = __DIR__.'/../Fixtures/initial-placement-ai-run.json';
        $response = json_decode((string) file_get_contents($fixturePath), true, 512, JSON_THROW_ON_ERROR);
        $transitions = $response['data']['transitions'];
        $transitionCount = count($transitions);

        foreach (array_slice($transitions, 2) as $offset => $transition) {
            $actingSeatNumber = $transition['acting_seat_number'];

            if ($payload['seats'][$actingSeatNumber - 1]['controller_type'] === 'human') {
                $transitionCount = $offset + 2;
                break;
            }
        }

        $transitions = array_slice($transitions, 0, $transitionCount);
        $board = $transitions[0]['state']['board'];

        foreach ($transitions as $index => &$transition) {
            $transition['state']['board'] = $board;
            $transition['state']['seats'] = $payload['seats'];

            if ($index === 0) {
                $transition['payload']['seats'] = $payload['seats'];
            }
        }

        unset($transition);

        $response['data']['transitions'] = $transitions;
        $response['data']['stop_reason'] = $transitions[array_key_last($transitions)]['state']['phase'] === 'turn_ready'
            ? 'turn_ready'
            : 'human_input_required';

        return $response;
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
