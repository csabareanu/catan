package execution

import (
	"errors"
	"fmt"

	"catan.local/game-engine/internal/board"
)

const (
	TurnStateSchemaVersion = "state-v3"
	PhaseNormalTurn        = "normal_turn"

	TurnPhaseAwaitingRoll   = "awaiting_roll"
	TurnPhaseAction         = "action"
	TurnPhaseRobberRequired = "robber_required"

	RollDiceCommandType = "roll_dice.v1"
	EndTurnCommandType  = "end_turn.v1"

	TurnStartedEventType       = "turn_started.v1"
	TurnEndedEventType         = "turn_ended.v1"
	DiceRolledEventType        = "dice_rolled.v1"
	ResourcesProducedEventType = "resources_produced.v1"
	RobberRequiredEventType    = "robber_required.v1"
)

const diceRollDerivationSalt uint64 = 0xd6e8feb86659fd93

var (
	ErrInvalidTurnState       = errors.New("invalid normal turn state")
	ErrInvalidTurnPhase       = errors.New("command is not valid in the current turn phase")
	ErrUnsupportedTurnCommand = errors.New("unsupported normal turn command")
)

// TurnPlayerState is one seat's canonical state during normal turns.
// Resource counts remain private when this state is projected by an API.
type TurnPlayerState struct {
	SeatNumber  int
	Resources   ResourceCounts
	Settlements []string
	Roads       []string
	Cities      []string
}

// TurnState is the state-v3 contract for the regular game loop.
type TurnState struct {
	Phase            string
	SeatOrder        []int
	Round            int
	TurnNumber       int
	ActiveSeatNumber int
	TurnPhase        string
	RobberPosition   string
	LastRoll         *DiceRoll
	Board            board.Board
	Seats            []Seat
	Players          []TurnPlayerState
}

// DiceRoll is the deterministic result for one regular turn.
type DiceRoll struct {
	DieOne int
	DieTwo int
	Total  int
}

// TurnCommand identifies an attempted command by the currently active seat.
// The roll command has an empty payload; its dice come from canonical state.
type TurnCommand struct {
	CommandType      string
	ActingSeatNumber int
}

// TurnEvent is an ordered domain event from one normal-turn transition.
type TurnEvent struct {
	Sequence            int
	EventType           string
	Payload             TurnEventPayload
	Visibility          Visibility
	VisibleToSeatNumber *int
}

// TurnEventPayload is the closed set of event payloads emitted by this slice.
type TurnEventPayload interface {
	turnEventPayload()
}

type TurnStartedPayload struct {
	SeatNumber int
	Round      int
	TurnNumber int
}

func (TurnStartedPayload) turnEventPayload() {}

type TurnEndedPayload struct {
	SeatNumber int
	Round      int
	TurnNumber int
}

func (TurnEndedPayload) turnEventPayload() {}

type DiceRolledPayload struct {
	SeatNumber int
	DieOne     int
	DieTwo     int
	Total      int
}

func (DiceRolledPayload) turnEventPayload() {}

type ResourcesProducedPayload struct {
	SeatNumber int
	Delta      ResourceCounts
}

func (ResourcesProducedPayload) turnEventPayload() {}

type RobberRequiredPayload struct {
	SeatNumber int
}

func (RobberRequiredPayload) turnEventPayload() {}

// TurnResult contains the new state and ordered events for one accepted turn
// command. The input state is never modified.
type TurnResult struct {
	ExecutionSchemaVersion string
	StateSchemaVersion     string
	State                  TurnState
	Events                 []TurnEvent
	Command                TurnCommand
}

