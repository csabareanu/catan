package execution

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"catan.local/game-engine/internal/board"
)

func TestStartNormalTurnUsesFirstSetupSeatAndRollsDeterministically(t *testing.T) {
	seed := seedWithTurnRolls(t, 2, false)
	setup := turnReadyPlacementState(t, seed, 3)
	wantRoll, err := rollDiceForTurn(seed, 1)
	if err != nil {
		t.Fatalf("rollDiceForTurn() error = %v", err)
	}
	setTestHexNumber(&setup.Board, "hex:forest-seat-3", wantRoll.Total)
	before := clonePlacementState(setup)

	command := TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: setup.SeatOrder[0]}
	first, err := StartNormalTurn(setup, command, 50)
	if err != nil {
		t.Fatalf("StartNormalTurn() error = %v", err)
	}
	repeated, err := StartNormalTurn(setup, command, 50)
	if err != nil {
		t.Fatalf("repeated StartNormalTurn() error = %v", err)
	}
	if !reflect.DeepEqual(repeated, first) {
		t.Fatal("same setup state, command, and event sequence produced different results")
	}
	if !reflect.DeepEqual(setup, before) {
		t.Fatal("StartNormalTurn() mutated the state-v2 setup input")
	}

	state := first.State
	if first.StateSchemaVersion != TurnStateSchemaVersion || state.Phase != PhaseNormalTurn {
		t.Errorf("state schema/phase = %q/%q, want %q/%q", first.StateSchemaVersion, state.Phase, TurnStateSchemaVersion, PhaseNormalTurn)
	}
	if state.ActiveSeatNumber != setup.SeatOrder[0] || state.Round != 1 || state.TurnNumber != 1 || state.TurnPhase != TurnPhaseAction {
		t.Errorf("first turn position = seat %d, round %d, turn %d, phase %q", state.ActiveSeatNumber, state.Round, state.TurnNumber, state.TurnPhase)
	}
	if state.RobberPosition != "hex:desert" || state.LastRoll == nil || *state.LastRoll != wantRoll {
		t.Errorf("robber/roll = %q/%+v, want desert and %+v", state.RobberPosition, state.LastRoll, wantRoll)
	}
	if len(first.Events) != 3 {
		t.Fatalf("event count = %d, want turn start, dice, and one production event: %+v", len(first.Events), first.Events)
	}
	wantEventTypes := []string{TurnStartedEventType, DiceRolledEventType, ResourcesProducedEventType}
	for index, event := range first.Events {
		if event.Sequence != 50+index || event.EventType != wantEventTypes[index] {
			t.Errorf("event %d = sequence %d type %q, want sequence %d type %q", index, event.Sequence, event.EventType, 50+index, wantEventTypes[index])
		}
	}
	if first.Events[0].Visibility != VisibilityPublic || first.Events[1].Visibility != VisibilityPublic {
		t.Errorf("turn-start and dice events must be public: %+v", first.Events[:2])
	}
	startedPayload, ok := first.Events[0].Payload.(TurnStartedPayload)
	if !ok || startedPayload.SeatNumber != setup.SeatOrder[0] || startedPayload.Round != 1 || startedPayload.TurnNumber != 1 {
		t.Errorf("turn-start payload = %#v, want first seat at round 1, turn 1", first.Events[0].Payload)
	}
	dicePayload, ok := first.Events[1].Payload.(DiceRolledPayload)
	if !ok || dicePayload.SeatNumber != setup.SeatOrder[0] || dicePayload.Total != wantRoll.Total || dicePayload.DieOne != wantRoll.DieOne || dicePayload.DieTwo != wantRoll.DieTwo {
		t.Errorf("dice payload = %#v, want %+v for seat %d", first.Events[1].Payload, wantRoll, setup.SeatOrder[0])
	}
	production := first.Events[2]
	if production.Visibility != VisibilitySeatPrivate || production.VisibleToSeatNumber == nil || *production.VisibleToSeatNumber != setup.SeatOrder[0] {
		t.Errorf("production visibility = %+v, want private to the receiving seat", production)
	}
	productionPayload, ok := production.Payload.(ResourcesProducedPayload)
	if !ok || productionPayload.SeatNumber != setup.SeatOrder[0] || productionPayload.Delta != (ResourceCounts{Lumber: 1}) {
		t.Errorf("production payload = %#v, want one lumber for seat %d", production.Payload, setup.SeatOrder[0])
	}
	if seatResources(state.Players, setup.SeatOrder[0]).Lumber != 1 {
		t.Errorf("first seat resources = %+v, want one lumber", seatResources(state.Players, setup.SeatOrder[0]))
	}
	for _, player := range state.Players {
		if player.Cities == nil {
			t.Errorf("state-v3 cities for seat %d = nil, want an empty collection", player.SeatNumber)
		}
	}
}

