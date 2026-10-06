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

const bootstrapRunPath = "/v1/runs/bootstrap"

func TestBootstrapRunReturnsStableVersionedJSON(t *testing.T) {
	handler := httpapi.NewHandler()
	requestBody := `{
		"seed":"894177203164",
		"ruleset_key":"base",
		"map_key":"standard",
		"seats":[
			{"seat_number":3,"controller_type":"ai"},
			{"seat_number":1,"controller_type":"human"},
			{"seat_number":2,"controller_type":"ai"}
		]
	}`

	firstResponse := sendBootstrapRequest(t, handler, http.MethodPost, requestBody)
	secondResponse := sendBootstrapRequest(t, handler, http.MethodPost, requestBody)

	if firstResponse.Code != http.StatusOK {
		t.Fatalf("first response status = %d, want %d: %s", firstResponse.Code, http.StatusOK, firstResponse.Body)
	}
	if contentType := firstResponse.Header().Get("Content-Type"); contentType != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", contentType)
	}
	if !bytes.Equal(firstResponse.Body.Bytes(), secondResponse.Body.Bytes()) {
		t.Errorf("same request returned different JSON bodies\nfirst:  %s\nsecond: %s", firstResponse.Body, secondResponse.Body)
	}

	var response struct {
		Data struct {
			ExecutionSchemaVersion string `json:"execution_schema_version"`
			StateSchemaVersion     string `json:"state_schema_version"`
			Seed                   string `json:"seed"`
			Ruleset                struct {
				Key     string `json:"key"`
				Version string `json:"version"`
			} `json:"ruleset"`
			Map struct {
				Key         string `json:"key"`
				Version     string `json:"version"`
				Orientation string `json:"orientation"`
			} `json:"map"`
			State struct {
				Phase string `json:"phase"`
				Board struct {
					BoardSchemaVersion string            `json:"board_schema_version"`
					Hexes              []json.RawMessage `json:"hexes"`
					Vertices           []json.RawMessage `json:"vertices"`
					Edges              []json.RawMessage `json:"edges"`
					Ports              []json.RawMessage `json:"ports"`
				} `json:"board"`
				Seats []struct {
					SeatNumber     int    `json:"seat_number"`
					ControllerType string `json:"controller_type"`
				} `json:"seats"`
			} `json:"state"`
			Events []struct {
				Sequence  int    `json:"sequence"`
				EventType string `json:"event_type"`
				Payload   struct {
					Seed      string `json:"seed"`
					SeatCount int    `json:"seat_count"`
				} `json:"payload"`
				Visibility          string `json:"visibility"`
				VisibleToSeatNumber *int   `json:"visible_to_seat_number"`
			} `json:"events"`
		} `json:"data"`
	}
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Data.ExecutionSchemaVersion != "1" || response.Data.StateSchemaVersion != "state-v1" {
		t.Errorf("schema versions = %q and %q, want 1 and state-v1", response.Data.ExecutionSchemaVersion, response.Data.StateSchemaVersion)
	}
	if response.Data.Seed != "894177203164" {
		t.Errorf("seed = %q, want 894177203164", response.Data.Seed)
	}
	if response.Data.Ruleset.Key != "base" || response.Data.Ruleset.Version != "1.0.0" {
		t.Errorf("ruleset = %+v, want base version 1.0.0", response.Data.Ruleset)
	}
	if response.Data.Map.Key != "standard" || response.Data.Map.Version != "1.0.0" || response.Data.Map.Orientation != "pointy" {
		t.Errorf("map = %+v, want standard version 1.0.0 with pointy orientation", response.Data.Map)
	}
	if response.Data.State.Phase != "initialized" {
		t.Errorf("state phase = %q, want initialized", response.Data.State.Phase)
	}
	if response.Data.State.Board.BoardSchemaVersion != "1" {
		t.Errorf("board schema version = %q, want 1", response.Data.State.Board.BoardSchemaVersion)
	}
	if len(response.Data.State.Board.Hexes) != 19 || len(response.Data.State.Board.Vertices) != 54 || len(response.Data.State.Board.Edges) != 72 || len(response.Data.State.Board.Ports) != 9 {
		t.Errorf("board counts = %d hexes, %d vertices, %d edges, %d ports; want 19, 54, 72, 9", len(response.Data.State.Board.Hexes), len(response.Data.State.Board.Vertices), len(response.Data.State.Board.Edges), len(response.Data.State.Board.Ports))
	}
	if len(response.Data.State.Seats) != 3 {
		t.Fatalf("seat count = %d, want 3", len(response.Data.State.Seats))
	}
	for index, seat := range response.Data.State.Seats {
		if seat.SeatNumber != index+1 {
			t.Errorf("seat at index %d has number %d, want %d", index, seat.SeatNumber, index+1)
		}
	}
	if response.Data.State.Seats[0].ControllerType != "human" || response.Data.State.Seats[1].ControllerType != "ai" || response.Data.State.Seats[2].ControllerType != "ai" {
		t.Errorf("controllers = %+v, want human, ai, ai", response.Data.State.Seats)
	}
	if len(response.Data.Events) != 1 {
		t.Fatalf("event count = %d, want 1", len(response.Data.Events))
	}
	event := response.Data.Events[0]
	if event.Sequence != 1 || event.EventType != "game_initialized.v1" || event.Visibility != "public" || event.VisibleToSeatNumber != nil {
		t.Errorf("event = %+v, want sequence 1 public game_initialized event", event)
	}
	if event.Payload.Seed != "894177203164" || event.Payload.SeatCount != 3 {
		t.Errorf("event payload = %+v, want seed 894177203164 and seat count 3", event.Payload)
	}
	if !bytes.Contains(firstResponse.Body.Bytes(), []byte(`"visible_to_seat_number":null`)) {
		t.Errorf("response = %s, want explicit null visible_to_seat_number", firstResponse.Body)
	}
}

