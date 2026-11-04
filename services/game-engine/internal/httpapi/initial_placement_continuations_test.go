package httpapi_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"catan.local/game-engine/internal/httpapi"
)

const (
	initialPlacementOptionsPath  = "/v1/initial-placement/options"
	initialPlacementContinuePath = "/v1/runs/initial-placement/continue"
	initialPlacementCommandType  = "place_initial_settlement_and_road.v1"
)

type placementStateFixture struct {
	State             map[string]any
	GameConfiguration map[string]any
	ActiveSeatNumber  int
	NextEventSequence int
}

func TestInitialPlacementOptionsReturnsVersionedLegalPairsWithoutResources(t *testing.T) {
	fixture := newPlacementStateFixture(t, "human", "human")
	response := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementOptionsPath, optionsRequestBody(t, fixture.State))
	if response.Code != http.StatusOK {
		t.Fatalf("response status = %d, want %d: %s", response.Code, http.StatusOK, response.Body)
	}
	if strings.Contains(response.Body.String(), "resources") {
		t.Fatalf("options response leaked canonical resource state: %s", response.Body)
	}

	var decoded struct {
		Data struct {
			SchemaVersion    string `json:"initial_placement_options_schema_version"`
			ActiveSeatNumber int    `json:"active_seat_number"`
			Round            int    `json:"round"`
			Options          []struct {
				SettlementVertexID string `json:"settlement_vertex_id"`
				RoadEdgeID         string `json:"road_edge_id"`
			} `json:"options"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode options response: %v", err)
	}
	if decoded.Data.SchemaVersion != "1" || decoded.Data.ActiveSeatNumber != fixture.ActiveSeatNumber || decoded.Data.Round != 1 {
		t.Errorf("options metadata = schema %q, active seat %d, round %d", decoded.Data.SchemaVersion, decoded.Data.ActiveSeatNumber, decoded.Data.Round)
	}
	if len(decoded.Data.Options) == 0 {
		t.Fatal("options response returned no legal settlement-road pairs")
	}
	for _, option := range decoded.Data.Options {
		if option.SettlementVertexID == "" || option.RoadEdgeID == "" {
			t.Errorf("returned incomplete legal pair: %+v", option)
		}
	}
}

func TestInitialPlacementContinuationSerializesHumanAndAITransitions(t *testing.T) {
	fixture := newPlacementStateFixture(t, "human", "ai")
	optionsResponse := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementOptionsPath, optionsRequestBody(t, fixture.State))
	if optionsResponse.Code != http.StatusOK {
		t.Fatalf("options response status = %d, want %d: %s", optionsResponse.Code, http.StatusOK, optionsResponse.Body)
	}
	var options struct {
		Data struct {
			Options []struct {
				SettlementVertexID string `json:"settlement_vertex_id"`
				RoadEdgeID         string `json:"road_edge_id"`
			} `json:"options"`
		} `json:"data"`
	}
	if err := json.Unmarshal(optionsResponse.Body.Bytes(), &options); err != nil {
		t.Fatalf("decode options: %v", err)
	}
	if len(options.Data.Options) == 0 {
		t.Fatal("options response returned no legal pair")
	}

	pair := options.Data.Options[0]
	requestBody := continuationRequestBody(t, fixture, pair.SettlementVertexID, pair.RoadEdgeID)
	response := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementContinuePath, requestBody)
	if response.Code != http.StatusOK {
		t.Fatalf("continuation response status = %d, want %d: %s", response.Code, http.StatusOK, response.Body)
	}

	var decoded struct {
		Data struct {
			SchemaVersion string `json:"setup_continuation_schema_version"`
			StopReason    string `json:"stop_reason"`
			Transitions   []struct {
				CommandType        string          `json:"command_type"`
				ActingSeatNumber   *int            `json:"acting_seat_number"`
				DecisionMetadata   json.RawMessage `json:"decision_metadata"`
				StateSchemaVersion string          `json:"state_schema_version"`
				State              struct {
					Phase string `json:"phase"`
				} `json:"state"`
				Events []struct {
					Sequence int `json:"sequence"`
				} `json:"events"`
			} `json:"transitions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode continuation response: %v", err)
	}
	if decoded.Data.SchemaVersion != "1" || decoded.Data.StopReason != "human_input_required" {
		t.Fatalf("continuation metadata = schema %q, stop reason %q", decoded.Data.SchemaVersion, decoded.Data.StopReason)
	}
	if len(decoded.Data.Transitions) < 2 {
		t.Fatalf("transition count = %d, want human transition followed by at least one AI transition", len(decoded.Data.Transitions))
	}

	first := decoded.Data.Transitions[0]
	if first.CommandType != initialPlacementCommandType || first.ActingSeatNumber == nil || *first.ActingSeatNumber != fixture.ActiveSeatNumber || string(first.DecisionMetadata) != "null" {
		t.Errorf("first transition = %+v, want explicit human command without AI decision metadata", first)
	}
	for index, transition := range decoded.Data.Transitions {
		if transition.StateSchemaVersion != "state-v2" || transition.State.Phase != "initial_placement" {
			t.Errorf("transition %d state schema/phase = %q/%q", index, transition.StateSchemaVersion, transition.State.Phase)
		}
		if len(transition.Events) == 0 {
			t.Errorf("transition %d has no events", index)
		}
		if index == 0 {
			continue
		}
		if transition.CommandType != initialPlacementCommandType || transition.ActingSeatNumber == nil || *transition.ActingSeatNumber == fixture.ActiveSeatNumber || string(transition.DecisionMetadata) == "null" {
			t.Errorf("AI transition %d = %+v, want another seat and policy decision metadata", index, transition)
		}
		var decision struct {
			PolicyVersion string `json:"policy_version"`
			OptionID      string `json:"option_id"`
		}
		if err := json.Unmarshal(transition.DecisionMetadata, &decision); err != nil {
			t.Fatalf("decode AI decision metadata: %v", err)
		}
		if decision.PolicyVersion != "random_placement.v1" || decision.OptionID == "" {
			t.Errorf("AI decision metadata = %+v", decision)
		}
	}

	wantEventSequence := 3
	for _, transition := range decoded.Data.Transitions {
		for _, event := range transition.Events {
			if event.Sequence != wantEventSequence {
				t.Errorf("event sequence = %d, want %d", event.Sequence, wantEventSequence)
			}
			wantEventSequence++
		}
	}
}

