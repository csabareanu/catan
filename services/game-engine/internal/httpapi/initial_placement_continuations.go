package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"reflect"

	"catan.local/game-engine/internal/board"
	"catan.local/game-engine/internal/execution"
)

const initialPlacementOptionsSchemaVersion = "1"

// initialPlacementStateRequest consumes the same state-v2 contract emitted by
// the placement-run endpoints.
type initialPlacementStateRequest struct {
	StateSchemaVersion string                `json:"state_schema_version"`
	State              placementStateRequest `json:"state"`
}

type placementStateRequest struct {
	Phase            string                   `json:"phase"`
	SeatOrder        []int                    `json:"seat_order"`
	Round            int                      `json:"round"`
	ActiveSeatNumber int                      `json:"active_seat_number"`
	Step             string                   `json:"step"`
	Board            boardResponse            `json:"board"`
	Seats            []placementSeatRequest   `json:"seats"`
	Players          []placementPlayerRequest `json:"players"`
}

type placementSeatRequest struct {
	SeatNumber     int    `json:"seat_number"`
	ControllerType string `json:"controller_type"`
}

type placementPlayerRequest struct {
	SeatNumber  int                       `json:"seat_number"`
	Resources   placementResourcesRequest `json:"resources"`
	Settlements []string                  `json:"settlements"`
	Roads       []string                  `json:"roads"`
}

type placementResourcesRequest struct {
	Lumber int `json:"lumber"`
	Wool   int `json:"wool"`
	Grain  int `json:"grain"`
	Brick  int `json:"brick"`
	Ore    int `json:"ore"`
}

type initialPlacementOptionsEnvelope struct {
	Data initialPlacementOptionsResponse `json:"data"`
}

type initialPlacementOptionsResponse struct {
	SchemaVersion    string                           `json:"initial_placement_options_schema_version"`
	ActiveSeatNumber int                              `json:"active_seat_number"`
	Round            int                              `json:"round"`
	Options          []initialPlacementOptionResponse `json:"options"`
}

type initialPlacementOptionResponse struct {
	SettlementVertexID string `json:"settlement_vertex_id"`
	RoadEdgeID         string `json:"road_edge_id"`
}

type initialPlacementContinuationRequest struct {
	StateSchemaVersion string                         `json:"state_schema_version"`
	State              placementStateRequest          `json:"state"`
	GameConfiguration  initialPlacementGameConfig     `json:"game_configuration"`
	NextEventSequence  int                            `json:"next_event_sequence"`
	Command            initialPlacementCommandRequest `json:"command"`
}

type initialPlacementGameConfig struct {
	Seed       string                 `json:"seed"`
	RulesetKey string                 `json:"ruleset_key"`
	MapKey     string                 `json:"map_key"`
	Seats      []placementSeatRequest `json:"seats"`
}

type initialPlacementCommandRequest struct {
	CommandType      string                                   `json:"command_type"`
	ActingSeatNumber int                                      `json:"acting_seat_number"`
	Payload          execution.InitialPlacementCommandPayload `json:"payload"`
}

type initialPlacementContinuationEnvelope struct {
	Data initialPlacementContinuationResponse `json:"data"`
}

type initialPlacementContinuationResponse struct {
	SchemaVersion string                                   `json:"setup_continuation_schema_version"`
	StopReason    string                                   `json:"stop_reason"`
	Transitions   []initialPlacementContinuationTransition `json:"transitions"`
}

type initialPlacementContinuationTransition struct {
	CommandType        string                                 `json:"command_type"`
	ActingSeatNumber   *int                                   `json:"acting_seat_number"`
	Payload            initialPlacementCommandPayloadResponse `json:"payload"`
	DecisionMetadata   *placementDecisionResponse             `json:"decision_metadata"`
	StateSchemaVersion string                                 `json:"state_schema_version"`
	State              placementStateResponse                 `json:"state"`
	Events             []placementEventResponse               `json:"events"`
}

func initialPlacementOptions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	var request initialPlacementStateRequest
	if !decodeInitialPlacementRequest(w, r, &request) {
		return
	}
	if request.StateSchemaVersion != execution.PlacementStateSchemaVersion {
		writeError(w, http.StatusUnprocessableEntity, "unsupported_state_schema_version", "The state_schema_version must be state-v2.")
		return
	}

	state, err := toExecutionPlacementState(request.State)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v2 setup state.")
		return
	}
	options, err := execution.LegalInitialPlacementOptions(state)
	if err != nil {
		writeInitialPlacementContractError(w, err)
		return
	}
	if !activePlacementSeatIsHuman(state) {
		writeError(w, http.StatusUnprocessableEntity, "active_seat_not_human", "Legal human placement options are available only when a human-controlled seat is active.")
		return
	}

	responseOptions := make([]initialPlacementOptionResponse, len(options))
	for index, option := range options {
		responseOptions[index] = initialPlacementOptionResponse{
			SettlementVertexID: option.SettlementVertexID,
			RoadEdgeID:         option.RoadEdgeID,
		}
	}
	writeJSON(w, http.StatusOK, initialPlacementOptionsEnvelope{Data: initialPlacementOptionsResponse{
		SchemaVersion:    initialPlacementOptionsSchemaVersion,
		ActiveSeatNumber: state.ActiveSeatNumber,
		Round:            state.Round,
		Options:          responseOptions,
	}})
}

