package execution

import (
	"fmt"
	"reflect"
	"testing"
)

func TestRunInitialPlacementCompletesThreeAndFourSeatAIOnlyGames(t *testing.T) {
	for _, seatCount := range []int{3, 4} {
		t.Run(fmt.Sprintf("%d seats", seatCount), func(t *testing.T) {
			config := aiOnlyBootstrapConfig(seatCount)
			before := config

			first, err := RunInitialPlacement(config)
			if err != nil {
				t.Fatalf("RunInitialPlacement() error = %v", err)
			}
			repeated, err := RunInitialPlacement(config)
			if err != nil {
				t.Fatalf("repeated RunInitialPlacement() error = %v", err)
			}
			if !reflect.DeepEqual(repeated, first) {
				t.Fatal("identical configurations produced different setup runs")
			}
			if !reflect.DeepEqual(config, before) {
				t.Fatal("RunInitialPlacement() mutated its configuration")
			}
			if first.SetupRunSchemaVersion != InitialPlacementRunSchemaVersion {
				t.Errorf("setup run schema version = %q, want %q", first.SetupRunSchemaVersion, InitialPlacementRunSchemaVersion)
			}
			if first.StopReason != InitialPlacementRunStopReasonTurnReady {
				t.Fatalf("stop reason = %q, want %q", first.StopReason, InitialPlacementRunStopReasonTurnReady)
			}
			if got, want := len(first.Transitions), 2+seatCount*2; got != want {
				t.Fatalf("transition count = %d, want %d", got, want)
			}

			bootstrap, ok := first.Transitions[0].(BootstrapRunTransition)
			if !ok {
				t.Fatalf("first transition type = %T, want BootstrapRunTransition", first.Transitions[0])
			}
			if bootstrap.CommandType != BootstrapRunCommandType {
				t.Errorf("bootstrap command type = %q, want %q", bootstrap.CommandType, BootstrapRunCommandType)
			}
			if bootstrap.StateSchemaVersion != StateSchemaVersion || bootstrap.State.Phase != PhaseInitialized {
				t.Errorf("bootstrap transition has schema %q and phase %q", bootstrap.StateSchemaVersion, bootstrap.State.Phase)
			}
			if bootstrap.Payload.Seed != config.Seed || bootstrap.Payload.RulesetKey != config.RulesetKey || bootstrap.Payload.MapKey != config.MapKey {
				t.Errorf("bootstrap command payload = %+v, want the run configuration", bootstrap.Payload)
			}

			setupStart, ok := first.Transitions[1].(BeginInitialPlacementRunTransition)
			if !ok {
				t.Fatalf("second transition type = %T, want BeginInitialPlacementRunTransition", first.Transitions[1])
			}
			if setupStart.CommandType != BeginInitialPlacementRunCommandType {
				t.Errorf("setup-start command type = %q, want %q", setupStart.CommandType, BeginInitialPlacementRunCommandType)
			}
			if setupStart.StateSchemaVersion != PlacementStateSchemaVersion || setupStart.State.Phase != PhaseInitialPlacement {
				t.Errorf("setup-start transition has schema %q and phase %q", setupStart.StateSchemaVersion, setupStart.State.Phase)
			}
			if len(setupStart.Events) != 1 || setupStart.Events[0].Sequence != 2 || setupStart.Events[0].EventType != InitialPlacementStartedEventType {
				t.Errorf("setup-start events = %+v, want initial placement event at sequence 2", setupStart.Events)
			}

			state := setupStart.State
			for index, transition := range first.Transitions[2:] {
				placement, ok := transition.(AIPlacementRunTransition)
				if !ok {
					t.Fatalf("placement transition %d type = %T, want AIPlacementRunTransition", index+1, transition)
				}
				if placement.CommandType != InitialPlacementCommandType {
					t.Errorf("placement command type = %q, want %q", placement.CommandType, InitialPlacementCommandType)
				}
				if placement.Decision.PolicyVersion != RandomPlacementPolicyVersion || placement.Decision.OptionID == "" {
					t.Errorf("placement decision = %+v, want a versioned policy decision", placement.Decision)
				}
				if placement.ActingSeatNumber != state.ActiveSeatNumber {
					t.Errorf("placement %d acting seat = %d, want active seat %d", index+1, placement.ActingSeatNumber, state.ActiveSeatNumber)
				}
				if placement.StateSchemaVersion != PlacementStateSchemaVersion {
					t.Errorf("placement %d state schema version = %q, want %q", index+1, placement.StateSchemaVersion, PlacementStateSchemaVersion)
				}

				options, err := LegalInitialPlacementOptions(state)
				if err != nil {
					t.Fatalf("LegalInitialPlacementOptions() before placement %d error = %v", index+1, err)
				}
				if !containsPlacementOption(options, placement.Decision.OptionID, placement.Payload) {
					t.Errorf("placement %d command %+v does not match a legal option", index+1, placement.Payload)
				}
				state = placement.State
			}

			if state.Phase != PhaseTurnReady || state.ActiveSeatNumber != 0 || state.Step != "" {
				t.Errorf("final setup state = phase %q, active seat %d, step %q; want turn_ready handoff", state.Phase, state.ActiveSeatNumber, state.Step)
			}
			for _, player := range state.Players {
				if len(player.Settlements) != 2 || len(player.Roads) != 2 {
					t.Errorf("seat %d has %d settlements and %d roads, want two of each", player.SeatNumber, len(player.Settlements), len(player.Roads))
				}
				if player.Resources == (ResourceCounts{}) {
					t.Errorf("seat %d received no second-settlement resources", player.SeatNumber)
				}
			}

			assertInitialPlacementRunEventSequence(t, first.Transitions)
		})
	}
}

