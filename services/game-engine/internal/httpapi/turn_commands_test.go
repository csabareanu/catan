package httpapi_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"catan.local/game-engine/internal/httpapi"
)

const turnCommandPath = "/v1/turns/command"

type turnCommandTestRequest struct {
	StateSchemaVersion string                 `json:"state_schema_version"`
	State              json.RawMessage        `json:"state"`
	NextEventSequence  int                    `json:"next_event_sequence"`
	Command            turnCommandTestCommand `json:"command"`
}

type turnCommandTestCommand struct {
	CommandType      string   `json:"command_type"`
	ActingSeatNumber int      `json:"acting_seat_number"`
	Payload          struct{} `json:"payload"`
}

type turnCommandTestResponse struct {
	Data struct {
		TurnCommandSchemaVersion string                 `json:"turn_command_schema_version"`
		ExecutionSchemaVersion   string                 `json:"execution_schema_version"`
		CommandType              string                 `json:"command_type"`
		ActingSeatNumber         int                    `json:"acting_seat_number"`
		StateSchemaVersion       string                 `json:"state_schema_version"`
		State                    json.RawMessage        `json:"state"`
		Events                   []turnCommandTestEvent `json:"events"`
	} `json:"data"`
}

type turnCommandTestEvent struct {
	Sequence            int             `json:"sequence"`
	EventType           string          `json:"event_type"`
	Payload             json.RawMessage `json:"payload"`
	Visibility          string          `json:"visibility"`
	VisibleToSeatNumber *int            `json:"visible_to_seat_number"`
}

func TestTurnCommandAcceptsVersionedRollAndEndTurnTransitions(t *testing.T) {
	fixture := newTurnCommandSetupFixture(t)
	handler := httpapi.NewHandler()
	startBody := marshalTurnCommandTestRequest(t, "state-v2", fixture.State, fixture.NextEventSequence, "roll_dice.v1", fixture.FirstSeat)
	first := sendTurnCommandRequest(t, handler, http.MethodPost, startBody)
	repeated := sendTurnCommandRequest(t, handler, http.MethodPost, startBody)
	if first.Code != http.StatusOK {
		t.Fatalf("state-v2 roll status = %d, want %d: %s", first.Code, http.StatusOK, first.Body)
	}
	if first.Header().Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", first.Header().Get("Content-Type"))
	}
	if !bytes.Equal(first.Body.Bytes(), repeated.Body.Bytes()) {
		t.Fatalf("identical turn command returned different JSON bodies\nfirst:  %s\nsecond: %s", first.Body, repeated.Body)
	}

	started := decodeTurnCommandTestResponse(t, first)
	if started.Data.TurnCommandSchemaVersion != "1" || started.Data.ExecutionSchemaVersion != "1" || started.Data.StateSchemaVersion != "state-v3" {
		t.Fatalf("transition schema versions = command %q, execution %q, state %q", started.Data.TurnCommandSchemaVersion, started.Data.ExecutionSchemaVersion, started.Data.StateSchemaVersion)
	}
	if started.Data.CommandType != "roll_dice.v1" || started.Data.ActingSeatNumber != fixture.FirstSeat {
		t.Errorf("accepted command = %q by seat %d, want roll_dice.v1 by seat %d", started.Data.CommandType, started.Data.ActingSeatNumber, fixture.FirstSeat)
	}
	var startedState struct {
		Phase            string `json:"phase"`
		SeatOrder        []int  `json:"seat_order"`
		Round            int    `json:"round"`
		TurnNumber       int    `json:"turn_number"`
		ActiveSeatNumber int    `json:"active_seat_number"`
		TurnPhase        string `json:"turn_phase"`
		LastRoll         *struct {
			DieOne int `json:"die_one"`
			DieTwo int `json:"die_two"`
			Total  int `json:"total"`
		} `json:"last_roll"`
		Players []struct {
			Cities []string `json:"cities"`
		} `json:"players"`
	}
	if err := json.Unmarshal(started.Data.State, &startedState); err != nil {
		t.Fatalf("decode state-v3 transition: %v", err)
	}
	if startedState.Phase != "normal_turn" || startedState.Round != 1 || startedState.TurnNumber != 1 || startedState.ActiveSeatNumber != fixture.FirstSeat {
		t.Errorf("started state = phase %q, round %d, turn %d, active seat %d", startedState.Phase, startedState.Round, startedState.TurnNumber, startedState.ActiveSeatNumber)
	}
	if startedState.TurnPhase != "action" || startedState.LastRoll == nil || startedState.LastRoll.Total != 9 {
		t.Errorf("first roll state = phase %q, roll %+v; want action and deterministic total 9 for seed 2", startedState.TurnPhase, startedState.LastRoll)
	}
	for index, player := range startedState.Players {
		if player.Cities == nil {
			t.Errorf("state-v3 player %d cities = nil, want an empty array", index)
		}
	}
	assertTurnCommandEventSequence(t, started.Data.Events, fixture.NextEventSequence)
	if len(started.Data.Events) < 2 || started.Data.Events[0].EventType != "turn_started.v1" || started.Data.Events[1].EventType != "dice_rolled.v1" {
		t.Fatalf("first transition events = %+v, want turn_started.v1 then dice_rolled.v1", started.Data.Events)
	}
	for _, event := range started.Data.Events {
		if event.EventType != "resources_produced.v1" {
			continue
		}
		if event.Visibility != "seat_private" || event.VisibleToSeatNumber == nil {
			t.Errorf("production event visibility = %q to %v, want seat_private with a receiving seat", event.Visibility, event.VisibleToSeatNumber)
		}
	}

	nextEventSequence := fixture.NextEventSequence + len(started.Data.Events)
	endBody := marshalTurnCommandTestRequest(t, "state-v3", started.Data.State, nextEventSequence, "end_turn.v1", fixture.FirstSeat)
	endedResponse := sendTurnCommandRequest(t, handler, http.MethodPost, endBody)
	if endedResponse.Code != http.StatusOK {
		t.Fatalf("state-v3 end-turn status = %d, want %d: %s", endedResponse.Code, http.StatusOK, endedResponse.Body)
	}
	ended := decodeTurnCommandTestResponse(t, endedResponse)
	assertTurnCommandEventSequence(t, ended.Data.Events, nextEventSequence)
	if len(ended.Data.Events) != 2 || ended.Data.Events[0].EventType != "turn_ended.v1" || ended.Data.Events[1].EventType != "turn_started.v1" {
		t.Fatalf("end-turn events = %+v, want turn_ended.v1 then turn_started.v1", ended.Data.Events)
	}
	var endedState struct {
		ActiveSeatNumber int    `json:"active_seat_number"`
		TurnPhase        string `json:"turn_phase"`
		LastRoll         any    `json:"last_roll"`
	}
	if err := json.Unmarshal(ended.Data.State, &endedState); err != nil {
		t.Fatalf("decode ended state: %v", err)
	}
	if ended.Data.StateSchemaVersion != "state-v3" || endedState.ActiveSeatNumber != startedState.SeatOrder[1] || endedState.TurnPhase != "awaiting_roll" || endedState.LastRoll != nil {
		t.Errorf("state after end-turn = schema %q, seat %d, phase %q, last roll %#v", ended.Data.StateSchemaVersion, endedState.ActiveSeatNumber, endedState.TurnPhase, endedState.LastRoll)
	}

	nextEventSequence += len(ended.Data.Events)
	rollBody := marshalTurnCommandTestRequest(t, "state-v3", ended.Data.State, nextEventSequence, "roll_dice.v1", endedState.ActiveSeatNumber)
	rolledResponse := sendTurnCommandRequest(t, handler, http.MethodPost, rollBody)
	if rolledResponse.Code != http.StatusOK {
		t.Fatalf("subsequent state-v3 roll status = %d, want %d: %s", rolledResponse.Code, http.StatusOK, rolledResponse.Body)
	}
	rolled := decodeTurnCommandTestResponse(t, rolledResponse)
	assertTurnCommandEventSequence(t, rolled.Data.Events, nextEventSequence)
	if len(rolled.Data.Events) == 0 || rolled.Data.Events[0].EventType != "dice_rolled.v1" {
		t.Fatalf("subsequent roll events = %+v, want dice_rolled.v1 first", rolled.Data.Events)
	}
}

