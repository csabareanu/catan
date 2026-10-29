package httpapi_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"catan.local/game-engine/internal/execution"
	"catan.local/game-engine/internal/httpapi"
)

const initialPlacementRunPath = "/v1/runs/initial-placement"

type initialPlacementRunTestSeat struct {
	SeatNumber     int    `json:"seat_number"`
	ControllerType string `json:"controller_type"`
}

type initialPlacementRunTestRequest struct {
	Seed       string                        `json:"seed"`
	RulesetKey string                        `json:"ruleset_key"`
	MapKey     string                        `json:"map_key"`
	Seats      []initialPlacementRunTestSeat `json:"seats"`
}

type initialPlacementRunTestResponse struct {
	Data struct {
		SetupRunSchemaVersion string `json:"setup_run_schema_version"`
		Seed                  string `json:"seed"`
		Ruleset               struct {
			Key     string `json:"key"`
			Version string `json:"version"`
		} `json:"ruleset"`
		Map struct {
			Key         string `json:"key"`
			Version     string `json:"version"`
			Orientation string `json:"orientation"`
		} `json:"map"`
		StopReason  string                              `json:"stop_reason"`
		Transitions []initialPlacementRunTestTransition `json:"transitions"`
	} `json:"data"`
}

type initialPlacementRunTestTransition struct {
	CommandType        string                         `json:"command_type"`
	ActingSeatNumber   *int                           `json:"acting_seat_number"`
	Payload            map[string]json.RawMessage     `json:"payload"`
	DecisionMetadata   json.RawMessage                `json:"decision_metadata"`
	StateSchemaVersion string                         `json:"state_schema_version"`
	CommandSequence    json.RawMessage                `json:"command_sequence"`
	State              map[string]json.RawMessage     `json:"state"`
	Events             []initialPlacementRunTestEvent `json:"events"`
}

type initialPlacementRunTestEvent struct {
	Sequence            int                        `json:"sequence"`
	EventType           string                     `json:"event_type"`
	Payload             map[string]json.RawMessage `json:"payload"`
	Visibility          string                     `json:"visibility"`
	VisibleToSeatNumber *int                       `json:"visible_to_seat_number"`
}