// StartNormalTurn converts the completed state-v2 setup handoff to state-v3
// and applies the first seat's required dice roll.
func StartNormalTurn(state PlacementState, command TurnCommand, nextEventSequence int) (TurnResult, error) {
	if err := validateNextEventSequence(nextEventSequence, 1); err != nil {
		return TurnResult{}, err
	}
	if command.CommandType != RollDiceCommandType {
		return TurnResult{}, fmt.Errorf("%w: %q", ErrUnsupportedTurnCommand, command.CommandType)
	}
	desertID, err := validateTurnReadyPlacementState(state)
	if err != nil {
		return TurnResult{}, err
	}
	firstSeat := state.SeatOrder[0]
	if command.ActingSeatNumber != firstSeat {
		return TurnResult{}, fmt.Errorf("%w: seat %d, first regular seat is %d", ErrWrongActiveSeat, command.ActingSeatNumber, firstSeat)
	}

	players := make([]TurnPlayerState, len(state.Players))
	for index, player := range state.Players {
		players[index] = TurnPlayerState{
			SeatNumber:  player.SeatNumber,
			Resources:   player.Resources,
			Settlements: append([]string{}, player.Settlements...),
			Roads:       append([]string{}, player.Roads...),
			Cities:      []string{},
		}
	}
	turnState := TurnState{
		Phase:            PhaseNormalTurn,
		SeatOrder:        append([]int{}, state.SeatOrder...),
		Round:            1,
		TurnNumber:       1,
		ActiveSeatNumber: firstSeat,
		TurnPhase:        TurnPhaseAwaitingRoll,
		RobberPosition:   desertID,
		Board:            state.Board,
		Seats:            append([]Seat{}, state.Seats...),
		Players:          players,
	}
	result, err := applyDiceRoll(turnState, command, nextEventSequence, true)
	if err != nil {
		return TurnResult{}, err
	}
	return result, nil
}

// ApplyTurnCommand applies a command to an established state-v3 normal turn.
func ApplyTurnCommand(state TurnState, command TurnCommand, nextEventSequence int) (TurnResult, error) {
	if err := validateNextEventSequence(nextEventSequence, 1); err != nil {
		return TurnResult{}, err
	}
	if command.CommandType != RollDiceCommandType && command.CommandType != EndTurnCommandType {
		return TurnResult{}, fmt.Errorf("%w: %q", ErrUnsupportedTurnCommand, command.CommandType)
	}
	if err := validateTurnState(state); err != nil {
		return TurnResult{}, err
	}
	if command.ActingSeatNumber != state.ActiveSeatNumber {
		return TurnResult{}, fmt.Errorf("%w: seat %d, active seat is %d", ErrWrongActiveSeat, command.ActingSeatNumber, state.ActiveSeatNumber)
	}

	switch command.CommandType {
	case RollDiceCommandType:
		if state.TurnPhase != TurnPhaseAwaitingRoll {
			return TurnResult{}, fmt.Errorf("%w: cannot roll during %q", ErrInvalidTurnPhase, state.TurnPhase)
		}
		return applyDiceRoll(state, command, nextEventSequence, false)
	case EndTurnCommandType:
		if state.TurnPhase != TurnPhaseAction {
			return TurnResult{}, fmt.Errorf("%w: cannot end a turn during %q", ErrInvalidTurnPhase, state.TurnPhase)
		}
		return applyEndTurn(state, command, nextEventSequence)
	default:
		return TurnResult{}, fmt.Errorf("%w: %q", ErrUnsupportedTurnCommand, command.CommandType)
	}
}

