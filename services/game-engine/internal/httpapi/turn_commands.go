package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"catan.local/game-engine/internal/execution"
)

const turnCommandSchemaVersion = "1"

type turnCommandRequest struct {
	StateSchemaVersion string           `json:"state_schema_version"`
	State              json.RawMessage  `json:"state"`
	NextEventSequence  int              `json:"next_event_sequence"`
	Command            turnCommandInput `json:"command"`
}

type turnCommandInput struct {
	CommandType      string          `json:"command_type"`
	ActingSeatNumber int             `json:"acting_seat_number"`
	Payload          json.RawMessage `json:"payload"`
}

type turnCommandEnvelope struct {
	Data turnCommandResponse `json:"data"`
}

type turnCommandResponse struct {
	TurnCommandSchemaVersion string              `json:"turn_command_schema_version"`
	ExecutionSchemaVersion   string              `json:"execution_schema_version"`
	CommandType              string              `json:"command_type"`
	ActingSeatNumber         int                 `json:"acting_seat_number"`
	StateSchemaVersion       string              `json:"state_schema_version"`
	State                    turnStateResponse   `json:"state"`
	Events                   []turnEventResponse `json:"events"`
}

type turnStateRequest struct {
	Phase            string                   `json:"phase"`
	SeatOrder        []int                    `json:"seat_order"`
	Round            int                      `json:"round"`
	TurnNumber       int                      `json:"turn_number"`
	ActiveSeatNumber int                      `json:"active_seat_number"`
	TurnPhase        string                   `json:"turn_phase"`
	RobberPosition   string                   `json:"robber_position"`
	LastRoll         *turnDiceRollRequest     `json:"last_roll"`
	Board            boardResponse            `json:"board"`
	Seats            []placementSeatRequest   `json:"seats"`
	Players          []turnPlayerStateRequest `json:"players"`
}

type turnDiceRollRequest struct {
	DieOne int `json:"die_one"`
	DieTwo int `json:"die_two"`
	Total  int `json:"total"`
}

type turnPlayerStateRequest struct {
	SeatNumber  int                       `json:"seat_number"`
	Resources   placementResourcesRequest `json:"resources"`
	Settlements []string                  `json:"settlements"`
	Roads       []string                  `json:"roads"`
	Cities      []string                  `json:"cities"`
}

type turnStateResponse struct {
	Phase            string                    `json:"phase"`
	SeatOrder        []int                     `json:"seat_order"`
	Round            int                       `json:"round"`
	TurnNumber       int                       `json:"turn_number"`
	ActiveSeatNumber int                       `json:"active_seat_number"`
	TurnPhase        string                    `json:"turn_phase"`
	RobberPosition   string                    `json:"robber_position"`
	LastRoll         *turnDiceRollResponse     `json:"last_roll"`
	Board            boardResponse             `json:"board"`
	Seats            []seatResponse            `json:"seats"`
	Players          []turnPlayerStateResponse `json:"players"`
}

type turnDiceRollResponse struct {
	DieOne int `json:"die_one"`
	DieTwo int `json:"die_two"`
	Total  int `json:"total"`
}

type turnPlayerStateResponse struct {
	SeatNumber  int                    `json:"seat_number"`
	Resources   resourceCountsResponse `json:"resources"`
	Settlements []string               `json:"settlements"`
	Roads       []string               `json:"roads"`
	Cities      []string               `json:"cities"`
}

type turnEventResponse struct {
	Sequence            int    `json:"sequence"`
	EventType           string `json:"event_type"`
	Payload             any    `json:"payload"`
	Visibility          string `json:"visibility"`
	VisibleToSeatNumber *int   `json:"visible_to_seat_number"`
}

type turnStartedPayloadResponse struct {
	SeatNumber int `json:"seat_number"`
	Round      int `json:"round"`
	TurnNumber int `json:"turn_number"`
}

type turnEndedPayloadResponse struct {
	SeatNumber int `json:"seat_number"`
	Round      int `json:"round"`
	TurnNumber int `json:"turn_number"`
}

type diceRolledPayloadResponse struct {
	SeatNumber int `json:"seat_number"`
	DieOne     int `json:"die_one"`
	DieTwo     int `json:"die_two"`
	Total      int `json:"total"`
}

type resourcesProducedPayloadResponse struct {
	SeatNumber int                    `json:"seat_number"`
	Delta      resourceCountsResponse `json:"delta"`
}

type robberRequiredPayloadResponse struct {
	SeatNumber int `json:"seat_number"`
}