func TestInitialPlacementRunReturnsDeterministicVersionedThreeAndFourSeatResults(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d AI seats", seatCount), func(t *testing.T) {
			body := initialPlacementRunRequestBody(t, seatCount, "ai")
			handler := httpapi.NewHandler()
			first := sendInitialPlacementRunRequest(t, handler, http.MethodPost, body)
			repeated := sendInitialPlacementRunRequest(t, handler, http.MethodPost, body)

			if first.Code != http.StatusOK {
				t.Fatalf("first response status = %d, want %d: %s", first.Code, http.StatusOK, first.Body)
			}
			if first.Header().Get("Content-Type") != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", first.Header().Get("Content-Type"))
			}
			if !bytes.Equal(first.Body.Bytes(), repeated.Body.Bytes()) {
				t.Fatalf("identical request returned different JSON bodies\nfirst:  %s\nsecond: %s", first.Body, repeated.Body)
			}

			var response initialPlacementRunTestResponse
			if err := json.Unmarshal(first.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response.Data.SetupRunSchemaVersion != "1" || response.Data.StopReason != "turn_ready" {
				t.Fatalf("run metadata = schema %q, stop reason %q; want schema 1 and turn_ready", response.Data.SetupRunSchemaVersion, response.Data.StopReason)
			}
			if response.Data.Seed != "1" || response.Data.Ruleset.Key != "base" || response.Data.Ruleset.Version != "1.0.0" {
				t.Errorf("run identity = seed %q, ruleset %+v", response.Data.Seed, response.Data.Ruleset)
			}
			if response.Data.Map.Key != "standard" || response.Data.Map.Version != "1.0.0" || response.Data.Map.Orientation != "pointy" {
				t.Errorf("map metadata = %+v, want standard 1.0.0 pointy", response.Data.Map)
			}
			if got, want := len(response.Data.Transitions), 2+seatCount*2; got != want {
				t.Fatalf("transition count = %d, want %d", got, want)
			}

			bootstrap := response.Data.Transitions[0]
			if bootstrap.CommandType != "bootstrap.v1" || bootstrap.ActingSeatNumber != nil || bootstrap.DecisionMetadata == nil || string(bootstrap.DecisionMetadata) != "null" {
				t.Errorf("bootstrap transition = %+v, want system bootstrap with null actor and decision", bootstrap)
			}
			if bootstrap.StateSchemaVersion != "state-v1" || string(bootstrap.State["phase"]) != `"initialized"` {
				t.Errorf("bootstrap state schema/phase = %q/%s", bootstrap.StateSchemaVersion, bootstrap.State["phase"])
			}
			if got := bootstrap.Events[0]; got.Sequence != 1 || got.EventType != "game_initialized.v1" || got.Payload["seat_count"] == nil {
				t.Errorf("bootstrap event = %+v, want initialized event with seat_count", got)
			}

			setupStart := response.Data.Transitions[1]
			if setupStart.CommandType != "begin_initial_placement.v1" || setupStart.ActingSeatNumber != nil || string(setupStart.DecisionMetadata) != "null" {
				t.Errorf("setup-start transition = %+v, want system transition with null actor and decision", setupStart)
			}
			if len(setupStart.Payload) != 0 || setupStart.StateSchemaVersion != "state-v2" {
				t.Errorf("setup-start payload/schema = %v/%q, want empty payload and state-v2", setupStart.Payload, setupStart.StateSchemaVersion)
			}
			if got := setupStart.Events[0]; got.Sequence != 2 || got.EventType != "initial_placement_started.v1" || got.Payload["seat_order"] == nil {
				t.Errorf("setup-start event = %+v, want ordered start event at sequence 2", got)
			}

			wantEventSequence := 1
			seenResourceGrant := false
			seenCompletion := false
			for _, transition := range response.Data.Transitions {
				if transition.CommandSequence != nil {
					t.Errorf("transition unexpectedly contains command_sequence: %s", transition.CommandSequence)
				}
				for _, event := range transition.Events {
					if event.Sequence != wantEventSequence {
						t.Errorf("event %q sequence = %d, want %d", event.EventType, event.Sequence, wantEventSequence)
					}
					wantEventSequence++
					if event.Visibility != "public" || event.VisibleToSeatNumber != nil {
						t.Errorf("event visibility = %q for seat %v, want public and null", event.Visibility, event.VisibleToSeatNumber)
					}
					switch event.EventType {
					case "initial_settlement_placed.v1":
						if event.Payload["settlement_vertex_id"] == nil {
							t.Errorf("settlement event payload = %v, missing settlement_vertex_id", event.Payload)
						}
					case "initial_road_placed.v1":
						if event.Payload["settlement_vertex_id"] == nil || event.Payload["road_edge_id"] == nil {
							t.Errorf("road event payload = %v, want settlement_vertex_id and road_edge_id", event.Payload)
						}
					case "initial_resources_granted.v1":
						seenResourceGrant = true
						var resources map[string]json.RawMessage
						if err := json.Unmarshal(event.Payload["resources"], &resources); err != nil {
							t.Fatalf("decode resource grant: %v", err)
						}
						if resources["lumber"] == nil || resources["wool"] == nil || resources["grain"] == nil || resources["brick"] == nil || resources["ore"] == nil {
							t.Errorf("resource event payload = %v, want lowercase resource counts", resources)
						}
					case "initial_placement_completed.v1":
						seenCompletion = true
						if string(event.Payload["next_phase"]) != `"turn_ready"` {
							t.Errorf("completion payload = %v, want next_phase turn_ready", event.Payload)
						}
					}
				}

				if transition.CommandType == "place_initial_settlement_and_road.v1" {
					if transition.ActingSeatNumber == nil || transition.DecisionMetadata == nil {
						t.Errorf("AI transition = %+v, want acting seat and decision metadata", transition)
						continue
					}
					if transition.Payload["settlement_vertex_id"] == nil || transition.Payload["road_edge_id"] == nil {
						t.Errorf("AI command payload = %v, want settlement and road IDs", transition.Payload)
					}
					var decision struct {
						PolicyVersion string `json:"policy_version"`
						OptionID      string `json:"option_id"`
					}
					if err := json.Unmarshal(transition.DecisionMetadata, &decision); err != nil {
						t.Fatalf("decode AI decision metadata: %v", err)
					}
					if decision.PolicyVersion != "random_placement.v1" || decision.OptionID == "" {
						t.Errorf("decision metadata = %+v, want policy version and option ID", decision)
					}
				}
			}

			if !seenResourceGrant || !seenCompletion {
				t.Errorf("serialized AI-only run saw resource grant %v and completion %v; want both", seenResourceGrant, seenCompletion)
			}
			last := response.Data.Transitions[len(response.Data.Transitions)-1]
			if string(last.State["phase"]) != `"turn_ready"` {
				t.Errorf("final state phase = %s, want turn_ready", last.State["phase"])
			}
		})
	}
}