func applyDiceRoll(state TurnState, command TurnCommand, nextEventSequence int, includeTurnStarted bool) (TurnResult, error) {
	roll, err := rollDiceForTurn(state.Board.Seed, state.TurnNumber)
	if err != nil {
		return TurnResult{}, err
	}

	production := map[int]ResourceCounts{}
	if roll.Total != 7 {
		production, err = calculateProduction(state, roll.Total)
		if err != nil {
			return TurnResult{}, err
		}
	}
	eventCount := 1 + len(production)
	if includeTurnStarted {
		eventCount++
	}
	if roll.Total == 7 {
		eventCount++
	}
	if err := validateNextEventSequence(nextEventSequence, eventCount); err != nil {
		return TurnResult{}, err
	}

	nextState := cloneTurnState(state)
	nextState.LastRoll = &roll
	if roll.Total == 7 {
		nextState.TurnPhase = TurnPhaseRobberRequired
	} else {
		nextState.TurnPhase = TurnPhaseAction
		for index := range nextState.Players {
			player := &nextState.Players[index]
			if delta, receives := production[player.SeatNumber]; receives {
				player.Resources = addResources(player.Resources, delta)
			}
		}
	}

	events := make([]TurnEvent, 0, eventCount)
	appendPublicEvent := func(eventType string, payload TurnEventPayload) {
		events = append(events, TurnEvent{
			Sequence:   nextEventSequence + len(events),
			EventType:  eventType,
			Payload:    payload,
			Visibility: VisibilityPublic,
		})
	}
	if includeTurnStarted {
		appendPublicEvent(TurnStartedEventType, TurnStartedPayload{
			SeatNumber: state.ActiveSeatNumber,
			Round:      state.Round,
			TurnNumber: state.TurnNumber,
		})
	}
	appendPublicEvent(DiceRolledEventType, DiceRolledPayload{
		SeatNumber: state.ActiveSeatNumber,
		DieOne:     roll.DieOne,
		DieTwo:     roll.DieTwo,
		Total:      roll.Total,
	})
	if roll.Total == 7 {
		appendPublicEvent(RobberRequiredEventType, RobberRequiredPayload{SeatNumber: state.ActiveSeatNumber})
	} else {
		for _, seatNumber := range state.SeatOrder {
			delta, receives := production[seatNumber]
			if !receives {
				continue
			}
			receivingSeat := seatNumber
			events = append(events, TurnEvent{
				Sequence:            nextEventSequence + len(events),
				EventType:           ResourcesProducedEventType,
				Payload:             ResourcesProducedPayload{SeatNumber: seatNumber, Delta: delta},
				Visibility:          VisibilitySeatPrivate,
				VisibleToSeatNumber: &receivingSeat,
			})
		}
	}

	return newTurnResult(nextState, events, command), nil
}

func applyEndTurn(state TurnState, command TurnCommand, nextEventSequence int) (TurnResult, error) {
	if err := validateNextEventSequence(nextEventSequence, 2); err != nil {
		return TurnResult{}, err
	}
	maxInt := int(^uint(0) >> 1)
	if state.TurnNumber == maxInt {
		return TurnResult{}, fmt.Errorf("%w: turn number overflows", ErrInvalidTurnState)
	}

	activeOrderIndex := -1
	for index, seatNumber := range state.SeatOrder {
		if seatNumber == state.ActiveSeatNumber {
			activeOrderIndex = index
			break
		}
	}
	if activeOrderIndex < 0 {
		return TurnResult{}, fmt.Errorf("%w: active seat %d is not in seat order", ErrInvalidTurnState, state.ActiveSeatNumber)
	}

	nextOrderIndex := activeOrderIndex + 1
	nextRound := state.Round
	if nextOrderIndex == len(state.SeatOrder) {
		nextOrderIndex = 0
		if nextRound == maxInt {
			return TurnResult{}, fmt.Errorf("%w: round number overflows", ErrInvalidTurnState)
		}
		nextRound++
	}
	nextTurnNumber := state.TurnNumber + 1
	nextSeatNumber := state.SeatOrder[nextOrderIndex]

	nextState := cloneTurnState(state)
	nextState.ActiveSeatNumber = nextSeatNumber
	nextState.Round = nextRound
	nextState.TurnNumber = nextTurnNumber
	nextState.TurnPhase = TurnPhaseAwaitingRoll
	nextState.LastRoll = nil

	events := []TurnEvent{
		{
			Sequence:   nextEventSequence,
			EventType:  TurnEndedEventType,
			Payload:    TurnEndedPayload{SeatNumber: state.ActiveSeatNumber, Round: state.Round, TurnNumber: state.TurnNumber},
			Visibility: VisibilityPublic,
		},
		{
			Sequence:   nextEventSequence + 1,
			EventType:  TurnStartedEventType,
			Payload:    TurnStartedPayload{SeatNumber: nextSeatNumber, Round: nextRound, TurnNumber: nextTurnNumber},
			Visibility: VisibilityPublic,
		},
	}
	return newTurnResult(nextState, events, command), nil
}

