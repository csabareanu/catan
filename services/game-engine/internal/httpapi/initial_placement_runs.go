package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"catan.local/game-engine/internal/board"
	"catan.local/game-engine/internal/execution"
)

type initialPlacementRunRequest struct {
	Seed       string                 `json:"seed"`
	RulesetKey string                 `json:"ruleset_key"`
	MapKey     string                 `json:"map_key"`
	Seats      []bootstrapSeatRequest `json:"seats"`
}

type initialPlacementRunEnvelope struct {
	Data initialPlacementRunResponse `json:"data"`
}

type initialPlacementRunResponse struct {
	SetupRunSchemaVersion string                                  `json:"setup_run_schema_version"`
	Seed                  string                                  `json:"seed"`
	Ruleset               rulesetResponse                         `json:"ruleset"`
	Map                   mapResponse                             `json:"map"`
	StopReason            string                                  `json:"stop_reason"`
	Transitions           []initialPlacementRunTransitionResponse `json:"transitions"`
}

type initialPlacementRunTransitionResponse interface {
	initialPlacementRunTransitionResponse()
}

type bootstrapRunTransitionResponse struct {
	CommandType        string                             `json:"command_type"`
	ActingSeatNumber   *int                               `json:"acting_seat_number"`
	Payload            bootstrapRunCommandPayloadResponse `json:"payload"`
	DecisionMetadata   *placementDecisionResponse         `json:"decision_metadata"`
	StateSchemaVersion string                             `json:"state_schema_version"`
	State              bootstrapStateResponse             `json:"state"`
	Events             []eventResponse                    `json:"events"`
}

func (bootstrapRunTransitionResponse) initialPlacementRunTransitionResponse() {}

type bootstrapRunCommandPayloadResponse struct {
	Seed       string         `json:"seed"`
	RulesetKey string         `json:"ruleset_key"`
	MapKey     string         `json:"map_key"`
	Seats      []seatResponse `json:"seats"`
}

type beginInitialPlacementTransitionResponse struct {
	CommandType        string                     `json:"command_type"`
	ActingSeatNumber   *int                       `json:"acting_seat_number"`
	Payload            emptyRunPayloadResponse    `json:"payload"`
	DecisionMetadata   *placementDecisionResponse `json:"decision_metadata"`
	StateSchemaVersion string                     `json:"state_schema_version"`
	State              placementStateResponse     `json:"state"`
	Events             []placementEventResponse   `json:"events"`
}

func (beginInitialPlacementTransitionResponse) initialPlacementRunTransitionResponse() {}

type aiPlacementTransitionResponse struct {
	CommandType        string                                 `json:"command_type"`
	ActingSeatNumber   *int                                   `json:"acting_seat_number"`
	Payload            initialPlacementCommandPayloadResponse `json:"payload"`
	DecisionMetadata   *placementDecisionResponse             `json:"decision_metadata"`
	StateSchemaVersion string                                 `json:"state_schema_version"`
	State              placementStateResponse                 `json:"state"`
	Events             []placementEventResponse               `json:"events"`
}

func (aiPlacementTransitionResponse) initialPlacementRunTransitionResponse() {}

type emptyRunPayloadResponse struct{}

type initialPlacementCommandPayloadResponse struct {
	SettlementVertexID string `json:"settlement_vertex_id"`
	RoadEdgeID         string `json:"road_edge_id"`
}

type placementDecisionResponse struct {
	PolicyVersion string `json:"policy_version"`
	OptionID      string `json:"option_id"`
}

type placementStateResponse struct {
	Phase            string                    `json:"phase"`
	SeatOrder        []int                     `json:"seat_order"`
	Round            int                       `json:"round"`
	ActiveSeatNumber int                       `json:"active_seat_number"`
	Step             string                    `json:"step"`
	Board            boardResponse             `json:"board"`
	Seats            []seatResponse            `json:"seats"`
	Players          []placementPlayerResponse `json:"players"`
}

type placementPlayerResponse struct {
	SeatNumber  int                    `json:"seat_number"`
	Resources   resourceCountsResponse `json:"resources"`
	Settlements []string               `json:"settlements"`
	Roads       []string               `json:"roads"`
}

type resourceCountsResponse struct {
	Lumber int `json:"lumber"`
	Wool   int `json:"wool"`
	Grain  int `json:"grain"`
	Brick  int `json:"brick"`
	Ore    int `json:"ore"`
}

type placementEventResponse struct {
	Sequence            int    `json:"sequence"`
	EventType           string `json:"event_type"`
	Payload             any    `json:"payload"`
	Visibility          string `json:"visibility"`
	VisibleToSeatNumber *int   `json:"visible_to_seat_number"`
}

type initialPlacementStartedPayloadResponse struct {
	SeatOrder        []int `json:"seat_order"`
	Round            int   `json:"round"`
	ActiveSeatNumber int   `json:"active_seat_number"`
}