func TestRunInitialPlacementStopsBeforeTheFirstHumanPlacement(t *testing.T) {
	config := standardBootstrapConfig
	config.Seed = "1"
	config.Seats = []Seat{
		{SeatNumber: 1, ControllerType: ControllerAI},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerAI},
	}
	bootstrap, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}
	started, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	humanSeat := started.State.SeatOrder[1]
	for index := range config.Seats {
		if config.Seats[index].SeatNumber == humanSeat {
			config.Seats[index].ControllerType = ControllerHuman
		}
	}

	result, err := RunInitialPlacement(config)
	if err != nil {
		t.Fatalf("RunInitialPlacement() error = %v", err)
	}
	if result.StopReason != InitialPlacementRunStopReasonHumanInputRequired {
		t.Fatalf("stop reason = %q, want %q", result.StopReason, InitialPlacementRunStopReasonHumanInputRequired)
	}
	if len(result.Transitions) != 3 {
		t.Fatalf("transition count = %d, want bootstrap, setup start, and one AI placement", len(result.Transitions))
	}
	placement, ok := result.Transitions[2].(AIPlacementRunTransition)
	if !ok {
		t.Fatalf("last transition type = %T, want AIPlacementRunTransition", result.Transitions[2])
	}
	if placement.ActingSeatNumber != started.State.SeatOrder[0] {
		t.Errorf("AI placement seat = %d, want first ordered seat %d", placement.ActingSeatNumber, started.State.SeatOrder[0])
	}
	if placement.State.ActiveSeatNumber != humanSeat {
		t.Errorf("state after AI placement has active seat %d, want human seat %d", placement.State.ActiveSeatNumber, humanSeat)
	}
	if placement.State.Phase != PhaseInitialPlacement {
		t.Errorf("state after AI placement phase = %q, want %q", placement.State.Phase, PhaseInitialPlacement)
	}
	assertInitialPlacementRunEventSequence(t, result.Transitions)
}

func TestRunInitialPlacementStopsImmediatelyWhenTheFirstSeatIsHuman(t *testing.T) {
	config := standardBootstrapConfig
	config.Seed = "1"
	config.Seats = []Seat{
		{SeatNumber: 1, ControllerType: ControllerAI},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerAI},
	}
	bootstrap, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}
	started, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	firstSeat := started.State.SeatOrder[0]
	for index := range config.Seats {
		if config.Seats[index].SeatNumber == firstSeat {
			config.Seats[index].ControllerType = ControllerHuman
		}
	}

	result, err := RunInitialPlacement(config)
	if err != nil {
		t.Fatalf("RunInitialPlacement() error = %v", err)
	}
	if result.StopReason != InitialPlacementRunStopReasonHumanInputRequired {
		t.Fatalf("stop reason = %q, want %q", result.StopReason, InitialPlacementRunStopReasonHumanInputRequired)
	}
	if len(result.Transitions) != 2 {
		t.Fatalf("transition count = %d, want only bootstrap and setup start", len(result.Transitions))
	}
	setupStart := result.Transitions[1].(BeginInitialPlacementRunTransition)
	if setupStart.State.ActiveSeatNumber != firstSeat {
		t.Errorf("active seat = %d, want first human seat %d", setupStart.State.ActiveSeatNumber, firstSeat)
	}
}

func aiOnlyBootstrapConfig(seatCount int) BootstrapConfig {
	config := standardBootstrapConfig
	config.Seats = make([]Seat, seatCount)
	for index := range config.Seats {
		config.Seats[index] = Seat{SeatNumber: index + 1, ControllerType: ControllerAI}
	}
	return config
}

func containsPlacementOption(options []InitialPlacementOption, optionID string, payload InitialPlacementCommandPayload) bool {
	for _, option := range options {
		if option.ID == optionID && option.SettlementVertexID == payload.SettlementVertexID && option.RoadEdgeID == payload.RoadEdgeID {
			return true
		}
	}
	return false
}

func assertInitialPlacementRunEventSequence(t *testing.T, transitions []InitialPlacementRunTransition) {
	t.Helper()

	wantSequence := 1
	for transitionIndex, transition := range transitions {
		switch typed := transition.(type) {
		case BootstrapRunTransition:
			for eventIndex, event := range typed.Events {
				if event.Sequence != wantSequence {
					t.Errorf("transition %d event %d sequence = %d, want %d", transitionIndex, eventIndex, event.Sequence, wantSequence)
				}
				wantSequence++
			}
		case BeginInitialPlacementRunTransition:
			for eventIndex, event := range typed.Events {
				if event.Sequence != wantSequence {
					t.Errorf("transition %d event %d sequence = %d, want %d", transitionIndex, eventIndex, event.Sequence, wantSequence)
				}
				wantSequence++
			}
		case AIPlacementRunTransition:
			for eventIndex, event := range typed.Events {
				if event.Sequence != wantSequence {
					t.Errorf("transition %d event %d sequence = %d, want %d", transitionIndex, eventIndex, event.Sequence, wantSequence)
				}
				wantSequence++
			}
		default:
			t.Errorf("transition %d has unsupported type %T", transitionIndex, transition)
		}
	}
}