func TestTurnCommandRejectsMalformedUnsupportedAndIllegalRequests(t *testing.T) {
	fixture := newTurnCommandSetupFixture(t)
	handler := httpapi.NewHandler()

	malformed := sendTurnCommandRequest(t, handler, http.MethodPost, "{")
	assertAPIError(t, malformed, http.StatusBadRequest, "invalid_json")

	unsupported := marshalTurnCommandTestRequest(t, "state-v99", fixture.State, fixture.NextEventSequence, "roll_dice.v1", fixture.FirstSeat)
	assertAPIError(t, sendTurnCommandRequest(t, handler, http.MethodPost, unsupported), http.StatusUnprocessableEntity, "unsupported_state_schema_version")

	wrongSeat := marshalTurnCommandTestRequest(t, "state-v2", fixture.State, fixture.NextEventSequence, "roll_dice.v1", fixture.OtherSeat)
	wrongSeatResponse := sendTurnCommandRequest(t, handler, http.MethodPost, wrongSeat)
	assertAPIError(t, wrongSeatResponse, http.StatusUnprocessableEntity, "wrong_active_seat")

	startedBody := marshalTurnCommandTestRequest(t, "state-v2", fixture.State, fixture.NextEventSequence, "roll_dice.v1", fixture.FirstSeat)
	startedResponse := sendTurnCommandRequest(t, handler, http.MethodPost, startedBody)
	if startedResponse.Code != http.StatusOK {
		t.Fatalf("state-v2 fixture start status = %d, want %d: %s", startedResponse.Code, http.StatusOK, startedResponse.Body)
	}
	started := decodeTurnCommandTestResponse(t, startedResponse)
	wrongPhase := marshalTurnCommandTestRequest(t, "state-v3", started.Data.State, fixture.NextEventSequence+len(started.Data.Events), "roll_dice.v1", fixture.FirstSeat)
	assertAPIError(t, sendTurnCommandRequest(t, handler, http.MethodPost, wrongPhase), http.StatusUnprocessableEntity, "invalid_turn_phase")

	unsupportedCommand := marshalTurnCommandTestRequest(t, "state-v2", fixture.State, fixture.NextEventSequence, "build_road.v1", fixture.FirstSeat)
	assertAPIError(t, sendTurnCommandRequest(t, handler, http.MethodPost, unsupportedCommand), http.StatusUnprocessableEntity, "unsupported_turn_command")

	invalidPayload := strings.Replace(startedBody, `"payload":{}`, `"payload":{"dice":9}`, 1)
	assertAPIError(t, sendTurnCommandRequest(t, handler, http.MethodPost, invalidPayload), http.StatusUnprocessableEntity, "invalid_request")
}

