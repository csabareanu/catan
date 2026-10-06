package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"catan.local/game-engine/internal/board"
	"catan.local/game-engine/internal/execution"
)

type bootstrapRunRequest struct {
	Seed       string                 `json:"seed"`
	RulesetKey string                 `json:"ruleset_key"`
	MapKey     string                 `json:"map_key"`
	Seats      []bootstrapSeatRequest `json:"seats"`
}

type bootstrapSeatRequest struct {
	SeatNumber     int    `json:"seat_number"`
	ControllerType string `json:"controller_type"`
}

type bootstrapRunEnvelope struct {
	Data bootstrapRunResponse `json:"data"`
}

type bootstrapRunResponse struct {
	ExecutionSchemaVersion string                 `json:"execution_schema_version"`
	StateSchemaVersion     string                 `json:"state_schema_version"`
	Seed                   string                 `json:"seed"`
	Ruleset                rulesetResponse        `json:"ruleset"`
	Map                    mapResponse            `json:"map"`
	State                  bootstrapStateResponse `json:"state"`
	Events                 []eventResponse        `json:"events"`
}

type bootstrapStateResponse struct {
	Phase string         `json:"phase"`
	Board boardResponse  `json:"board"`
	Seats []seatResponse `json:"seats"`
}

type seatResponse struct {
	SeatNumber     int    `json:"seat_number"`
	ControllerType string `json:"controller_type"`
}

type eventResponse struct {
	Sequence            int                           `json:"sequence"`
	EventType           string                        `json:"event_type"`
	Payload             initializationPayloadResponse `json:"payload"`
	Visibility          string                        `json:"visibility"`
	VisibleToSeatNumber *int                          `json:"visible_to_seat_number"`
}

type initializationPayloadResponse struct {
	Seed      string `json:"seed"`
	SeatCount int    `json:"seat_count"`
}

func bootstrapRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	var request bootstrapRunRequest
	if err := decoder.Decode(&request); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request body is too large.")
			return
		}

		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Bootstrap request fields must use their documented JSON types.")
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

	result, err := execution.Bootstrap(toBootstrapConfig(request))
	if err != nil {
		writeBootstrapError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, bootstrapRunEnvelope{Data: toBootstrapRunResponse(result)})
}

func toBootstrapConfig(request bootstrapRunRequest) execution.BootstrapConfig {
	seats := make([]execution.Seat, len(request.Seats))
	for index, seat := range request.Seats {
		seats[index] = execution.Seat{
			SeatNumber:     seat.SeatNumber,
			ControllerType: execution.ControllerType(seat.ControllerType),
		}
	}

	return execution.BootstrapConfig{
		Seed:       request.Seed,
		RulesetKey: request.RulesetKey,
		MapKey:     request.MapKey,
		Seats:      seats,
	}
}

func writeBootstrapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, execution.ErrInvalidSeats):
		writeError(w, http.StatusUnprocessableEntity, "invalid_seats", "The bootstrap run must contain three or four unique seats.")
	case errors.Is(err, board.ErrInvalidSeed):
		writeError(w, http.StatusUnprocessableEntity, "invalid_seed", "Seed must be a canonical non-negative signed 64-bit integer.")
	case errors.Is(err, board.ErrUnsupportedRuleset):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_ruleset", "The requested ruleset is not supported.")
	case errors.Is(err, board.ErrUnsupportedMap):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_map", "The requested map is not supported.")
	default:
		writeError(w, http.StatusInternalServerError, "bootstrap_failed", "The game run could not be initialized.")
	}
}

func toBootstrapRunResponse(result execution.BootstrapResult) bootstrapRunResponse {
	seats := make([]seatResponse, len(result.State.Seats))
	for index, seat := range result.State.Seats {
		seats[index] = seatResponse{
			SeatNumber:     seat.SeatNumber,
			ControllerType: string(seat.ControllerType),
		}
	}

	events := make([]eventResponse, len(result.Events))
	for index, event := range result.Events {
		events[index] = eventResponse{
			Sequence:  event.Sequence,
			EventType: event.EventType,
			Payload: initializationPayloadResponse{
				Seed:      event.Payload.Seed,
				SeatCount: event.Payload.SeatCount,
			},
			Visibility:          string(event.Visibility),
			VisibleToSeatNumber: event.VisibleToSeatNumber,
		}
	}

	return bootstrapRunResponse{
		ExecutionSchemaVersion: result.ExecutionSchemaVersion,
		StateSchemaVersion:     result.StateSchemaVersion,
		Seed:                   result.Seed,
		Ruleset: rulesetResponse{
			Key:     result.RulesetKey,
			Version: rulesetVersion,
		},
		Map: mapResponse{
			Key:         result.MapKey,
			Version:     mapVersion,
			Orientation: mapOrientation,
		},
		State: bootstrapStateResponse{
			Phase: result.State.Phase,
			Board: toBoardResponse(result.State.Board),
			Seats: seats,
		},
		Events: events,
	}
}