func TestInitialPlacementContinuationStopsAtTurnReadyAfterFinalHumanPlacement(t *testing.T) {
	fixture := newFinalPlacementStateFixture(t)
	optionsResponse := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementOptionsPath, optionsRequestBody(t, fixture.State))
	if optionsResponse.Code != http.StatusOK {
		t.Fatalf("options response status = %d, want %d: %s", optionsResponse.Code, http.StatusOK, optionsResponse.Body)
	}
	var options struct {
		Data struct {
			Options []struct {
				SettlementVertexID string `json:"settlement_vertex_id"`
				RoadEdgeID         string `json:"road_edge_id"`
			} `json:"options"`
		} `json:"data"`
	}
	if err := json.Unmarshal(optionsResponse.Body.Bytes(), &options); err != nil {
		t.Fatalf("decode options: %v", err)
	}
	if len(options.Data.Options) == 0 {
		t.Fatal("options response returned no legal pair for the final setup placement")
	}

	pair := options.Data.Options[0]
	response := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementContinuePath, continuationRequestBody(t, fixture, pair.SettlementVertexID, pair.RoadEdgeID))
	if response.Code != http.StatusOK {
		t.Fatalf("continuation response status = %d, want %d: %s", response.Code, http.StatusOK, response.Body)
	}
	var decoded struct {
		Data struct {
			SchemaVersion string `json:"setup_continuation_schema_version"`
			StopReason    string `json:"stop_reason"`
			Transitions   []struct {
				DecisionMetadata json.RawMessage `json:"decision_metadata"`
				StateSchema      string          `json:"state_schema_version"`
				State            struct {
					Phase string `json:"phase"`
				} `json:"state"`
			} `json:"transitions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode continuation response: %v", err)
	}
	if decoded.Data.SchemaVersion != "1" || decoded.Data.StopReason != "turn_ready" || len(decoded.Data.Transitions) != 1 {
		t.Fatalf("continuation metadata/transitions = schema %q, stop reason %q, count %d", decoded.Data.SchemaVersion, decoded.Data.StopReason, len(decoded.Data.Transitions))
	}
	if decoded.Data.Transitions[0].StateSchema != "state-v2" || decoded.Data.Transitions[0].State.Phase != "turn_ready" || string(decoded.Data.Transitions[0].DecisionMetadata) != "null" {
		t.Errorf("final human transition = %+v, want state-v2 turn_ready with null AI decision metadata", decoded.Data.Transitions[0])
	}
}

func TestInitialPlacementEndpointsRejectAIActiveSeats(t *testing.T) {
	fixture := newPlacementStateFixture(t, "ai", "ai")

	options := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementOptionsPath, optionsRequestBody(t, fixture.State))
	assertAPIError(t, options, http.StatusUnprocessableEntity, "active_seat_not_human")

	continuation := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementContinuePath, continuationRequestBody(t, fixture, "v0", "e0"))
	assertAPIError(t, continuation, http.StatusUnprocessableEntity, "active_seat_not_human")
}

func TestInitialPlacementHTTPContractsRejectMalformedRequests(t *testing.T) {
	fixture := newPlacementStateFixture(t, "human", "human")
	tests := []struct {
		name       string
		path       string
		body       string
		wantStatus int
		wantCode   string
	}{
		{name: "malformed JSON", path: initialPlacementOptionsPath, body: `{"state":`, wantStatus: http.StatusBadRequest, wantCode: "invalid_json"},
		{name: "unsupported state schema", path: initialPlacementOptionsPath, body: strings.Replace(optionsRequestBody(t, fixture.State), `"state-v2"`, `"state-v1"`, 1), wantStatus: http.StatusUnprocessableEntity, wantCode: "unsupported_state_schema_version"},
		{name: "wrong state field type", path: initialPlacementOptionsPath, body: strings.Replace(optionsRequestBody(t, fixture.State), `"round":1`, `"round":"one"`, 1), wantStatus: http.StatusUnprocessableEntity, wantCode: "invalid_request"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendPlacementRequest(t, httpapi.NewHandler(), test.path, test.body)
			assertAPIError(t, response, test.wantStatus, test.wantCode)
		})
	}

	configuration := fixture.GameConfiguration
	configuration["seed"] = "2"
	body := continuationRequestBodyWithConfig(t, fixture, configuration, "v0", "e0")
	response := sendPlacementRequest(t, httpapi.NewHandler(), initialPlacementContinuePath, body)
	assertAPIError(t, response, http.StatusUnprocessableEntity, "invalid_game_configuration")
}

func newPlacementStateFixture(t *testing.T, activeController, otherController string) placementStateFixture {
	t.Helper()
	runResponse := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodPost, initialPlacementRunRequestBody(t, 3, "human"))
	if runResponse.Code != http.StatusOK {
		t.Fatalf("setup fixture run status = %d, want %d: %s", runResponse.Code, http.StatusOK, runResponse.Body)
	}
	var run struct {
		Data struct {
			Transitions []struct {
				State json.RawMessage `json:"state"`
			} `json:"transitions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(runResponse.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode setup fixture run: %v", err)
	}
	if len(run.Data.Transitions) < 2 {
		t.Fatal("setup fixture run has no initial placement state")
	}
	var state map[string]any
	if err := json.Unmarshal(run.Data.Transitions[1].State, &state); err != nil {
		t.Fatalf("decode setup fixture state: %v", err)
	}
	activeSeatNumber := int(state["active_seat_number"].(float64))
	seatValues := state["seats"].([]any)
	configurationSeats := make([]map[string]any, len(seatValues))
	for index, value := range seatValues {
		seat := value.(map[string]any)
		controller := otherController
		if int(seat["seat_number"].(float64)) == activeSeatNumber {
			controller = activeController
		}
		seat["controller_type"] = controller
		configurationSeats[index] = map[string]any{
			"seat_number":     seat["seat_number"],
			"controller_type": controller,
		}
	}
	state["seats"] = seatValues

	return placementStateFixture{
		State: state,
		GameConfiguration: map[string]any{
			"seed":        "1",
			"ruleset_key": "base",
			"map_key":     "standard",
			"seats":       configurationSeats,
		},
		ActiveSeatNumber:  activeSeatNumber,
		NextEventSequence: 3,
	}
}

