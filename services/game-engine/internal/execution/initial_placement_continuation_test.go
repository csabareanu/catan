package execution

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"testing"
)

func TestContinueInitialPlacementRunsAIUntilTheNextHumanPlacement(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d seats", seatCount), func(t *testing.T) {
			state := initialPlacementStateWithOneActiveHuman(t, seatCount)
			stateBefore := clonePlacementStateForMutationCheck(t, state)
			options, err := LegalInitialPlacementOptions(state)
			if err != nil {
				t.Fatalf("LegalInitialPlacementOptions() error = %v", err)
			}
			if len(options) == 0 {
				t.Fatal("LegalInitialPlacementOptions() returned no pairs")
			}
			command := InitialPlacementCommand{
				CommandType:      InitialPlacementCommandType,
				ActingSeatNumber: state.ActiveSeatNumber,
				Payload: InitialPlacementCommandPayload{
					SettlementVertexID: options[0].SettlementVertexID,
					RoadEdgeID:         options[0].RoadEdgeID,
				},
			}

			first, err := ContinueInitialPlacement(state, command, 3)
			if err != nil {
				t.Fatalf("ContinueInitialPlacement() error = %v", err)
			}
			if !reflect.DeepEqual(state, stateBefore) {
				t.Fatal("first ContinueInitialPlacement() mutated its input state")
			}
			repeated, err := ContinueInitialPlacement(state, command, 3)
			if err != nil {
				t.Fatalf("repeated ContinueInitialPlacement() error = %v", err)
			}
			if !reflect.DeepEqual(state, stateBefore) {
				t.Fatal("repeated ContinueInitialPlacement() mutated its input state")
			}
			if !reflect.DeepEqual(repeated, first) {
				t.Fatal("identical state, command, and event sequence produced different continuations")
			}
			if first.SetupContinuationSchemaVersion != InitialPlacementContinuationSchemaVersion {
				t.Errorf("continuation schema version = %q, want %q", first.SetupContinuationSchemaVersion, InitialPlacementContinuationSchemaVersion)
			}
			if first.StopReason != InitialPlacementRunStopReasonHumanInputRequired {
				t.Fatalf("stop reason = %q, want %q", first.StopReason, InitialPlacementRunStopReasonHumanInputRequired)
			}
			if got, want := len(first.Transitions), 2*seatCount-1; got != want {
				t.Fatalf("transition count = %d, want %d before the human's round-two placement", got, want)
			}

			currentState := state
			for index, transition := range first.Transitions {
				if transition.Command == nil {
					t.Fatalf("transition %d omitted its accepted command", index)
				}
				if transition.Command.ActingSeatNumber != currentState.ActiveSeatNumber {
					t.Errorf("transition %d acting seat = %d, want active seat %d", index, transition.Command.ActingSeatNumber, currentState.ActiveSeatNumber)
				}
				if transition.StateSchemaVersion != PlacementStateSchemaVersion {
					t.Errorf("transition %d state schema = %q, want %q", index, transition.StateSchemaVersion, PlacementStateSchemaVersion)
				}

				if index == 0 {
					if transition.Decision != nil {
						t.Errorf("human transition decision = %+v, want nil", transition.Decision)
					}
					if !reflect.DeepEqual(*transition.Command, command) {
						t.Errorf("accepted human command = %+v, want %+v", *transition.Command, command)
					}
				} else {
					if transition.Decision == nil {
						t.Fatalf("AI transition %d omitted decision metadata", index)
					}
					if transition.Decision.PolicyVersion != RandomPlacementPolicyVersion {
						t.Errorf("AI transition %d policy version = %q, want %q", index, transition.Decision.PolicyVersion, RandomPlacementPolicyVersion)
					}
					controller, found := activePlacementController(currentState)
					if !found || controller != ControllerAI {
						t.Errorf("transition %d applied an AI decision for a non-AI seat", index)
					}
					if !containsPlacementOption(mustPlacementOptions(t, currentState), transition.Decision.OptionID, transition.Command.Payload) {
						t.Errorf("AI transition %d command %+v does not match a legal option", index, transition.Command.Payload)
					}
				}

				currentState = transition.State
			}

			if currentState.Phase != PhaseInitialPlacement || currentState.Round != 2 || currentState.ActiveSeatNumber != state.ActiveSeatNumber {
				t.Errorf("stopped state = phase %q, round %d, active seat %d; want round two at human seat %d", currentState.Phase, currentState.Round, currentState.ActiveSeatNumber, state.ActiveSeatNumber)
			}
			assertContinuationEventSequence(t, first.Transitions, 3)
		})
	}
}