func validateTurnState(state TurnState) error {
	if state.Phase != PhaseNormalTurn || state.Round < 1 || state.TurnNumber < 1 {
		return fmt.Errorf("%w: invalid phase, round, or turn number", ErrInvalidTurnState)
	}
	if _, err := parsePlacementSeed(state.Board.Seed); err != nil {
		return fmt.Errorf("%w: invalid board seed: %v", ErrInvalidTurnState, err)
	}
	seats, err := normalizeSeats(state.Seats)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}
	if err := validateSeatOrder(state.SeatOrder, seats); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}
	activeSeatFound := false
	for _, seatNumber := range state.SeatOrder {
		if seatNumber == state.ActiveSeatNumber {
			activeSeatFound = true
			break
		}
	}
	if !activeSeatFound {
		return fmt.Errorf("%w: active seat %d is not in seat order", ErrInvalidTurnState, state.ActiveSeatNumber)
	}
	if len(state.Players) != len(seats) {
		return fmt.Errorf("%w: player count %d does not match seat count %d", ErrInvalidTurnState, len(state.Players), len(seats))
	}
	seatNumbers := make(map[int]struct{}, len(seats))
	for _, seat := range seats {
		seatNumbers[seat.SeatNumber] = struct{}{}
	}
	seenPlayers := make(map[int]struct{}, len(state.Players))
	for _, player := range state.Players {
		if _, exists := seatNumbers[player.SeatNumber]; !exists {
			return fmt.Errorf("%w: player state contains unknown seat %d", ErrInvalidTurnState, player.SeatNumber)
		}
		if _, exists := seenPlayers[player.SeatNumber]; exists {
			return fmt.Errorf("%w: player state repeats seat %d", ErrInvalidTurnState, player.SeatNumber)
		}
		if !validResourceCounts(player.Resources) {
			return fmt.Errorf("%w: seat %d has invalid resource counts", ErrInvalidTurnState, player.SeatNumber)
		}
		seenPlayers[player.SeatNumber] = struct{}{}
	}
	if len(seenPlayers) != len(seatNumbers) {
		return fmt.Errorf("%w: every seat must have one player state", ErrInvalidTurnState)
	}

	switch state.TurnPhase {
	case TurnPhaseAwaitingRoll:
		if state.LastRoll != nil {
			return fmt.Errorf("%w: awaiting-roll state must not retain a dice result", ErrInvalidTurnState)
		}
	case TurnPhaseAction:
		if !validDiceRoll(state.LastRoll) || state.LastRoll.Total == 7 {
			return fmt.Errorf("%w: action phase requires a non-seven dice result", ErrInvalidTurnState)
		}
	case TurnPhaseRobberRequired:
		if !validDiceRoll(state.LastRoll) || state.LastRoll.Total != 7 {
			return fmt.Errorf("%w: robber-required phase requires a seven", ErrInvalidTurnState)
		}
	default:
		return fmt.Errorf("%w: unsupported turn phase %q", ErrInvalidTurnState, state.TurnPhase)
	}
	return nil
}

func validDiceRoll(roll *DiceRoll) bool {
	return roll != nil && roll.DieOne >= 1 && roll.DieOne <= 6 && roll.DieTwo >= 1 && roll.DieTwo <= 6 && roll.Total == roll.DieOne+roll.DieTwo
}

func calculateProduction(state TurnState, roll int) (map[int]ResourceCounts, error) {
	production := make(map[int]ResourceCounts)
	for _, hex := range state.Board.Hexes {
		if hex.NumberToken == nil || *hex.NumberToken != roll || hex.Terrain == board.Desert {
			continue
		}
		for _, player := range state.Players {
			var delta ResourceCounts
			for _, vertexID := range player.Settlements {
				if containsVertex(hex.VertexIDs, vertexID) {
					if err := addTerrainResources(&delta, hex.Terrain, 1); err != nil {
						return nil, err
					}
				}
			}
			for _, vertexID := range player.Cities {
				if containsVertex(hex.VertexIDs, vertexID) {
					if err := addTerrainResources(&delta, hex.Terrain, 2); err != nil {
						return nil, err
					}
				}
			}
			if delta != (ResourceCounts{}) {
				production[player.SeatNumber] = addResources(production[player.SeatNumber], delta)
			}
		}
	}
	return production, nil
}