func initialPlacementContinue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	var request initialPlacementContinuationRequest
	if !decodeInitialPlacementRequest(w, r, &request) {
		return
	}
	if request.StateSchemaVersion != execution.PlacementStateSchemaVersion {
		writeError(w, http.StatusUnprocessableEntity, "unsupported_state_schema_version", "The state_schema_version must be state-v2.")
		return
	}

	state, err := toExecutionPlacementState(request.State)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v2 setup state.")
		return
	}
	if err := validateInitialPlacementGameConfiguration(request.GameConfiguration, state); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_game_configuration", "The supplied immutable game configuration does not match the canonical setup state.")
		return
	}

	result, err := execution.ContinueInitialPlacement(state, execution.InitialPlacementCommand{
		CommandType:      request.Command.CommandType,
		ActingSeatNumber: request.Command.ActingSeatNumber,
		Payload:          request.Command.Payload,
	}, request.NextEventSequence)
	if err != nil {
		writeInitialPlacementContractError(w, err)
		return
	}
	response, err := toInitialPlacementContinuationResponse(result)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "setup_continuation_failed", "The setup continuation could not be serialized.")
		return
	}
	writeJSON(w, http.StatusOK, initialPlacementContinuationEnvelope{Data: response})
}

func decodeInitialPlacementRequest(w http.ResponseWriter, r *http.Request, target any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	if err := decoder.Decode(target); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request body is too large.")
			return false
		}
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Setup request fields must use their documented JSON types.")
			return false
		}
		writeError(w, http.StatusBadRequest, "invalid_json", "The request body must contain valid JSON.")
		return false
	}

	var trailingValue json.RawMessage
	if err := decoder.Decode(&trailingValue); err != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid_json", "The request body must contain a single JSON value.")
		return false
	}
	return true
}