func TestBootstrapRunRejectsMalformedJSON(t *testing.T) {
	tests := []struct {
		name        string
		requestBody string
	}{
		{name: "malformed JSON", requestBody: `{"seed":`},
		{name: "trailing JSON", requestBody: `{"seed":"894177203164","ruleset_key":"base","map_key":"standard","seats":[]} {}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendBootstrapRequest(t, httpapi.NewHandler(), http.MethodPost, test.requestBody)

			assertAPIError(t, response, http.StatusBadRequest, "invalid_json")
		})
	}
}

func TestBootstrapRunRejectsWrongFieldTypes(t *testing.T) {
	tests := []struct {
		name        string
		requestBody string
	}{
		{
			name:        "numeric seed",
			requestBody: `{"seed":894177203164,"ruleset_key":"base","map_key":"standard","seats":[]}`,
		},
		{
			name:        "string seat number",
			requestBody: `{"seed":"894177203164","ruleset_key":"base","map_key":"standard","seats":[{"seat_number":"1","controller_type":"human"}]}`,
		},
		{
			name:        "boolean controller type",
			requestBody: `{"seed":"894177203164","ruleset_key":"base","map_key":"standard","seats":[{"seat_number":1,"controller_type":true}]}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendBootstrapRequest(t, httpapi.NewHandler(), http.MethodPost, test.requestBody)

			assertAPIError(t, response, http.StatusUnprocessableEntity, "invalid_request")
		})
	}
}

func TestBootstrapRunRejectsUnsupportedConfiguration(t *testing.T) {
	tests := []struct {
		name          string
		requestBody   string
		wantErrorCode string
	}{
		{
			name:          "non-canonical seed",
			requestBody:   validBootstrapRequestWith(`"seed":"0894177203164"`),
			wantErrorCode: "invalid_seed",
		},
		{
			name:          "unsupported ruleset",
			requestBody:   validBootstrapRequestWith(`"ruleset_key":"seafarers"`),
			wantErrorCode: "unsupported_ruleset",
		},
		{
			name:          "unsupported map",
			requestBody:   validBootstrapRequestWith(`"map_key":"archipelago"`),
			wantErrorCode: "unsupported_map",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendBootstrapRequest(t, httpapi.NewHandler(), http.MethodPost, test.requestBody)

			assertAPIError(t, response, http.StatusUnprocessableEntity, test.wantErrorCode)
		})
	}
}

func TestBootstrapRunRejectsInvalidSeats(t *testing.T) {
	tests := []struct {
		name  string
		seats string
	}{
		{
			name:  "too few seats",
			seats: `[{"seat_number":1,"controller_type":"human"},{"seat_number":2,"controller_type":"ai"}]`,
		},
		{
			name:  "duplicate seat number",
			seats: `[{"seat_number":1,"controller_type":"human"},{"seat_number":1,"controller_type":"ai"},{"seat_number":3,"controller_type":"ai"}]`,
		},
		{
			name:  "out of range seat number",
			seats: `[{"seat_number":1,"controller_type":"human"},{"seat_number":2,"controller_type":"ai"},{"seat_number":4,"controller_type":"ai"}]`,
		},
		{
			name:  "unsupported controller",
			seats: `[{"seat_number":1,"controller_type":"human"},{"seat_number":2,"controller_type":"bot"},{"seat_number":3,"controller_type":"ai"}]`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendBootstrapRequest(t, httpapi.NewHandler(), http.MethodPost, validBootstrapRequestWith(`"seats":`+test.seats))

			assertAPIError(t, response, http.StatusUnprocessableEntity, "invalid_seats")
		})
	}
}

func TestBootstrapRunRequiresPOST(t *testing.T) {
	response := sendBootstrapRequest(t, httpapi.NewHandler(), http.MethodGet, "")

	assertAPIError(t, response, http.StatusMethodNotAllowed, "method_not_allowed")
	if allow := response.Header().Get("Allow"); allow != http.MethodPost {
		t.Errorf("Allow = %q, want POST", allow)
	}
}

func validBootstrapRequestWith(replacement string) string {
	fields := []string{
		`"seed":"894177203164"`,
		`"ruleset_key":"base"`,
		`"map_key":"standard"`,
		`"seats":[{"seat_number":1,"controller_type":"human"},{"seat_number":2,"controller_type":"ai"},{"seat_number":3,"controller_type":"ai"}]`,
	}

	key := strings.SplitN(replacement, ":", 2)[0]
	for index, field := range fields {
		if strings.HasPrefix(field, key+":") {
			fields[index] = replacement
			break
		}
	}

	return "{" + strings.Join(fields, ",") + "}"
}

func sendBootstrapRequest(t *testing.T, handler http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(method, bootstrapRunPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertAPIError(t *testing.T, response *httptest.ResponseRecorder, wantStatus int, wantCode string) {
	t.Helper()

	if response.Code != wantStatus {
		t.Fatalf("status = %d, want %d: %s", response.Code, wantStatus, response.Body)
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if body.Error.Code != wantCode {
		t.Errorf("error code = %q, want %q", body.Error.Code, wantCode)
	}
	if body.Error.Message == "" {
		t.Error("error message is empty")
	}
}