func TestApplyTurnCommandRollsSubsequentTurnDeterministically(t *testing.T) {
	seed := seedWithTurnRolls(t, 2, false)
	setup := turnReadyPlacementState(t, seed, 3)
	wantRoll, err := rollDiceForTurn(seed, 2)
	if err != nil {
		t.Fatalf("rollDiceForTurn() error = %v", err)
	}
	setTestHexNumber(&setup.Board, "hex:forest-seat-3", wantRoll.Total)

	first, err := StartNormalTurn(setup, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: setup.SeatOrder[0]}, 1)
	if err != nil {
		t.Fatalf("StartNormalTurn() error = %v", err)
	}
	nextEventSequence := 1 + len(first.Events)
	ended, err := ApplyTurnCommand(first.State, TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: first.State.ActiveSeatNumber}, nextEventSequence)
	if err != nil {
		t.Fatalf("first ApplyTurnCommand(end turn) error = %v", err)
	}
	nextEventSequence += len(ended.Events)

	before := cloneTurnState(ended.State)
	command := TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: ended.State.ActiveSeatNumber}
	firstRoll, err := ApplyTurnCommand(ended.State, command, nextEventSequence)
	if err != nil {
		t.Fatalf("ApplyTurnCommand(roll dice) error = %v", err)
	}
	repeatedRoll, err := ApplyTurnCommand(ended.State, command, nextEventSequence)
	if err != nil {
		t.Fatalf("repeated ApplyTurnCommand(roll dice) error = %v", err)
	}
	if !reflect.DeepEqual(firstRoll, repeatedRoll) {
		t.Fatal("same state, command, and event sequence produced different turn results")
	}
	if !reflect.DeepEqual(ended.State, before) {
		t.Fatal("ApplyTurnCommand(roll dice) mutated the state-v3 input")
	}

	if firstRoll.State.TurnPhase != TurnPhaseAction || firstRoll.State.LastRoll == nil || *firstRoll.State.LastRoll != wantRoll {
		t.Errorf("subsequent roll state = phase %q, roll %+v; want action and %+v", firstRoll.State.TurnPhase, firstRoll.State.LastRoll, wantRoll)
	}
	wantEventTypes := []string{DiceRolledEventType, ResourcesProducedEventType}
	if len(firstRoll.Events) != len(wantEventTypes) {
		t.Fatalf("subsequent roll events = %+v, want %v", firstRoll.Events, wantEventTypes)
	}
	for index, event := range firstRoll.Events {
		if event.Sequence != nextEventSequence+index || event.EventType != wantEventTypes[index] {
			t.Errorf("event %d = sequence %d type %q, want sequence %d type %q", index, event.Sequence, event.EventType, nextEventSequence+index, wantEventTypes[index])
		}
	}
	production := firstRoll.Events[1]
	if production.Visibility != VisibilitySeatPrivate || production.VisibleToSeatNumber == nil || *production.VisibleToSeatNumber != 3 {
		t.Errorf("production visibility = %+v, want private to seat 3", production)
	}
	if got := seatResources(firstRoll.State.Players, 3).Lumber; got != seatResources(ended.State.Players, 3).Lumber+1 {
		t.Errorf("seat 3 lumber after subsequent roll = %d, want one additional lumber", got)
	}
}

