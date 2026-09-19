package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"catan.local/game-engine/internal/board"
)

const (
	boardSchemaVersion = "1"
	rulesetVersion     = "1.0.0"
	mapVersion         = "1.0.0"
	mapOrientation     = "pointy"
	maxRequestBodySize = 1 << 20
)

type generateBoardRequest struct {
	Seed       string `json:"seed"`
	RulesetKey string `json:"ruleset_key"`
	MapKey     string `json:"map_key"`
}

type boardEnvelope struct {
	Data boardResponse `json:"data"`
}

type boardResponse struct {
	BoardSchemaVersion string           `json:"board_schema_version"`
	Seed               string           `json:"seed"`
	Ruleset            rulesetResponse  `json:"ruleset"`
	Map                mapResponse      `json:"map"`
	Hexes              []hexResponse    `json:"hexes"`
	Vertices           []vertexResponse `json:"vertices"`
	Edges              []edgeResponse   `json:"edges"`
	Ports              []portResponse   `json:"ports"`
}

type rulesetResponse struct {
	Key     string `json:"key"`
	Version string `json:"version"`
}

type mapResponse struct {
	Key         string `json:"key"`
	Version     string `json:"version"`
	Orientation string `json:"orientation"`
}

type hexResponse struct {
	ID          string        `json:"id"`
	Q           int           `json:"q"`
	R           int           `json:"r"`
	Terrain     board.Terrain `json:"terrain"`
	NumberToken *int          `json:"number_token"`
	VertexIDs   []string      `json:"vertex_ids"`
}

type vertexResponse struct {
	ID string `json:"id"`
	X  int    `json:"x"`
	Y  int    `json:"y"`
}

type edgeResponse struct {
	ID        string    `json:"id"`
	VertexIDs [2]string `json:"vertex_ids"`
}

type portResponse struct {
	ID           string          `json:"id"`
	EdgeID       string          `json:"edge_id"`
	ResourceType *board.Resource `json:"resource_type"`
	TradeRatio   int             `json:"trade_ratio"`
}

type apiErrorEnvelope struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NewHandler returns the stateless, versioned board-generation HTTP API.
func NewHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/boards/generate", generateBoard)
	return mux
}

func generateBoard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	var request generateBoardRequest
	if err := decoder.Decode(&request); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request body is too large.")
			return
		}

		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Seed, ruleset_key, and map_key must be strings.")
			return
		}

		writeError(w, http.StatusBadRequest, "invalid_json", "The request body must contain valid JSON.")
		return
	}

	var trailingValue json.RawMessage
	if err := decoder.Decode(&trailingValue); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_json", "The request body must contain a single JSON value.")
		return
	}

	generatedBoard, err := board.Generate(board.Config{
		Seed:       request.Seed,
		RulesetKey: request.RulesetKey,
		MapKey:     request.MapKey,
	})
	if err != nil {
		switch {
		case errors.Is(err, board.ErrInvalidSeed):
			writeError(w, http.StatusUnprocessableEntity, "invalid_seed", "Seed must be a canonical non-negative signed 64-bit integer.")
		case errors.Is(err, board.ErrUnsupportedRuleset):
			writeError(w, http.StatusUnprocessableEntity, "unsupported_ruleset", "The requested ruleset is not supported.")
		case errors.Is(err, board.ErrUnsupportedMap):
			writeError(w, http.StatusUnprocessableEntity, "unsupported_map", "The requested map is not supported.")
		default:
			writeError(w, http.StatusInternalServerError, "generation_failed", "The board could not be generated.")
		}
		return
	}

	writeJSON(w, http.StatusOK, boardEnvelope{Data: toBoardResponse(generatedBoard)})
}

func toBoardResponse(generatedBoard board.Board) boardResponse {
	response := boardResponse{
		BoardSchemaVersion: boardSchemaVersion,
		Seed:               generatedBoard.Seed,
		Ruleset: rulesetResponse{
			Key:     generatedBoard.RulesetKey,
			Version: rulesetVersion,
		},
		Map: mapResponse{
			Key:         generatedBoard.MapKey,
			Version:     mapVersion,
			Orientation: mapOrientation,
		},
		Hexes:    make([]hexResponse, len(generatedBoard.Hexes)),
		Vertices: make([]vertexResponse, len(generatedBoard.Vertices)),
		Edges:    make([]edgeResponse, len(generatedBoard.Edges)),
		Ports:    make([]portResponse, len(generatedBoard.Ports)),
	}

	for index, hex := range generatedBoard.Hexes {
		response.Hexes[index] = hexResponse{
			ID:          hex.ID,
			Q:           hex.Q,
			R:           hex.R,
			Terrain:     hex.Terrain,
			NumberToken: hex.NumberToken,
			VertexIDs:   hex.VertexIDs,
		}
	}
	for index, vertex := range generatedBoard.Vertices {
		response.Vertices[index] = vertexResponse{ID: vertex.ID, X: vertex.X, Y: vertex.Y}
	}
	for index, edge := range generatedBoard.Edges {
		response.Edges[index] = edgeResponse{ID: edge.ID, VertexIDs: edge.VertexIDs}
	}
	for index, port := range generatedBoard.Ports {
		response.Ports[index] = portResponse{
			ID:           port.ID,
			EdgeID:       port.EdgeID,
			ResourceType: port.ResourceType,
			TradeRatio:   port.TradeRatio,
		}
	}

	return response
}

func writeError(w http.ResponseWriter, statusCode int, code, message string) {
	writeJSON(w, statusCode, apiErrorEnvelope{
		Error: apiError{Code: code, Message: message},
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, response any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	_ = json.NewEncoder(w).Encode(response)
}