type turnCommandSetupFixture struct {
	State             json.RawMessage
	NextEventSequence int
	FirstSeat         int
	OtherSeat         int
}

func newTurnCommandSetupFixture(t *testing.T) turnCommandSetupFixture {
	t.Helper()
	seats := []initialPlacementRunTestSeat{
		{SeatNumber: 1, ControllerType: "ai"},
		{SeatNumber: 2, ControllerType: "ai"},
		{SeatNumber: 3, ControllerType: "ai"},
	}
	body := marshalInitialPlacementRunRequest(t, initialPlacementRunTestRequest{
		Seed:       "2",
		RulesetKey: "base",
		MapKey:     "standard",
		Seats:      seats,
	})
	runResponse := sendInitialPlacementRunRequest(t, httpapi.NewHandler(), http.MethodPost, body)
	if runResponse.Code != http.StatusOK {
		t.Fatalf("setup fixture run status = %d, want %d: %s", runResponse.Code, http.StatusOK, runResponse.Body)
	}
	var run struct {
		Data struct {
			StopReason  string `json:"stop_reason"`
			Transitions []struct {
				StateSchemaVersion string          `json:"state_schema_version"`
				State              json.RawMessage `json:"state"`
				Events             []struct {
					Sequence int `json:"sequence"`
				} `json:"events"`
			} `json:"transitions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(runResponse.Body.Bytes(), &run); err != nil {
		t.Fatalf("decode setup fixture run: %v", err)
	}
	if run.Data.StopReason != "turn_ready" || len(run.Data.Transitions) == 0 {
		t.Fatalf("setup fixture result = stop reason %q with %d transitions, want turn_ready", run.Data.StopReason, len(run.Data.Transitions))
	}
	transition := run.Data.Transitions[len(run.Data.Transitions)-1]
	if transition.StateSchemaVersion != "state-v2" {
		t.Fatalf("setup fixture state schema = %q, want state-v2", transition.StateSchemaVersion)
	}
	var state struct {
		Phase     string `json:"phase"`
		SeatOrder []int  `json:"seat_order"`
	}
	if err := json.Unmarshal(transition.State, &state); err != nil {
		t.Fatalf("decode turn-ready state: %v", err)
	}
	if state.Phase != "turn_ready" || len(state.SeatOrder) < 2 {
		t.Fatalf("setup fixture phase/order = %q/%v, want turn_ready and multiple seats", state.Phase, state.SeatOrder)
	}
	lastSequence := 0
	for _, item := range run.Data.Transitions {
		for _, event := range item.Events {
			if event.Sequence > lastSequence {
				lastSequence = event.Sequence
			}
		}
	}
	return turnCommandSetupFixture{
		State:             transition.State,
		NextEventSequence: lastSequence + 1,
		FirstSeat:         state.SeatOrder[0],
		OtherSeat:         state.SeatOrder[1],
	}
}

func marshalTurnCommandTestRequest(t *testing.T, schema string, state json.RawMessage, sequence int, commandType string, actingSeat int) string {
	t.Helper()
	request := turnCommandTestRequest{
		StateSchemaVersion: schema,
		State:              state,
		NextEventSequence:  sequence,
		Command: turnCommandTestCommand{
			CommandType:      commandType,
			ActingSeatNumber: actingSeat,
		},
	}
	body, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal turn command request: %v", err)
	}
	return string(body)
}

func sendTurnCommandRequest(t *testing.T, handler http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(method, turnCommandPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func decodeTurnCommandTestResponse(t *testing.T, response *httptest.ResponseRecorder) turnCommandTestResponse {
	t.Helper()
	var decoded turnCommandTestResponse
	if err := json.Unmarshal(response.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("decode turn command response: %v", err)
	}
	return decoded
}

func assertTurnCommandEventSequence(t *testing.T, events []turnCommandTestEvent, firstSequence int) {
	t.Helper()
	if len(events) == 0 {
		t.Fatal("turn command returned no events")
	}
	for index, event := range events {
		if event.Sequence != firstSequence+index {
			t.Errorf("event %d sequence = %d, want %d", index, event.Sequence, firstSequence+index)
		}
	}
}