func turnCommand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Only POST is supported for this endpoint.")
		return
	}

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxRequestBodySize))
	var request turnCommandRequest
	if err := decoder.Decode(&request); err != nil {
		var maxBytesError *http.MaxBytesError
		if errors.As(err, &maxBytesError) {
			writeError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request body is too large.")
			return
		}
		var typeError *json.UnmarshalTypeError
		if errors.As(err, &typeError) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Turn command fields must use their documented JSON types.")
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
	if !isEmptyJSONObject(request.Command.Payload) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_request", "Turn command payload must be an empty JSON object.")
		return
	}
	if request.StateSchemaVersion != execution.PlacementStateSchemaVersion && request.StateSchemaVersion != execution.TurnStateSchemaVersion {
		writeError(w, http.StatusUnprocessableEntity, "unsupported_state_schema_version", "The state_schema_version must be state-v2 or state-v3.")
		return
	}

	command := execution.TurnCommand{
		CommandType:      request.Command.CommandType,
		ActingSeatNumber: request.Command.ActingSeatNumber,
	}
	var result execution.TurnResult
	var err error
	switch request.StateSchemaVersion {
	case execution.PlacementStateSchemaVersion:
		var placementRequest placementStateRequest
		if err := json.Unmarshal(request.State, &placementRequest); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v2 setup state.")
			return
		}
		state, stateErr := toExecutionPlacementState(placementRequest)
		if stateErr != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v2 setup state.")
			return
		}
		result, err = execution.StartNormalTurn(state, command, request.NextEventSequence)
	case execution.TurnStateSchemaVersion:
		var turnRequest turnStateRequest
		if err := json.Unmarshal(request.State, &turnRequest); err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v3 turn state.")
			return
		}
		state, stateErr := toExecutionTurnState(turnRequest)
		if stateErr != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not a valid state-v3 turn state.")
			return
		}
		result, err = execution.ApplyTurnCommand(state, command, request.NextEventSequence)
	}
	if err != nil {
		writeTurnCommandError(w, err)
		return
	}

	response, err := toTurnCommandResponse(result)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "turn_command_failed", "The turn command result could not be serialized.")
		return
	}
	writeJSON(w, http.StatusOK, turnCommandEnvelope{Data: response})
}

func isEmptyJSONObject(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("{}"))
}

func toExecutionTurnState(request turnStateRequest) (execution.TurnState, error) {
	if request.SeatOrder == nil || request.Seats == nil || request.Players == nil {
		return execution.TurnState{}, fmt.Errorf("state-v3 is missing turn arrays")
	}
	placementPlayers := make([]placementPlayerRequest, len(request.Players))
	for index, player := range request.Players {
		if player.Settlements == nil || player.Roads == nil || player.Cities == nil {
			return execution.TurnState{}, fmt.Errorf("state-v3 player is missing structure arrays")
		}
		placementPlayers[index] = placementPlayerRequest{
			SeatNumber:  player.SeatNumber,
			Resources:   player.Resources,
			Settlements: player.Settlements,
			Roads:       player.Roads,
		}
	}
	placementState, err := toExecutionPlacementState(placementStateRequest{
		Phase:            request.Phase,
		SeatOrder:        request.SeatOrder,
		Round:            request.Round,
		ActiveSeatNumber: request.ActiveSeatNumber,
		Board:            request.Board,
		Seats:            request.Seats,
		Players:          placementPlayers,
	})
	if err != nil {
		return execution.TurnState{}, err
	}

	state := execution.TurnState{
		Phase:            request.Phase,
		SeatOrder:        placementState.SeatOrder,
		Round:            request.Round,
		TurnNumber:       request.TurnNumber,
		ActiveSeatNumber: request.ActiveSeatNumber,
		TurnPhase:        request.TurnPhase,
		RobberPosition:   request.RobberPosition,
		Board:            placementState.Board,
		Seats:            placementState.Seats,
		Players:          make([]execution.TurnPlayerState, len(request.Players)),
	}
	if request.LastRoll != nil {
		state.LastRoll = &execution.DiceRoll{DieOne: request.LastRoll.DieOne, DieTwo: request.LastRoll.DieTwo, Total: request.LastRoll.Total}
	}
	for index, player := range request.Players {
		state.Players[index] = execution.TurnPlayerState{
			SeatNumber:  player.SeatNumber,
			Resources:   placementState.Players[index].Resources,
			Settlements: append([]string{}, player.Settlements...),
			Roads:       append([]string{}, player.Roads...),
			Cities:      append([]string{}, player.Cities...),
		}
	}
	return state, nil
}