func TestEndTurnAdvancesThreeAndFourSeatOrderAndWrapsRound(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d seats", seatCount), func(t *testing.T) {
			seed := seedWithTurnRolls(t, seatCount, false)
			setup := turnReadyPlacementState(t, seed, seatCount)
			first, err := StartNormalTurn(setup, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: setup.SeatOrder[0]}, 1)
			if err != nil {
				t.Fatalf("StartNormalTurn() error = %v", err)
			}
			state := first.State
			nextEventSequence := 1 + len(first.Events)

			for orderIndex, seatNumber := range setup.SeatOrder {
				if orderIndex > 0 {
					rolled, err := ApplyTurnCommand(state, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: state.ActiveSeatNumber}, nextEventSequence)
					if err != nil {
						t.Fatalf("roll for seat %d: %v", state.ActiveSeatNumber, err)
					}
					if len(rolled.Events) != 1 || rolled.Events[0].EventType != DiceRolledEventType || rolled.Events[0].Sequence != nextEventSequence {
						t.Fatalf("roll events = %+v, want one ordered dice event", rolled.Events)
					}
					state = rolled.State
					nextEventSequence += len(rolled.Events)
				}
				if state.ActiveSeatNumber != seatNumber || state.Round != 1 || state.TurnNumber != orderIndex+1 {
					t.Fatalf("turn before ending = seat %d, round %d, number %d; want seat %d, round 1, number %d", state.ActiveSeatNumber, state.Round, state.TurnNumber, seatNumber, orderIndex+1)
				}

				before := cloneTurnState(state)
				ended, err := ApplyTurnCommand(state, TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: seatNumber}, nextEventSequence)
				if err != nil {
					t.Fatalf("end turn for seat %d: %v", seatNumber, err)
				}
				if !reflect.DeepEqual(state, before) {
					t.Fatalf("ending seat %d mutated its state-v3 input", seatNumber)
				}
				if len(ended.Events) != 2 || ended.Events[0].EventType != TurnEndedEventType || ended.Events[1].EventType != TurnStartedEventType {
					t.Fatalf("end-turn events = %+v, want turn-ended then turn-started", ended.Events)
				}
				for index, event := range ended.Events {
					if event.Sequence != nextEventSequence+index || event.Visibility != VisibilityPublic {
						t.Errorf("end-turn event %d = %+v, want public sequence %d", index, event, nextEventSequence+index)
					}
				}
				endedPayload, ok := ended.Events[0].Payload.(TurnEndedPayload)
				if !ok || endedPayload.SeatNumber != seatNumber || endedPayload.Round != 1 || endedPayload.TurnNumber != orderIndex+1 {
					t.Errorf("turn-ended payload = %#v, want seat %d, round 1, turn %d", ended.Events[0].Payload, seatNumber, orderIndex+1)
				}

				nextSeatNumber := setup.SeatOrder[(orderIndex+1)%seatCount]
				nextRound := 1
				if orderIndex == seatCount-1 {
					nextRound = 2
				}
				nextTurnNumber := orderIndex + 2
				startedPayload, ok := ended.Events[1].Payload.(TurnStartedPayload)
				if !ok || startedPayload.SeatNumber != nextSeatNumber || startedPayload.Round != nextRound || startedPayload.TurnNumber != nextTurnNumber {
					t.Errorf("turn-started payload = %#v, want seat %d, round %d, turn %d", ended.Events[1].Payload, nextSeatNumber, nextRound, nextTurnNumber)
				}
				if ended.State.ActiveSeatNumber != nextSeatNumber || ended.State.Round != nextRound || ended.State.TurnNumber != nextTurnNumber || ended.State.TurnPhase != TurnPhaseAwaitingRoll || ended.State.LastRoll != nil {
					t.Errorf("state after ending seat %d = seat %d, round %d, turn %d, phase %q, roll %+v", seatNumber, ended.State.ActiveSeatNumber, ended.State.Round, ended.State.TurnNumber, ended.State.TurnPhase, ended.State.LastRoll)
				}
				state = ended.State
				nextEventSequence += len(ended.Events)
			}
		})
	}
}

