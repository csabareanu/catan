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

const generateBoardPath = "/v1/boards/generate"

func TestGenerateBoardReturnsStableVersionedJSON(t *testing.T) {
	handler := httpapi.NewHandler()
	requestBody := `{"seed":"894177203164","ruleset_key":"base","map_key":"standard"}`

	firstResponse := sendRequest(t, handler, http.MethodPost, requestBody)
	secondResponse := sendRequest(t, handler, http.MethodPost, requestBody)

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
			BoardSchemaVersion string `json:"board_schema_version"`
			Seed               string `json:"seed"`
			Ruleset            struct {
				Key     string `json:"key"`
				Version string `json:"version"`
			} `json:"ruleset"`
			Map struct {
				Key         string `json:"key"`
				Version     string `json:"version"`
				Orientation string `json:"orientation"`
			} `json:"map"`
			Hexes    []json.RawMessage `json:"hexes"`
			Vertices []json.RawMessage `json:"vertices"`
			Edges    []json.RawMessage `json:"edges"`
			Ports    []json.RawMessage `json:"ports"`
		} `json:"data"`
	}
	if err := json.Unmarshal(firstResponse.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if response.Data.BoardSchemaVersion != "1" {
		t.Errorf("board_schema_version = %q, want 1", response.Data.BoardSchemaVersion)
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
	if len(response.Data.Hexes) != 19 || len(response.Data.Vertices) != 54 || len(response.Data.Edges) != 72 || len(response.Data.Ports) != 9 {
		t.Errorf("board counts = %d hexes, %d vertices, %d edges, %d ports; want 19, 54, 72, 9", len(response.Data.Hexes), len(response.Data.Vertices), len(response.Data.Edges), len(response.Data.Ports))
	}
}

func TestGenerateBoardRejectsInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name          string
		requestBody   string
		wantErrorCode string
	}{
		{
			name:          "non-canonical seed",
			requestBody:   `{"seed":"0894177203164","ruleset_key":"base","map_key":"standard"}`,
			wantErrorCode: "invalid_seed",
		},
		{
			name:          "unsupported ruleset",
			requestBody:   `{"seed":"894177203164","ruleset_key":"seafarers","map_key":"standard"}`,
			wantErrorCode: "unsupported_ruleset",
		},
		{
			name:          "unsupported map",
			requestBody:   `{"seed":"894177203164","ruleset_key":"base","map_key":"archipelago"}`,
			wantErrorCode: "unsupported_map",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := sendRequest(t, httpapi.NewHandler(), http.MethodPost, test.requestBody)
			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusUnprocessableEntity, response.Body)
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
			if body.Error.Code != test.wantErrorCode {
				t.Errorf("error code = %q, want %q", body.Error.Code, test.wantErrorCode)
			}
			if body.Error.Message == "" {
				t.Error("error message is empty")
			}
		})
	}
}

func TestGenerateBoardRejectsMalformedJSON(t *testing.T) {
	response := sendRequest(t, httpapi.NewHandler(), http.MethodPost, `{"seed":`)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusBadRequest, response.Body)
	}
	if !strings.Contains(response.Body.String(), `"code":"invalid_json"`) {
		t.Errorf("response = %s, want invalid_json error", response.Body)
	}
}

func TestGenerateBoardRequiresPOST(t *testing.T) {
	response := sendRequest(t, httpapi.NewHandler(), http.MethodGet, "")

	if response.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusMethodNotAllowed)
	}
	if allow := response.Header().Get("Allow"); allow != http.MethodPost {
		t.Errorf("Allow = %q, want POST", allow)
	}
}

func sendRequest(t *testing.T, handler http.Handler, method, body string) *httptest.ResponseRecorder {
	t.Helper()

	request := httptest.NewRequest(method, generateBoardPath, strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