func addTerrainResources(resources *ResourceCounts, terrain board.Terrain, amount int) error {
	switch terrain {
	case board.Forest:
		resources.Lumber += amount
	case board.Pasture:
		resources.Wool += amount
	case board.Fields:
		resources.Grain += amount
	case board.Hills:
		resources.Brick += amount
	case board.Mountains:
		resources.Ore += amount
	default:
		return fmt.Errorf("%w: terrain %q cannot produce resources", ErrInvalidTurnState, terrain)
	}
	return nil
}

func addResources(first ResourceCounts, second ResourceCounts) ResourceCounts {
	return ResourceCounts{
		Lumber: first.Lumber + second.Lumber,
		Wool:   first.Wool + second.Wool,
		Grain:  first.Grain + second.Grain,
		Brick:  first.Brick + second.Brick,
		Ore:    first.Ore + second.Ore,
	}
}

func rollDiceForTurn(seed string, turnNumber int) (DiceRoll, error) {
	if turnNumber < 1 {
		return DiceRoll{}, fmt.Errorf("%w: turn number must be positive", ErrInvalidTurnState)
	}
	seedValue, err := parsePlacementSeed(seed)
	if err != nil {
		return DiceRoll{}, err
	}
	// Each turn gets an independent SplitMix64 stream derived from immutable
	// game input, so retries do not need to persist a mutable random generator.
	random := deterministicRandom{
		state: uint64(seedValue) ^ diceRollDerivationSalt ^ uint64(turnNumber)*0x9e3779b97f4a7c15,
	}
	dieOne := random.intn(6) + 1
	dieTwo := random.intn(6) + 1
	return DiceRoll{DieOne: dieOne, DieTwo: dieTwo, Total: dieOne + dieTwo}, nil
}

func validateTurnReadyPlacementState(state PlacementState) (string, error) {
	if state.Phase != PhaseTurnReady || state.Round != 2 || state.ActiveSeatNumber != 0 || state.Step != "" {
		return "", fmt.Errorf("%w: expected completed setup handoff, got phase %q round %d active seat %d step %q", ErrInvalidTurnState, state.Phase, state.Round, state.ActiveSeatNumber, state.Step)
	}
	seats, err := normalizeSeats(state.Seats)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}
	if err := validateSeatOrder(state.SeatOrder, seats); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}
	if _, err := parsePlacementSeed(state.Board.Seed); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}
	if len(state.Players) != len(seats) {
		return "", fmt.Errorf("%w: player count %d does not match seat count %d", ErrInvalidTurnState, len(state.Players), len(seats))
	}
	seatNumbers := make(map[int]struct{}, len(seats))
	for _, seat := range seats {
		seatNumbers[seat.SeatNumber] = struct{}{}
	}
	seenPlayers := make(map[int]struct{}, len(state.Players))
	seenSettlements := make(map[string]struct{})
	seenRoads := make(map[string]struct{})
	for _, player := range state.Players {
		if _, exists := seatNumbers[player.SeatNumber]; !exists {
			return "", fmt.Errorf("%w: player state contains unknown seat %d", ErrInvalidTurnState, player.SeatNumber)
		}
		if _, exists := seenPlayers[player.SeatNumber]; exists {
			return "", fmt.Errorf("%w: player state repeats seat %d", ErrInvalidTurnState, player.SeatNumber)
		}
		seenPlayers[player.SeatNumber] = struct{}{}
		if len(player.Settlements) != 2 || len(player.Roads) != 2 || !validResourceCounts(player.Resources) {
			return "", fmt.Errorf("%w: seat %d does not have a valid completed setup state", ErrInvalidTurnState, player.SeatNumber)
		}
		for _, vertexID := range player.Settlements {
			if _, exists := seenSettlements[vertexID]; exists {
				return "", fmt.Errorf("%w: setup vertex %q is occupied more than once", ErrInvalidTurnState, vertexID)
			}
			seenSettlements[vertexID] = struct{}{}
		}
		for _, edgeID := range player.Roads {
			if _, exists := seenRoads[edgeID]; exists {
				return "", fmt.Errorf("%w: setup edge %q is occupied more than once", ErrInvalidTurnState, edgeID)
			}
			seenRoads[edgeID] = struct{}{}
		}
	}
	if len(seenPlayers) != len(seatNumbers) {
		return "", fmt.Errorf("%w: every seat must have one player state", ErrInvalidTurnState)
	}
	if _, _, _, _, err := placementBoardIndexes(state); err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidTurnState, err)
	}

	desertID := ""
	for _, hex := range state.Board.Hexes {
		if hex.Terrain != board.Desert {
			continue
		}
		if hex.ID == "" || hex.NumberToken != nil || desertID != "" {
			return "", fmt.Errorf("%w: board must contain exactly one valid desert hex", ErrInvalidTurnState)
		}
		desertID = hex.ID
	}
	if desertID == "" {
		return "", fmt.Errorf("%w: board must contain exactly one desert hex", ErrInvalidTurnState)
	}
	return desertID, nil
}