func TestApplyTurnCommandRejectsWrongSeatAndOutOfPhaseWithoutMutation(t *testing.T) {
	setup := turnReadyPlacementState(t, seedWithTurnRolls(t, 1, false), 3)
	first, err := StartNormalTurn(setup, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: setup.SeatOrder[0]}, 1)
	if err != nil {
		t.Fatalf("StartNormalTurn() error = %v", err)
	}
	awaiting, err := ApplyTurnCommand(first.State, TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: first.State.ActiveSeatNumber}, 1+len(first.Events))
	if err != nil {
		t.Fatalf("ApplyTurnCommand(end turn) error = %v", err)
	}
	sevenSetup := turnReadyPlacementState(t, seedWithTurnRolls(t, 1, true), 3)
	seven, err := StartNormalTurn(sevenSetup, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: sevenSetup.SeatOrder[0]}, 1)
	if err != nil {
		t.Fatalf("StartNormalTurn(seven) error = %v", err)
	}

	tests := []struct {
		name    string
		state   TurnState
		command TurnCommand
		wantErr error
	}{
		{
			name:    "wrong active seat",
			state:   first.State,
			command: TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: setup.SeatOrder[1]},
			wantErr: ErrWrongActiveSeat,
		},
		{
			name:    "roll during action phase",
			state:   first.State,
			command: TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: first.State.ActiveSeatNumber},
			wantErr: ErrInvalidTurnPhase,
		},
		{
			name:    "end turn while awaiting roll",
			state:   awaiting.State,
			command: TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: awaiting.State.ActiveSeatNumber},
			wantErr: ErrInvalidTurnPhase,
		},
		{
			name:    "roll after seven",
			state:   seven.State,
			command: TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: seven.State.ActiveSeatNumber},
			wantErr: ErrInvalidTurnPhase,
		},
		{
			name:    "end turn after seven",
			state:   seven.State,
			command: TurnCommand{CommandType: EndTurnCommandType, ActingSeatNumber: seven.State.ActiveSeatNumber},
			wantErr: ErrInvalidTurnPhase,
		},
		{
			name:    "unsupported command",
			state:   first.State,
			command: TurnCommand{CommandType: "build_road.v1", ActingSeatNumber: first.State.ActiveSeatNumber},
			wantErr: ErrUnsupportedTurnCommand,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			before := cloneTurnState(test.state)
			if _, err := ApplyTurnCommand(test.state, test.command, 100); !errors.Is(err, test.wantErr) {
				t.Fatalf("ApplyTurnCommand() error = %v, want %v", err, test.wantErr)
			}
			if !reflect.DeepEqual(test.state, before) {
				t.Fatal("rejected turn command mutated its state-v3 input")
			}
		})
	}
}

func TestCalculateProductionPaysTwoForCity(t *testing.T) {
	seed := seedWithTurnRolls(t, 2, false)
	setup := turnReadyPlacementState(t, seed, 3)
	roll, err := rollDiceForTurn(seed, 2)
	if err != nil {
		t.Fatalf("roll: %v", err)
	}
	setTestHexNumber(&setup.Board, "hex:fields-city-seat-1", roll.Total)
	state := TurnState{
		Board: setup.Board,
		Players: []TurnPlayerState{{
			SeatNumber: 1,
			Cities:     []string{"vertex:city-seat-1"},
		}},
	}
	production, err := calculateProduction(state, roll.Total)
	if err != nil {
		t.Fatalf("calculateProduction() error = %v", err)
	}
	if got := production[1]; got != (ResourceCounts{Grain: 2}) {
		t.Errorf("city production = %+v, want two grain for seat 1", got)
	}
}

func TestAddTerrainResourcesMapsEveryResourceTerrain(t *testing.T) {
	tests := []struct {
		terrain board.Terrain
		want    ResourceCounts
	}{
		{terrain: board.Forest, want: ResourceCounts{Lumber: 1}},
		{terrain: board.Pasture, want: ResourceCounts{Wool: 1}},
		{terrain: board.Fields, want: ResourceCounts{Grain: 1}},
		{terrain: board.Hills, want: ResourceCounts{Brick: 1}},
		{terrain: board.Mountains, want: ResourceCounts{Ore: 1}},
	}
	for _, test := range tests {
		t.Run(string(test.terrain), func(t *testing.T) {
			var got ResourceCounts
			if err := addTerrainResources(&got, test.terrain, 1); err != nil {
				t.Fatalf("addTerrainResources() error = %v", err)
			}
			if got != test.want {
				t.Errorf("resources = %+v, want %+v", got, test.want)
			}
		})
	}
}