func writeTurnCommandError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, execution.ErrWrongActiveSeat):
		writeError(w, http.StatusUnprocessableEntity, "wrong_active_seat", "The command actor is not the active seat.")
	case errors.Is(err, execution.ErrInvalidTurnPhase):
		writeError(w, http.StatusUnprocessableEntity, "invalid_turn_phase", "The command is not allowed during the current turn phase.")
	case errors.Is(err, execution.ErrUnsupportedTurnCommand):
		writeError(w, http.StatusUnprocessableEntity, "unsupported_turn_command", "The requested turn command is not supported.")
	case errors.Is(err, execution.ErrInvalidEventSequence):
		writeError(w, http.StatusUnprocessableEntity, "invalid_event_sequence", "The next event sequence must be a positive, non-overflowing integer.")
	case errors.Is(err, execution.ErrInvalidTurnState):
		writeError(w, http.StatusUnprocessableEntity, "invalid_state", "The supplied state is not valid for the requested turn command.")
	default:
		writeError(w, http.StatusInternalServerError, "turn_command_failed", "The turn command could not be completed.")
	}
}

func toTurnCommandResponse(result execution.TurnResult) (turnCommandResponse, error) {
	events := make([]turnEventResponse, len(result.Events))
	for index, event := range result.Events {
		payload, err := toTurnEventPayloadResponse(event.Payload)
		if err != nil {
			return turnCommandResponse{}, fmt.Errorf("serialize event %q: %w", event.EventType, err)
		}
		events[index] = turnEventResponse{
			Sequence:            event.Sequence,
			EventType:           event.EventType,
			Payload:             payload,
			Visibility:          string(event.Visibility),
			VisibleToSeatNumber: event.VisibleToSeatNumber,
		}
	}
	return turnCommandResponse{
		TurnCommandSchemaVersion: turnCommandSchemaVersion,
		ExecutionSchemaVersion:   result.ExecutionSchemaVersion,
		CommandType:              result.Command.CommandType,
		ActingSeatNumber:         result.Command.ActingSeatNumber,
		StateSchemaVersion:       result.StateSchemaVersion,
		State:                    toTurnStateResponse(result.State),
		Events:                   events,
	}, nil
}

func toTurnStateResponse(state execution.TurnState) turnStateResponse {
	players := make([]turnPlayerStateResponse, len(state.Players))
	for index, player := range state.Players {
		players[index] = turnPlayerStateResponse{
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
			Cities:      append([]string{}, player.Cities...),
		}
	}
	var lastRoll *turnDiceRollResponse
	if state.LastRoll != nil {
		lastRoll = &turnDiceRollResponse{DieOne: state.LastRoll.DieOne, DieTwo: state.LastRoll.DieTwo, Total: state.LastRoll.Total}
	}
	return turnStateResponse{
		Phase:            state.Phase,
		SeatOrder:        append([]int{}, state.SeatOrder...),
		Round:            state.Round,
		TurnNumber:       state.TurnNumber,
		ActiveSeatNumber: state.ActiveSeatNumber,
		TurnPhase:        state.TurnPhase,
		RobberPosition:   state.RobberPosition,
		LastRoll:         lastRoll,
		Board:            toBoardResponse(state.Board),
		Seats:            toSeatResponses(state.Seats),
		Players:          players,
	}
}

func toTurnEventPayloadResponse(payload execution.TurnEventPayload) (any, error) {
	switch payload := payload.(type) {
	case execution.TurnStartedPayload:
		return turnStartedPayloadResponse{SeatNumber: payload.SeatNumber, Round: payload.Round, TurnNumber: payload.TurnNumber}, nil
	case execution.TurnEndedPayload:
		return turnEndedPayloadResponse{SeatNumber: payload.SeatNumber, Round: payload.Round, TurnNumber: payload.TurnNumber}, nil
	case execution.DiceRolledPayload:
		return diceRolledPayloadResponse{SeatNumber: payload.SeatNumber, DieOne: payload.DieOne, DieTwo: payload.DieTwo, Total: payload.Total}, nil
	case execution.ResourcesProducedPayload:
		return resourcesProducedPayloadResponse{
			SeatNumber: payload.SeatNumber,
			Delta: resourceCountsResponse{
				Lumber: payload.Delta.Lumber,
				Wool:   payload.Delta.Wool,
				Grain:  payload.Delta.Grain,
				Brick:  payload.Delta.Brick,
				Ore:    payload.Delta.Ore,
			},
		}, nil
	case execution.RobberRequiredPayload:
		return robberRequiredPayloadResponse{SeatNumber: payload.SeatNumber}, nil
	default:
		return nil, fmt.Errorf("unsupported turn event payload %T", payload)
	}
}