type initialSettlementPlacedPayloadResponse struct {
	SeatNumber         int    `json:"seat_number"`
	SettlementVertexID string `json:"settlement_vertex_id"`
}

type initialRoadPlacedPayloadResponse struct {
	SeatNumber         int    `json:"seat_number"`
	SettlementVertexID string `json:"settlement_vertex_id"`
	RoadEdgeID         string `json:"road_edge_id"`
}

type initialResourcesGrantedPayloadResponse struct {
	SeatNumber int                    `json:"seat_number"`
	Resources  resourceCountsResponse `json:"resources"`
}

type initialPlacementCompletedPayloadResponse struct {
	SeatOrder []int  `json:"seat_order"`
	NextPhase string `json:"next_phase"`
}

func initialPlacementRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	var request initialPlacementRunRequest
	if err := decoder.Decode(&request); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request body is too large.")
			return
		}

		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Initial placement run fields must use their documented JSON types.")
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

	bootstrapRequest := bootstrapRunRequest{
		Seed:       request.Seed,
		RulesetKey: request.RulesetKey,
		MapKey:     request.MapKey,
		Seats:      request.Seats,
	}
	result, err := execution.RunInitialPlacement(toBootstrapConfig(bootstrapRequest))
	if err != nil {
		writeInitialPlacementRunError(w, err)
		return
	}

	response, err := toInitialPlacementRunResponse(result)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "initial_placement_run_failed", "The initial placement run could not be serialized.")
		return
	}

	writeJSON(w, http.StatusOK, initialPlacementRunEnvelope{Data: response})
}

func writeInitialPlacementRunError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, execution.ErrInvalidSeats):
		writeError(w, http.StatusUnprocessableEntity, "invalid_seats", "The run must contain three or four unique seats.")
	case errors.Is(err, board.ErrInvalidSeed):
		writeError(w, http.StatusUnprocessableEntity, "invalid_seed", "Seed must be a canonical non-negative signed 64-bit integer.")
	case errors.Is(err, board.ErrUnsupportedRuleset):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_ruleset", "The requested ruleset is not supported.")
	case errors.Is(err, board.ErrUnsupportedMap):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_map", "The requested map is not supported.")
	default:
		writeError(w, http.StatusInternalServerError, "initial_placement_run_failed", "The initial placement run could not be completed.")
	}
}

func toInitialPlacementRunResponse(result execution.InitialPlacementRunResult) (initialPlacementRunResponse, error) {
	transitions := make([]initialPlacementRunTransitionResponse, 0, len(result.Transitions))
	for index, transition := range result.Transitions {
		response, err := toInitialPlacementRunTransitionResponse(transition)
		if err != nil {
			return initialPlacementRunResponse{}, fmt.Errorf("serialize transition %d: %w", index, err)
		}
		transitions = append(transitions, response)
	}

	return initialPlacementRunResponse{
		SetupRunSchemaVersion: result.SetupRunSchemaVersion,
		Seed:                  result.Seed,
		Ruleset: rulesetResponse{
			Key:     result.RulesetKey,
			Version: rulesetVersion,
		},
		Map: mapResponse{
			Key:         result.MapKey,
			Version:     mapVersion,
			Orientation: mapOrientation,
		},
		StopReason:  string(result.StopReason),
		Transitions: transitions,
	}, nil
}