func TestStartNormalTurnStopsAtRobberBoundaryOnSeven(t *testing.T) {
	seed := seedWithTurnRolls(t, 1, true)
	setup := turnReadyPlacementState(t, seed, 3)
	// A synthetic 7 token makes an accidental production calculation observable.
	setTestHexNumber(&setup.Board, "hex:forest-seat-3", 7)
	beforeResources := append([]PlayerState(nil), setup.Players...)
	result, err := StartNormalTurn(setup, TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: setup.SeatOrder[0]}, 70)
	if err != nil {
		t.Fatalf("StartNormalTurn() error = %v", err)
	}
	if result.State.TurnPhase != TurnPhaseRobberRequired || result.State.LastRoll == nil || result.State.LastRoll.Total != 7 {
		t.Fatalf("seven result phase/roll = %q/%+v, want robber_required with total 7", result.State.TurnPhase, result.State.LastRoll)
	}
	wantEventTypes := []string{TurnStartedEventType, DiceRolledEventType, RobberRequiredEventType}
	if len(result.Events) != len(wantEventTypes) {
		t.Fatalf("event count = %d, want %v", len(result.Events), wantEventTypes)
	}
	for index, event := range result.Events {
		if event.EventType != wantEventTypes[index] || event.Sequence != 70+index || event.Visibility != VisibilityPublic {
			t.Errorf("event %d = %+v, want public %q at sequence %d", index, event, wantEventTypes[index], 70+index)
		}
	}
	for _, player := range result.State.Players {
		if player.Resources != beforeResources[player.SeatNumber-1].Resources {
			t.Errorf("seat %d got production on seven: %+v", player.SeatNumber, player.Resources)
		}
	}
}

func TestStartNormalTurnRejectsInvalidSetupHandoffWithoutMutation(t *testing.T) {
	base := turnReadyPlacementState(t, "894177203164", 3)
	tests := []struct {
		name     string
		state    PlacementState
		command  TurnCommand
		sequence int
		wantErr  error
	}{
		{
			name: "not at turn-ready boundary",
			state: func() PlacementState {
				state := clonePlacementState(base)
				state.Phase = PhaseInitialPlacement
				return state
			}(),
			command:  TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: base.SeatOrder[0]},
			sequence: 1,
			wantErr:  ErrInvalidTurnState,
		},
		{
			name:     "wrong first active seat",
			state:    base,
			command:  TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: base.SeatOrder[1]},
			sequence: 1,
			wantErr:  ErrWrongActiveSeat,
		},
		{
			name:     "unsupported command",
			state:    base,
			command:  TurnCommand{CommandType: "end_turn.v1", ActingSeatNumber: base.SeatOrder[0]},
			sequence: 1,
			wantErr:  ErrUnsupportedTurnCommand,
		},
		{
			name:     "invalid event sequence",
			state:    base,
			command:  TurnCommand{CommandType: RollDiceCommandType, ActingSeatNumber: base.SeatOrder[0]},
			sequence: 0,
			wantErr:  ErrInvalidEventSequence,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			before := clonePlacementState(test.state)
			if _, err := StartNormalTurn(test.state, test.command, test.sequence); !errors.Is(err, test.wantErr) {
				t.Fatalf("StartNormalTurn() error = %v, want %v", err, test.wantErr)
			}
			if !reflect.DeepEqual(test.state, before) {
				t.Fatal("rejected first-turn command mutated the setup state")
			}
		})
	}
}

func TestRollDiceForTurnIsStableAndProducesLegalDice(t *testing.T) {
	first, err := rollDiceForTurn("894177203164", 7)
	if err != nil {
		t.Fatalf("rollDiceForTurn() error = %v", err)
	}
	repeated, err := rollDiceForTurn("894177203164", 7)
	if err != nil {
		t.Fatalf("repeated rollDiceForTurn() error = %v", err)
	}
	if first != repeated {
		t.Fatalf("same seed and turn rolled %+v then %+v", first, repeated)
	}
	if first.DieOne < 1 || first.DieOne > 6 || first.DieTwo < 1 || first.DieTwo > 6 || first.Total != first.DieOne+first.DieTwo {
		t.Errorf("illegal dice result: %+v", first)
	}
	if _, err := rollDiceForTurn("01", 1); !errors.Is(err, board.ErrInvalidSeed) {
		t.Errorf("non-canonical seed error = %v, want board.ErrInvalidSeed", err)
	}
	if _, err := rollDiceForTurn("1", 0); !errors.Is(err, ErrInvalidTurnState) {
		t.Errorf("zero turn number error = %v, want ErrInvalidTurnState", err)
	}
}

