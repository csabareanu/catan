package execution

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"catan.local/game-engine/internal/board"
)

func TestApplyInitialPlacementCommandCompletesThreeAndFourSeatSetup(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d seats", seatCount), func(t *testing.T) {
			state := newPlacementTestState(t, seatCount)
			seatOrder := append([]int(nil), state.SeatOrder...)
			nextEventSequence := 3

			for placementNumber := 0; placementNumber < seatCount*2; placementNumber++ {
				actingSeat := state.ActiveSeatNumber
				settlementSlot := placementNumber + 1
				result, err := ApplyInitialPlacementCommand(state, InitialPlacementCommand{
					CommandType:      InitialPlacementCommandType,
					ActingSeatNumber: actingSeat,
					Payload: InitialPlacementCommandPayload{
						SettlementVertexID: placementVertexID(settlementSlot),
						RoadEdgeID:         placementEdgeID(settlementSlot),
					},
				}, nextEventSequence)
				if err != nil {
					t.Fatalf("placement %d for seat %d: ApplyInitialPlacementCommand() error = %v", placementNumber+1, actingSeat, err)
				}

				wantEventTypes := []string{InitialSettlementPlacedEventType, InitialRoadPlacedEventType}
				if state.Round == 2 {
					wantEventTypes = append(wantEventTypes, InitialResourcesGrantedEventType)
				}
				completesSetup := state.Round == 2 && state.ActiveSeatNumber == seatOrder[0]
				if completesSetup {
					wantEventTypes = append(wantEventTypes, InitialPlacementCompletedEventType)
				}
				if len(result.Events) != len(wantEventTypes) {
					t.Fatalf("placement %d event count = %d, want %d: %+v", placementNumber+1, len(result.Events), len(wantEventTypes), result.Events)
				}
				for index, event := range result.Events {
					if event.Sequence != nextEventSequence+index || event.EventType != wantEventTypes[index] {
						t.Errorf("placement %d event %d = sequence %d type %q, want sequence %d type %q", placementNumber+1, index, event.Sequence, event.EventType, nextEventSequence+index, wantEventTypes[index])
					}
					if event.Visibility != VisibilityPublic || event.VisibleToSeatNumber != nil {
						t.Errorf("placement %d event %d visibility = %+v, want public", placementNumber+1, index, event)
					}
				}

				settlementPayload, ok := result.Events[0].Payload.(InitialSettlementPlacedPayload)
				if !ok || settlementPayload.SeatNumber != actingSeat || settlementPayload.SettlementVertexID != placementVertexID(settlementSlot) {
					t.Errorf("settlement payload = %#v, want seat %d at %q", result.Events[0].Payload, actingSeat, placementVertexID(settlementSlot))
				}
				roadPayload, ok := result.Events[1].Payload.(InitialRoadPlacedPayload)
				if !ok || roadPayload.SeatNumber != actingSeat || roadPayload.SettlementVertexID != placementVertexID(settlementSlot) || roadPayload.RoadEdgeID != placementEdgeID(settlementSlot) {
					t.Errorf("road payload = %#v, want seat %d at %q using %q", result.Events[1].Payload, actingSeat, placementVertexID(settlementSlot), placementEdgeID(settlementSlot))
				}

				if state.Round == 2 {
					grantPayload, ok := result.Events[2].Payload.(InitialResourcesGrantedPayload)
					if !ok || grantPayload.SeatNumber != actingSeat || grantPayload.Resources != expectedPlacementGrant() {
						t.Errorf("resource grant payload = %#v, want seat %d with %+v", result.Events[2].Payload, actingSeat, expectedPlacementGrant())
					}
				} else if resources, found := placementPlayerResources(result.State.Players, actingSeat); !found {
					t.Errorf("seat %d has no player state after its first settlement", actingSeat)
				} else if resources != (ResourceCounts{}) {
					t.Errorf("seat %d received resources after its first settlement: %+v", actingSeat, resources)
				}

				if completesSetup {
					completionPayload, ok := result.Events[len(result.Events)-1].Payload.(InitialPlacementCompletedPayload)
					if !ok || completionPayload.NextPhase != PhaseTurnReady || !reflect.DeepEqual(completionPayload.SeatOrder, seatOrder) {
						t.Errorf("completion payload = %#v, want seat order %v and phase %q", result.Events[len(result.Events)-1].Payload, seatOrder, PhaseTurnReady)
					}
				}

				nextEventSequence += len(result.Events)
				state = result.State
			}

			if state.Phase != PhaseTurnReady || state.Step != "" || state.ActiveSeatNumber != 0 || state.Round != 2 {
				t.Errorf("completed state = phase %q, round %d, active seat %d, step %q; want turn_ready handoff", state.Phase, state.Round, state.ActiveSeatNumber, state.Step)
			}
			for _, player := range state.Players {
				if len(player.Settlements) != 2 || len(player.Roads) != 2 {
					t.Errorf("seat %d has %d settlements and %d roads, want two of each", player.SeatNumber, len(player.Settlements), len(player.Roads))
				}
				if player.Resources != expectedPlacementGrant() {
					t.Errorf("seat %d resources = %+v, want second-settlement grant %+v", player.SeatNumber, player.Resources, expectedPlacementGrant())
				}
			}
		})
	}
}