func TestInitialPlacementRunStopsAtHumanSeatAndDoesNotEmitItsCommand(t *testing.T) {
	config := execution.BootstrapConfig{
		Seed:       "1",
		RulesetKey: "base",
		MapKey:     "standard",
		Seats: []execution.Seat{
			{SeatNumber: 1, ControllerType: execution.ControllerAI},
			{SeatNumber: 2, ControllerType: execution.ControllerAI},
			{SeatNumber: 3, ControllerType: execution.ControllerAI},
		},
	}
	bootstrap, err := execution.Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}
	started, err := execution.BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	humanSeat := started.State.SeatOrder[1]
	for index := range config.Seats {
		if config.Seats[index].SeatNumber == humanSeat {
			config.Seats[index].ControllerType = execution.ControllerHuman
		}
	}

	body := initialPlacementRunRequestBody(t, 3, "ai")
	var request initialPlacementRunTestRequest
	if err := json.Unmarshal([]byte(body), &request); err != nil {
		t.Fatalf("decode test request: %v", err)
	}
	for index := range request.Seats {
		if request.Seats[index].SeatNumber == humanSeat {
			request.Seats[index].ControllerType = "human"
		}
	}
	body = marshalInitialPlacementRunRequest(t, request)

	response := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodPost, body)
	if response.Code != http.StatusOK {
		t.Fatalf("response status = %d, want %d: %s", response.Code, http.StatusOK, response.Body)
	}

	var decoded initialPlacementRunTestResponse
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if decoded.Data.StopReason != "human_input_required" {
		t.Fatalf("stop reason = %q, want human_input_required", decoded.Data.StopReason)
	}
	if len(decoded.Data.Transitions) != 3 {
		t.Fatalf("transition count = %d, want bootstrap, setup start, and one AI placement", len(decoded.Data.Transitions))
	}
	placement := decoded.Data.Transitions[2]
	if placement.CommandType != "place_initial_settlement_and_road.v1" || placement.ActingSeatNumber == nil || *placement.ActingSeatNumber != started.State.SeatOrder[0] {
		t.Errorf("last transition = %+v, want one placement by first ordered AI seat", placement)
	}
	if string(placement.State["phase"]) != `"initial_placement"` || string(placement.State["active_seat_number"]) != fmt.Sprintf("%d", humanSeat) {
		t.Errorf("state after AI placement has phase %s and active seat %s; want human seat %d", placement.State["phase"], placement.State["active_seat_number"], humanSeat)
	}
	for _, transition := range decoded.Data.Transitions {
		if transition.ActingSeatNumber != nil && *transition.ActingSeatNumber == humanSeat {
			t.Errorf("run emitted a command for human seat %d", humanSeat)
		}
	}
}

func TestInitialPlacementRunRejectsMalformedRequests(t *testing.T) {
	validRequest := initialPlacementRunRequestBody(t, 3, "ai")
	tests := []struct {
		name        string
		requestBody string
		wantStatus  int
		wantCode    string
	}{
		{name: "malformed JSON", requestBody: `{"seed":`, wantStatus: http.StatusBadRequest, wantCode: "invalid_json"},
		{name: "trailing JSON", requestBody: `{"seed":"1","ruleset_key":"base","map_key":"standard","seats":[]} {}`, wantStatus: http.StatusBadRequest, wantCode: "invalid_json"},
		{name: "numeric seed", requestBody: `{"seed":1,"ruleset_key":"base","map_key":"standard","seats":[]}`, wantStatus: http.StatusUnprocessableEntity, wantCode: "invalid_request"},
		{name: "invalid seed", requestBody: strings.Replace(validRequest, `"seed":"1"`, `"seed":"01"`, 1), wantStatus: http.StatusUnprocessableEntity, wantCode: "invalid_seed"},
		{name: "unsupported ruleset", requestBody: strings.Replace(validRequest, `"ruleset_key":"base"`, `"ruleset_key":"seafarers"`, 1), wantStatus: http.StatusUnprocessableEntity, wantCode: "unsupported_ruleset"},
		{name: "unsupported map", requestBody: strings.Replace(validRequest, `"map_key":"standard"`, `"map_key":"archipelago"`, 1), wantStatus: http.StatusUnprocessableEntity, wantCode: "unsupported_map"},
		{name: "invalid seat count", requestBody: `{"seed":"1","ruleset_key":"base","map_key":"standard","seats":[{"seat_number":1,"controller_type":"human"},{"seat_number":2,"controller_type":"ai"}]}`, wantStatus: http.StatusUnprocessableEntity, wantCode: "invalid_seats"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodPost, test.requestBody)
			assertAPIError(t, response, test.wantStatus, test.wantCode)
		})
	}
}

func TestInitialPlacementRunRequiresPOST(t *testing.T) {
	response := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodGet, "")

	assertAPIError(t, response, http.StatusMethodNotAllowed, "method_not_allowed")
	if allow := response.Header().Get("Allow"); allow != http.MethodPost {
		t.Errorf("Allow = %q, want POST", allow)
	}
}

func initialPlacementRunRequestBody(t *testing.T, seatCount int, controller string) string {
	t.Helper()
	seats := make([]initialPlacementRunTestSeat, seatCount)
	for index := range seats {
		seats[index] = initialPlacementRunTestSeat{SeatNumber: index + 1, ControllerType: controller}
	}
	return marshalInitialPlacementRunRequest(t, initialPlacementRunTestRequest{
		Seed:       "1",
		RulesetKey: "base",
		MapKey:     "standard",
		Seats:      seats,
	})
}

func marshalInitialPlacementRunRequest(t *testing.T, request initialPlacementRunTestRequest) string {
	t.Helper()
	body, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}
	return string(body)
}

func sendInitialPlacementRunRequest(t *testing.T, handler http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(method, initialPlacementRunPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