func newFinalPlacementStateFixture(t *testing.T) placementStateFixture {
	t.Helper()
	runResponse := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodPost, initialPlacementRunRequestBody(t, 3, "ai"))
	if runResponse.Code != http.StatusOK {
		t.Fatalf("AI setup fixture run status = %d, want %d: %s", runResponse.Code, http.StatusOK, runResponse.Body)
	}
	var run struct {
		Data struct {
			Transitions []struct {
				State  json.RawMessage `json:"state"`
				Events []struct {
					Sequence int `json:"sequence"`
				} `json:"events"`
			} `json:"transitions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(runResponse.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode AI setup fixture run: %v", err)
	}
	if len(run.Data.Transitions) < 4 {
		t.Fatal("AI setup fixture run has too few transitions")
	}
	stateTransition := run.Data.Transitions[len(run.Data.Transitions)-2]
	var state map[string]any
	if err := json.Unmarshal(stateTransition.State, &state); err != nil {
		t.Fatalf("decode final setup state: %v", err)
	}
	activeSeatNumber := int(state["active_seat_number"].(float64))
	seatValues := state["seats"].([]any)
	configurationSeats := make([]map[string]any, len(seatValues))
	for index, value := range seatValues {
		seat := value.(map[string]any)
		controller := "ai"
		if int(seat["seat_number"].(float64)) == activeSeatNumber {
			controller = "human"
		}
		seat["controller_type"] = controller
		configurationSeats[index] = map[string]any{
			"seat_number":     seat["seat_number"],
			"controller_type": controller,
		}
	}
	lastEvent := stateTransition.Events[len(stateTransition.Events)-1].Sequence
	return placementStateFixture{
		State: state,
		GameConfiguration: map[string]any{
			"seed":        "1",
			"ruleset_key": "base",
			"map_key":     "standard",
			"seats":       configurationSeats,
		},
		ActiveSeatNumber:  activeSeatNumber,
		NextEventSequence: lastEvent + 1,
	}
}

func optionsRequestBody(t *testing.T, state map[string]any) string {
	t.Helper()
	return marshalPlacementContractRequest(t, map[string]any{
		"state_schema_version": "state-v2",
		"state":                state,
	})
}

func continuationRequestBody(t *testing.T, fixture placementStateFixture, settlementID, roadID string) string {
	t.Helper()
	return continuationRequestBodyWithConfig(t, fixture, fixture.GameConfiguration, settlementID, roadID)
}

func continuationRequestBodyWithConfig(t *testing.T, fixture placementStateFixture, configuration map[string]any, settlementID, roadID string) string {
	t.Helper()
	return marshalPlacementContractRequest(t, map[string]any{
		"state_schema_version": "state-v2",
		"state":                fixture.State,
		"game_configuration":   configuration,
		"next_event_sequence":  fixture.NextEventSequence,
		"command": map[string]any{
			"command_type":       initialPlacementCommandType,
			"acting_seat_number": fixture.ActiveSeatNumber,
			"payload": map[string]any{
				"settlement_vertex_id": settlementID,
				"road_edge_id":         roadID,
			},
		},
	})
}

func marshalPlacementContractRequest(t *testing.T, request map[string]any) string {
	t.Helper()
	body, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal placement contract request: %v", err)
	}
	return string(body)
}

func sendPlacementRequest(t *testing.T, handler http.Handler, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