func TestApplyInitialPlacementCommandUsesForwardThenReverseOrder(t *testing.T) {
	state := newPlacementTestState(t, 3)
	order := append([]int(nil), state.SeatOrder...)
	for placementNumber := 0; placementNumber < 6; placementNumber++ {
		var wantSeat int
		if placementNumber < len(order) {
			wantSeat = order[placementNumber]
		} else {
			wantSeat = order[len(order)*2-placementNumber-1]
		}
		if state.ActiveSeatNumber != wantSeat {
			t.Fatalf("before placement %d active seat = %d, want %d in order %v", placementNumber+1, state.ActiveSeatNumber, wantSeat, order)
		}
		result, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, placementNumber+1), 3)
		if err != nil {
			t.Fatalf("placement %d: ApplyInitialPlacementCommand() error = %v", placementNumber+1, err)
		}
		state = result.State
	}
}

func TestApplyInitialPlacementCommandIsDeterministicAndDoesNotMutateInput(t *testing.T) {
	state := newPlacementTestState(t, 3)
	before := state
	command := testPlacementCommand(state.ActiveSeatNumber, 1)

	first, err := ApplyInitialPlacementCommand(state, command, 3)
	if err != nil {
		t.Fatalf("first ApplyInitialPlacementCommand() error = %v", err)
	}
	repeated, err := ApplyInitialPlacementCommand(state, command, 3)
	if err != nil {
		t.Fatalf("repeated ApplyInitialPlacementCommand() error = %v", err)
	}
	if !reflect.DeepEqual(repeated, first) {
		t.Fatal("identical state, command, and event sequence produced different results")
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatal("ApplyInitialPlacementCommand() mutated its input state")
	}
}

func TestApplyInitialPlacementCommandRejectsIllegalPairsAtomically(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(PlacementState) (PlacementState, InitialPlacementCommand)
		wantErr error
	}{
		{
			name: "wrong phase",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				state.Phase = PhaseTurnReady
				return state, testPlacementCommand(state.ActiveSeatNumber, 1)
			},
			wantErr: ErrInvalidPlacementPhase,
		},
		{
			name: "wrong active seat",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.SeatOrder[1], 1)
				return state, command
			},
			wantErr: ErrWrongActiveSeat,
		},
		{
			name: "unsupported command",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.CommandType = "place_city.v1"
				return state, command
			},
			wantErr: ErrUnsupportedPlacementCommand,
		},
		{
			name: "missing settlement vertex",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.SettlementVertexID = "vertex:missing"
				return state, command
			},
			wantErr: ErrUnknownSettlementVertex,
		},
		{
			name: "missing road edge",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.RoadEdgeID = "edge:missing"
				return state, command
			},
			wantErr: ErrUnknownRoadEdge,
		},
		{
			name: "road is not connected to settlement",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.RoadEdgeID = placementEdgeID(2)
				return state, command
			},
			wantErr: ErrRoadNotConnected,
		},
		{
			name: "occupied road edge",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				state.Players[1].Roads = append(state.Players[1].Roads, placementEdgeID(1))
				return state, testPlacementCommand(state.ActiveSeatNumber, 1)
			},
			wantErr: ErrOccupiedRoadEdge,
		},
		{
			name: "empty settlement identifier",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.SettlementVertexID = ""
				return state, command
			},
			wantErr: ErrInvalidPlacementCommand,
		},
		{
			name: "empty road identifier",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.RoadEdgeID = ""
				return state, command
			},
			wantErr: ErrInvalidPlacementCommand,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state, command := test.prepare(newPlacementTestState(t, 3))
			before := state
			result, err := ApplyInitialPlacementCommand(state, command, 3)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("ApplyInitialPlacementCommand() error = %v, want %v", err, test.wantErr)
			}
			if len(result.Events) != 0 || !reflect.DeepEqual(result.State, PlacementState{}) {
				t.Errorf("rejected command returned partial result: %+v", result)
			}
			if !reflect.DeepEqual(state, before) {
				t.Fatal("rejected command mutated its input state")
			}
		})
	}
}