func toExecutionPlacementState(request placementStateRequest) (execution.PlacementState, error) {
	if request.SeatOrder == nil || request.Seats == nil || request.Players == nil {
		return execution.PlacementState{}, fmt.Errorf("state-v2 is missing setup arrays")
	}
	if request.Board.BoardSchemaVersion != boardSchemaVersion || request.Board.Hexes == nil || request.Board.Vertices == nil || request.Board.Edges == nil || request.Board.Ports == nil {
		return execution.PlacementState{}, fmt.Errorf("state-v2 contains an invalid board schema")
	}
	if request.Board.Ruleset.Version != rulesetVersion || request.Board.Map.Version != mapVersion || request.Board.Map.Orientation != mapOrientation {
		return execution.PlacementState{}, fmt.Errorf("state-v2 contains unsupported board metadata")
	}

	state := execution.PlacementState{
		Phase:            request.Phase,
		SeatOrder:        append([]int{}, request.SeatOrder...),
		Round:            request.Round,
		ActiveSeatNumber: request.ActiveSeatNumber,
		Step:             request.Step,
		Board:            toExecutionBoard(request.Board),
		Seats:            make([]execution.Seat, len(request.Seats)),
		Players:          make([]execution.PlayerState, len(request.Players)),
	}
	for index, seat := range request.Seats {
		state.Seats[index] = execution.Seat{SeatNumber: seat.SeatNumber, ControllerType: execution.ControllerType(seat.ControllerType)}
	}
	for index, player := range request.Players {
		if player.Settlements == nil || player.Roads == nil {
			return execution.PlacementState{}, fmt.Errorf("state-v2 player is missing placement arrays")
		}
		state.Players[index] = execution.PlayerState{
			SeatNumber: player.SeatNumber,
			Resources: execution.ResourceCounts{
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
	return state, nil
}

func toExecutionBoard(response boardResponse) board.Board {
	generatedBoard := board.Board{
		Seed:       response.Seed,
		RulesetKey: response.Ruleset.Key,
		MapKey:     response.Map.Key,
		Hexes:      make([]board.Hex, len(response.Hexes)),
		Vertices:   make([]board.Vertex, len(response.Vertices)),
		Edges:      make([]board.Edge, len(response.Edges)),
		Ports:      make([]board.Port, len(response.Ports)),
	}
	for index, hex := range response.Hexes {
		generatedBoard.Hexes[index] = board.Hex{
			ID:          hex.ID,
			Q:           hex.Q,
			R:           hex.R,
			Terrain:     hex.Terrain,
			NumberToken: hex.NumberToken,
			VertexIDs:   append([]string{}, hex.VertexIDs...),
		}
	}
	for index, vertex := range response.Vertices {
		generatedBoard.Vertices[index] = board.Vertex{ID: vertex.ID, X: vertex.X, Y: vertex.Y}
	}
	for index, edge := range response.Edges {
		generatedBoard.Edges[index] = board.Edge{ID: edge.ID, VertexIDs: edge.VertexIDs}
	}
	for index, port := range response.Ports {
		generatedBoard.Ports[index] = board.Port{
			ID:           port.ID,
			EdgeID:       port.EdgeID,
			ResourceType: port.ResourceType,
			TradeRatio:   port.TradeRatio,
		}
	}
	return generatedBoard
}

func validateInitialPlacementGameConfiguration(configuration initialPlacementGameConfig, state execution.PlacementState) error {
	seats := make([]execution.Seat, len(configuration.Seats))
	for index, seat := range configuration.Seats {
		seats[index] = execution.Seat{SeatNumber: seat.SeatNumber, ControllerType: execution.ControllerType(seat.ControllerType)}
	}
	canonical, err := execution.Bootstrap(execution.BootstrapConfig{
		Seed:       configuration.Seed,
		RulesetKey: configuration.RulesetKey,
		MapKey:     configuration.MapKey,
		Seats:      seats,
	})
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(canonical.State.Board, state.Board) || !reflect.DeepEqual(canonical.State.Seats, state.Seats) {
		return fmt.Errorf("game configuration differs from canonical state")
	}
	return nil
}

func activePlacementSeatIsHuman(state execution.PlacementState) bool {
	for _, seat := range state.Seats {
		if seat.SeatNumber == state.ActiveSeatNumber {
			return seat.ControllerType == execution.ControllerHuman
		}
	}
	return false
}

func writeInitialPlacementContractError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, execution.ErrPlacementCommandRequiresHuman):
		writeError(w, http.StatusUnprocessableEntity, "active_seat_not_human", "A placement command is accepted only for a human-controlled active seat.")
	case errors.Is(err, execution.ErrWrongActiveSeat):
		writeError(w, http.StatusUnprocessableEntity, "wrong_active_seat", "The command must be issued by the active seat.")
	case errors.Is(err, execution.ErrUnsupportedPlacementCommand):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_command", "The command type is not supported.")
	case errors.Is(err, execution.ErrInvalidPlacementCommand):
		writeError(w, http.StatusUnprocessableEntity, "invalid_command", "A settlement vertex and connected road edge are required.")
	case errors.Is(err, execution.ErrUnknownSettlementVertex), errors.Is(err, execution.ErrOccupiedSettlementVertex), errors.Is(err, execution.ErrAdjacentSettlement), errors.Is(err, execution.ErrUnknownRoadEdge), errors.Is(err, execution.ErrOccupiedRoadEdge), errors.Is(err, execution.ErrRoadNotConnected):
		writeError(w, http.StatusUnprocessableEntity, "illegal_placement", "The selected settlement and road are not a legal setup placement.")
	case errors.Is(err, execution.ErrInvalidEventSequence):
		writeError(w, http.StatusUnprocessableEntity, "invalid_event_sequence", "next_event_sequence must be a positive sequence number.")
	case errors.Is(err, execution.ErrInvalidPlacementPhase), errors.Is(err, execution.ErrInvalidPlacementState):
		writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid active setup state.")
	case errors.Is(err, execution.ErrNoLegalInitialPlacementOptions):
		writeError(w, http.StatusUnprocessableEntity, "no_legal_placement_options", "The active setup position has no legal settlement and road pair.")
	default:
		writeError(w, http.StatusInternalServerError, "setup_continuation_failed", "The setup continuation could not be completed.")
	}
}

func toInitialPlacementContinuationResponse(result execution.InitialPlacementContinuationResult) (initialPlacementContinuationResponse, error) {
	transitions := make([]initialPlacementContinuationTransition, len(result.Transitions))
	for index, transition := range result.Transitions {
		if transition.Command == nil {
			return initialPlacementContinuationResponse{}, fmt.Errorf("transition %d has no accepted command", index)
		}
		events, err := toPlacementEventResponses(transition.Events)
		if err != nil {
			return initialPlacementContinuationResponse{}, fmt.Errorf("serialize transition %d events: %w", index, err)
		}

		var actingSeatNumber *int
		if transition.Command.ActingSeatNumber > 0 {
			actingSeatNumber = intPointer(transition.Command.ActingSeatNumber)
		}
		var decision *placementDecisionResponse
		if transition.Decision != nil {
			decision = &placementDecisionResponse{
				PolicyVersion: transition.Decision.PolicyVersion,
				OptionID:      transition.Decision.OptionID,
			}
		}
		transitions[index] = initialPlacementContinuationTransition{
			CommandType:      transition.Command.CommandType,
			ActingSeatNumber: actingSeatNumber,
			Payload: initialPlacementCommandPayloadResponse{
				SettlementVertexID: transition.Command.Payload.SettlementVertexID,
				RoadEdgeID:         transition.Command.Payload.RoadEdgeID,
			},
			DecisionMetadata:   decision,
			StateSchemaVersion: transition.StateSchemaVersion,
			State:              toPlacementStateResponse(transition.State),
			Events:             events,
		}
	}

	return initialPlacementContinuationResponse{
		SchemaVersion: result.SetupContinuationSchemaVersion,
		StopReason:    string(result.StopReason),
		Transitions:   transitions,
	}, nil
}