func validateSeatOrder(seatOrder []int, seats []Seat) error {
	if len(seatOrder) != len(seats) {
		return fmt.Errorf("seat order length %d does not match seat count %d", len(seatOrder), len(seats))
	}
	seatNumbers := make(map[int]struct{}, len(seats))
	for _, seat := range seats {
		seatNumbers[seat.SeatNumber] = struct{}{}
	}
	seen := make(map[int]struct{}, len(seatOrder))
	for _, seatNumber := range seatOrder {
		if _, exists := seatNumbers[seatNumber]; !exists {
			return fmt.Errorf("seat order contains unknown seat %d", seatNumber)
		}
		if _, exists := seen[seatNumber]; exists {
			return fmt.Errorf("seat order repeats seat %d", seatNumber)
		}
		seen[seatNumber] = struct{}{}
	}
	return nil
}

func validResourceCounts(resources ResourceCounts) bool {
	return resources.Lumber >= 0 && resources.Wool >= 0 && resources.Grain >= 0 && resources.Brick >= 0 && resources.Ore >= 0
}

func containsVertex(vertexIDs []string, target string) bool {
	for _, vertexID := range vertexIDs {
		if vertexID == target {
			return true
		}
	}
	return false
}

func cloneTurnState(state TurnState) TurnState {
	clone := state
	clone.SeatOrder = append([]int{}, state.SeatOrder...)
	clone.Seats = append([]Seat{}, state.Seats...)
	clone.Players = make([]TurnPlayerState, len(state.Players))
	for index, player := range state.Players {
		clone.Players[index] = player
		clone.Players[index].Settlements = append([]string{}, player.Settlements...)
		clone.Players[index].Roads = append([]string{}, player.Roads...)
		clone.Players[index].Cities = append([]string{}, player.Cities...)
	}
	if state.LastRoll != nil {
		roll := *state.LastRoll
		clone.LastRoll = &roll
	}
	return clone
}

func newTurnResult(state TurnState, events []TurnEvent, command TurnCommand) TurnResult {
	return TurnResult{
		ExecutionSchemaVersion: ExecutionSchemaVersion,
		StateSchemaVersion:     TurnStateSchemaVersion,
		State:                  state,
		Events:                 events,
		Command:                command,
	}
}

func validateNextEventSequence(firstSequence, eventCount int) error {
	if firstSequence < 1 || eventCount < 1 {
		return fmt.Errorf("%w: sequence and event count must be positive", ErrInvalidEventSequence)
	}
	maxInt := int(^uint(0) >> 1)
	if firstSequence > maxInt-(eventCount-1) {
		return fmt.Errorf("%w: event sequence range overflows", ErrInvalidEventSequence)
	}
	return nil
}