func TestApplyInitialPlacementCommandRejectsOccupiedAndAdjacentSettlements(t *testing.T) {
	for _, test := range []struct {
		name    string
		prepare func(PlacementState) PlacementState
		command func(PlacementState) InitialPlacementCommand
		wantErr error
	}{
		{
			name: "occupied settlement vertex",
			prepare: func(state PlacementState) PlacementState {
				first, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, 1), 3)
				if err != nil {
					t.Fatalf("first valid placement error = %v", err)
				}
				return first.State
			},
			command: func(state PlacementState) InitialPlacementCommand {
				return testPlacementCommand(state.ActiveSeatNumber, 1)
			},
			wantErr: ErrOccupiedSettlementVertex,
		},
		{
			name: "adjacent settlement vertex",
			prepare: func(state PlacementState) PlacementState {
				state.Board.Edges = append(state.Board.Edges, board.Edge{
					ID:        "edge:adjacent-settlements",
					VertexIDs: [2]string{placementVertexID(1), placementVertexID(2)},
				})
				first, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, 1), 3)
				if err != nil {
					t.Fatalf("first valid placement error = %v", err)
				}
				return first.State
			},
			command: func(state PlacementState) InitialPlacementCommand {
				return testPlacementCommand(state.ActiveSeatNumber, 2)
			},
			wantErr: ErrAdjacentSettlement,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			state := test.prepare(newPlacementTestState(t, 3))
			before := state
			result, err := ApplyInitialPlacementCommand(state, test.command(state), 5)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("ApplyInitialPlacementCommand() error = %v, want %v", err, test.wantErr)
			}
			if len(result.Events) != 0 || !reflect.DeepEqual(result.State, PlacementState{}) {
				t.Errorf("rejected command returned partial result: %+v", result)
			}
			if !reflect.DeepEqual(state, before) {
				t.Fatal("rejected command mutated its input state")
			}
		})
	}
}

func TestApplyInitialPlacementCommandRejectsInvalidEventSequence(t *testing.T) {
	state := newPlacementTestState(t, 3)
	if _, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, 1), 0); !errors.Is(err, ErrInvalidEventSequence) {
		t.Fatalf("ApplyInitialPlacementCommand() error = %v, want ErrInvalidEventSequence", err)
	}
}

func newPlacementTestState(t *testing.T, seatCount int) PlacementState {
	t.Helper()
	config := standardBootstrapConfig
	if seatCount == 4 {
		config.Seats = []Seat{
			{SeatNumber: 1, ControllerType: ControllerHuman},
			{SeatNumber: 2, ControllerType: ControllerAI},
			{SeatNumber: 3, ControllerType: ControllerAI},
			{SeatNumber: 4, ControllerType: ControllerAI},
		}
	} else if seatCount != 3 {
		t.Fatalf("unsupported test seat count %d", seatCount)
	}
	bootstrap, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}
	started, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	started.State.Board = placementTestBoard(seatCount)
	return started.State
}

func placementTestBoard(seatCount int) board.Board {
	result := board.Board{
		Seed:       standardBootstrapConfig.Seed,
		RulesetKey: standardBootstrapConfig.RulesetKey,
		MapKey:     standardBootstrapConfig.MapKey,
	}
	for slot := 1; slot <= seatCount*2; slot++ {
		vertexID := placementVertexID(slot)
		roadEndID := fmt.Sprintf("vertex:road-end-%d", slot)
		result.Vertices = append(result.Vertices,
			board.Vertex{ID: vertexID},
			board.Vertex{ID: roadEndID},
		)
		result.Edges = append(result.Edges, board.Edge{
			ID:        placementEdgeID(slot),
			VertexIDs: [2]string{vertexID, roadEndID},
		})
		for index, terrain := range []board.Terrain{
			board.Forest,
			board.Forest,
			board.Pasture,
			board.Fields,
			board.Hills,
			board.Mountains,
			board.Desert,
		} {
			result.Hexes = append(result.Hexes, board.Hex{
				ID:        fmt.Sprintf("hex:%d:%d", slot, index),
				Terrain:   terrain,
				VertexIDs: []string{vertexID},
			})
		}
	}
	return result
}

func testPlacementCommand(seatNumber, slot int) InitialPlacementCommand {
	return InitialPlacementCommand{
		CommandType:      InitialPlacementCommandType,
		ActingSeatNumber: seatNumber,
		Payload: InitialPlacementCommandPayload{
			SettlementVertexID: placementVertexID(slot),
			RoadEdgeID:         placementEdgeID(slot),
		},
	}
}

func placementVertexID(slot int) string {
	return fmt.Sprintf("vertex:placement-%d", slot)
}

func placementEdgeID(slot int) string {
	return fmt.Sprintf("edge:placement-%d", slot)
}

func expectedPlacementGrant() ResourceCounts {
	return ResourceCounts{Lumber: 2, Wool: 1, Grain: 1, Brick: 1, Ore: 1}
}

func placementPlayerResources(players []PlayerState, seatNumber int) (ResourceCounts, bool) {
	for _, player := range players {
		if player.SeatNumber == seatNumber {
			return player.Resources, true
		}
	}
	return ResourceCounts{}, false
}