func turnReadyPlacementState(t *testing.T, seed string, seatCount int) PlacementState {
	t.Helper()
	seats := []Seat{
		{SeatNumber: 1, ControllerType: ControllerHuman},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerAI},
	}
	order := []int{3, 1, 2}
	if seatCount == 4 {
		seats = append(seats, Seat{SeatNumber: 4, ControllerType: ControllerAI})
		order = []int{4, 2, 1, 3}
	}
	if seatCount != 3 && seatCount != 4 {
		t.Fatalf("unsupported test seat count %d", seatCount)
	}
	players := make([]PlayerState, seatCount)
	for seatNumber := 1; seatNumber <= seatCount; seatNumber++ {
		players[seatNumber-1] = PlayerState{
			SeatNumber:  seatNumber,
			Settlements: []string{fmt.Sprintf("vertex:seat-%d-a", seatNumber), fmt.Sprintf("vertex:seat-%d-b", seatNumber)},
			Roads:       []string{fmt.Sprintf("edge:seat-%d-a", seatNumber), fmt.Sprintf("edge:seat-%d-b", seatNumber)},
		}
	}
	return PlacementState{
		Phase:            PhaseTurnReady,
		SeatOrder:        order,
		Round:            2,
		ActiveSeatNumber: 0,
		Board:            turnTestBoard(seed, seatCount),
		Seats:            seats,
		Players:          players,
	}
}

func turnTestBoard(seed string, seatCount int) board.Board {
	result := board.Board{Seed: seed, RulesetKey: "base", MapKey: "standard"}
	for seatNumber := 1; seatNumber <= seatCount; seatNumber++ {
		for _, suffix := range []string{"a", "b"} {
			vertexID := fmt.Sprintf("vertex:seat-%d-%s", seatNumber, suffix)
			roadEndID := fmt.Sprintf("vertex:road-end-%d-%s", seatNumber, suffix)
			result.Vertices = append(result.Vertices, board.Vertex{ID: vertexID}, board.Vertex{ID: roadEndID})
			result.Edges = append(result.Edges, board.Edge{ID: fmt.Sprintf("edge:seat-%d-%s", seatNumber, suffix), VertexIDs: [2]string{vertexID, roadEndID}})
		}
	}
	result.Vertices = append(result.Vertices, board.Vertex{ID: "vertex:city-seat-1"}, board.Vertex{ID: "vertex:desert"})
	result.Hexes = []board.Hex{
		{ID: "hex:desert", Terrain: board.Desert, VertexIDs: []string{"vertex:desert"}},
		{ID: "hex:forest-seat-3", Terrain: board.Forest, VertexIDs: []string{"vertex:seat-3-a"}},
		{ID: "hex:fields-city-seat-1", Terrain: board.Fields, VertexIDs: []string{"vertex:city-seat-1"}},
	}
	return result
}

func setTestHexNumber(boardState *board.Board, hexID string, number int) {
	for index := range boardState.Hexes {
		if boardState.Hexes[index].ID == hexID {
			boardState.Hexes[index].NumberToken = &number
			return
		}
	}
}

func seatResources(players []TurnPlayerState, seatNumber int) ResourceCounts {
	for _, player := range players {
		if player.SeatNumber == seatNumber {
			return player.Resources
		}
	}
	return ResourceCounts{}
}

func seedWithTurnRolls(t *testing.T, turnCount int, wantSeven bool) string {
	t.Helper()
	for seedValue := int64(0); seedValue < 10000; seedValue++ {
		seed := fmt.Sprintf("%d", seedValue)
		matches := true
		for turnNumber := 1; turnNumber <= turnCount; turnNumber++ {
			roll, err := rollDiceForTurn(seed, turnNumber)
			if err != nil {
				t.Fatalf("rollDiceForTurn(%q, %d) error = %v", seed, turnNumber, err)
			}
			if (roll.Total == 7) != wantSeven {
				matches = false
				break
			}
		}
		if matches {
			return seed
		}
	}
	t.Fatal("could not find a test seed with the requested roll pattern")
	return ""
}