func toInitialPlacementRunTransitionResponse(transition execution.InitialPlacementRunTransition) (initialPlacementRunTransitionResponse, error) {
	switch transition := transition.(type) {
	case execution.BootstrapRunTransition:
		return bootstrapRunTransitionResponse{
			CommandType:      transition.CommandType,
			ActingSeatNumber: nil,
			Payload: bootstrapRunCommandPayloadResponse{
				Seed:       transition.Payload.Seed,
				RulesetKey: transition.Payload.RulesetKey,
				MapKey:     transition.Payload.MapKey,
				Seats:      toSeatResponses(transition.Payload.Seats),
			},
			DecisionMetadata:   nil,
			StateSchemaVersion: transition.StateSchemaVersion,
			State:              toBootstrapStateResponse(transition.State),
			Events:             toInitializationEventResponses(transition.Events),
		}, nil
	case execution.BeginInitialPlacementRunTransition:
		events, err := toPlacementEventResponses(transition.Events)
		if err != nil {
			return nil, err
		}
		return beginInitialPlacementTransitionResponse{
			CommandType:        transition.CommandType,
			ActingSeatNumber:   nil,
			Payload:            emptyRunPayloadResponse{},
			DecisionMetadata:   nil,
			StateSchemaVersion: transition.StateSchemaVersion,
			State:              toPlacementStateResponse(transition.State),
			Events:             events,
		}, nil
	case execution.AIPlacementRunTransition:
		events, err := toPlacementEventResponses(transition.Events)
		if err != nil {
			return nil, err
		}
		return aiPlacementTransitionResponse{
			CommandType:      transition.CommandType,
			ActingSeatNumber: intPointer(transition.ActingSeatNumber),
			Payload: initialPlacementCommandPayloadResponse{
				SettlementVertexID: transition.Payload.SettlementVertexID,
				RoadEdgeID:         transition.Payload.RoadEdgeID,
			},
			DecisionMetadata: &placementDecisionResponse{
				PolicyVersion: transition.Decision.PolicyVersion,
				OptionID:      transition.Decision.OptionID,
			},
			StateSchemaVersion: transition.StateSchemaVersion,
			State:              toPlacementStateResponse(transition.State),
			Events:             events,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported transition type %T", transition)
	}
}

func toBootstrapStateResponse(state execution.BootstrapState) bootstrapStateResponse {
	return bootstrapStateResponse{
		Phase: state.Phase,
		Board: toBoardResponse(state.Board),
		Seats: toSeatResponses(state.Seats),
	}
}

func toSeatResponses(seats []execution.Seat) []seatResponse {
	responses := make([]seatResponse, len(seats))
	for index, seat := range seats {
		responses[index] = seatResponse{
			SeatNumber:     seat.SeatNumber,
			ControllerType: string(seat.ControllerType),
		}
	}
	return responses
}

func toInitializationEventResponses(events []execution.Event) []eventResponse {
	responses := make([]eventResponse, len(events))
	for index, event := range events {
		responses[index] = eventResponse{
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
	return responses
}

func toPlacementStateResponse(state execution.PlacementState) placementStateResponse {
	seats := toSeatResponses(state.Seats)
	players := make([]placementPlayerResponse, len(state.Players))
	for index, player := range state.Players {
		players[index] = placementPlayerResponse{
			SeatNumber: player.SeatNumber,
			Resources: resourceCountsResponse{
				Lumber: player.Resources.Lumber,
				Wool:   player.Resources.Wool,
				Grain:  player.Resources.Grain,
				Brick:  player.Resources.Brick,
				Ore:    player.Resources.Ore,
			},
			Settlements: append([]string{}, player.Settlements...),
			Roads:       append([]string{}, player.Roads...),
		}
	}

	return placementStateResponse{
		Phase:            state.Phase,
		SeatOrder:        append([]int{}, state.SeatOrder...),
		Round:            state.Round,
		ActiveSeatNumber: state.ActiveSeatNumber,
		Step:             state.Step,
		Board:            toBoardResponse(state.Board),
		Seats:            seats,
		Players:          players,
	}
}

func toPlacementEventResponses(events []execution.PlacementEvent) ([]placementEventResponse, error) {
	responses := make([]placementEventResponse, len(events))
	for index, event := range events {
		payload, err := toPlacementEventPayloadResponse(event.Payload)
		if err != nil {
			return nil, fmt.Errorf("serialize event %q: %w", event.EventType, err)
		}
		responses[index] = placementEventResponse{
			Sequence:            event.Sequence,
			EventType:           event.EventType,
			Payload:             payload,
			Visibility:          string(event.Visibility),
			VisibleToSeatNumber: event.VisibleToSeatNumber,
		}
	}
	return responses, nil
}

func toPlacementEventPayloadResponse(payload execution.PlacementEventPayload) (any, error) {
	switch payload := payload.(type) {
	case execution.InitialPlacementStartedPayload:
		return initialPlacementStartedPayloadResponse{
			SeatOrder:        append([]int{}, payload.SeatOrder...),
			Round:            payload.Round,
			ActiveSeatNumber: payload.ActiveSeatNumber,
		}, nil
	case execution.InitialSettlementPlacedPayload:
		return initialSettlementPlacedPayloadResponse{
			SeatNumber:         payload.SeatNumber,
			SettlementVertexID: payload.SettlementVertexID,
		}, nil
	case execution.InitialRoadPlacedPayload:
		return initialRoadPlacedPayloadResponse{
			SeatNumber:         payload.SeatNumber,
			SettlementVertexID: payload.SettlementVertexID,
			RoadEdgeID:         payload.RoadEdgeID,
		}, nil
	case execution.InitialResourcesGrantedPayload:
		return initialResourcesGrantedPayloadResponse{
			SeatNumber: payload.SeatNumber,
			Resources: resourceCountsResponse{
				Lumber: payload.Resources.Lumber,
				Wool:   payload.Resources.Wool,
				Grain:  payload.Resources.Grain,
				Brick:  payload.Resources.Brick,
				Ore:    payload.Resources.Ore,
			},
		}, nil
	case execution.InitialPlacementCompletedPayload:
		return initialPlacementCompletedPayloadResponse{
			SeatOrder: append([]int{}, payload.SeatOrder...),
			NextPhase: payload.NextPhase,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported placement event payload type %T", payload)
	}
}

func intPointer(value int) *int {
	return &value
}