func TestContinueInitialPlacementCompletesWhenHumanMakesTheFinalPlacement(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d seats", seatCount), func(t *testing.T) {
			state := newPlacementTestState(t, seatCount)
			for index := range state.Seats {
				state.Seats[index].ControllerType = ControllerAI
			}

			nextEventSequence := 3
			for placementNumber := 1; placementNumber < seatCount*2; placementNumber++ {
				placement, err := ApplyInitialPlacementCommand(
					state,
					testPlacementCommand(state.ActiveSeatNumber, placementNumber),
					nextEventSequence,
				)
				if err != nil {
					t.Fatalf("prepare placement %d: ApplyInitialPlacementCommand() error = %v", placementNumber, err)
				}
				nextEventSequence += len(placement.Events)
				state = placement.State
			}

			if state.Round != 2 || state.ActiveSeatNumber != state.SeatOrder[0] {
				t.Fatalf("prepared state is round %d at seat %d, want final round-two seat %d", state.Round, state.ActiveSeatNumber, state.SeatOrder[0])
			}
			setSeatController(state.Seats, state.ActiveSeatNumber, ControllerHuman)
			command := testPlacementCommand(state.ActiveSeatNumber, seatCount*2)

			result, err := ContinueInitialPlacement(state, command, nextEventSequence)
			if err != nil {
				t.Fatalf("ContinueInitialPlacement() error = %v", err)
			}
			if result.StopReason != InitialPlacementRunStopReasonTurnReady {
				t.Fatalf("stop reason = %q, want %q", result.StopReason, InitialPlacementRunStopReasonTurnReady)
			}
			if len(result.Transitions) != 1 {
				t.Fatalf("transition count = %d, want only the final human placement", len(result.Transitions))
			}
			finalPlacement := result.Transitions[0]
			if finalPlacement.State.Phase != PhaseTurnReady || finalPlacement.State.ActiveSeatNumber != 0 {
				t.Errorf("final state = phase %q, active seat %d, want turn_ready with no active setup seat", finalPlacement.State.Phase, finalPlacement.State.ActiveSeatNumber)
			}
			if finalPlacement.Decision != nil {
				t.Errorf("final human transition decision = %+v, want nil", finalPlacement.Decision)
			}
			if len(finalPlacement.Events) != 4 || finalPlacement.Events[len(finalPlacement.Events)-1].EventType != InitialPlacementCompletedEventType {
				t.Errorf("final human events = %+v, want placement, resource grant, and completion events", finalPlacement.Events)
			}
			assertContinuationEventSequence(t, result.Transitions, nextEventSequence)
		})
	}
}

func TestContinueInitialPlacementRejectsInvalidInputWithoutReturningPartialTransitions(t *testing.T) {
	tests := []struct {
		name    string
		prepare func(PlacementState) (PlacementState, InitialPlacementCommand, int)
		wantErr error
	}{
		{
			name: "active seat is AI controlled",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				for index := range state.Seats {
					state.Seats[index].ControllerType = ControllerAI
				}
				return state, testPlacementCommand(state.ActiveSeatNumber, 1), 3
			},
			wantErr: ErrPlacementCommandRequiresHuman,
		},
		{
			name: "wrong active seat in command",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				command := testPlacementCommand(state.SeatOrder[1], 1)
				return state, command, 3
			},
			wantErr: ErrWrongActiveSeat,
		},
		{
			name: "illegal settlement and road pair",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				command := testPlacementCommand(state.ActiveSeatNumber, 1)
				command.Payload.SettlementVertexID = "vertex:missing"
				return state, command, 3
			},
			wantErr: ErrUnknownSettlementVertex,
		},
		{
			name: "wrong phase",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				state.Phase = PhaseTurnReady
				return state, testPlacementCommand(state.ActiveSeatNumber, 1), 3
			},
			wantErr: ErrInvalidPlacementPhase,
		},
		{
			name: "invalid event sequence",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				return state, testPlacementCommand(state.ActiveSeatNumber, 1), 0
			},
			wantErr: ErrInvalidEventSequence,
		},
		{
			name: "event sequence overflows before AI continuation",
			prepare: func(state PlacementState) (PlacementState, InitialPlacementCommand, int) {
				maxInt := int(^uint(0) >> 1)
				return state, testPlacementCommand(state.ActiveSeatNumber, 1), maxInt - 1
			},
			wantErr: ErrInvalidEventSequence,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			state, command, nextEventSequence := test.prepare(newPlacementTestState(t, 3))
			result, err := ContinueInitialPlacement(state, command, nextEventSequence)
			if !errors.Is(err, test.wantErr) {
				t.Fatalf("ContinueInitialPlacement() error = %v, want %v", err, test.wantErr)
			}
			if !reflect.DeepEqual(result, InitialPlacementContinuationResult{}) {
				t.Errorf("failed continuation returned partial result: %+v", result)
			}
		})
	}
}

func initialPlacementStateWithOneActiveHuman(t *testing.T, seatCount int) PlacementState {
	t.Helper()
	state := newPlacementTestState(t, seatCount)
	for index := range state.Seats {
		state.Seats[index].ControllerType = ControllerAI
	}
	setSeatController(state.Seats, state.ActiveSeatNumber, ControllerHuman)
	return state
}

func clonePlacementStateForMutationCheck(t *testing.T, state PlacementState) PlacementState {
	t.Helper()
	encoded, err := json.Marshal(state)
	if err != nil {
		t.Fatalf("marshal placement state for mutation check: %v", err)
	}

	var clone PlacementState
	if err := json.Unmarshal(encoded, &clone); err != nil {
		t.Fatalf("unmarshal placement state for mutation check: %v", err)
	}

	return clone
}

func setSeatController(seats []Seat, seatNumber int, controller ControllerType) {
	for index := range seats {
		if seats[index].SeatNumber == seatNumber {
			seats[index].ControllerType = controller
			return
		}
	}
}

func mustPlacementOptions(t *testing.T, state PlacementState) []InitialPlacementOption {
	t.Helper()
	options, err := LegalInitialPlacementOptions(state)
	if err != nil {
		t.Fatalf("LegalInitialPlacementOptions() error = %v", err)
	}
	return options
}

func assertContinuationEventSequence(t *testing.T, transitions []InitialPlacementResult, firstSequence int) {
	t.Helper()
	sequence := firstSequence
	for transitionIndex, transition := range transitions {
		for eventIndex, event := range transition.Events {
			if event.Sequence != sequence {
				t.Errorf("transition %d event %d sequence = %d, want %d", transitionIndex, eventIndex, event.Sequence, sequence)
			}
			sequence++
		}
	}
}
