package execution

import "fmt"

// RunInitialPlacement initializes a game, begins setup, and applies the
// deterministic baseline policy until a human seat becomes active or setup is
// complete. Every AI choice is validated by ApplyInitialPlacementCommand.
func RunInitialPlacement(config BootstrapConfig) (InitialPlacementRunResult, error) {
	bootstrap, err := Bootstrap(config)
	if err != nil {
		return InitialPlacementRunResult{}, fmt.Errorf("bootstrap initial placement run: %w", err)
	}

	result := InitialPlacementRunResult{
		SetupRunSchemaVersion: InitialPlacementRunSchemaVersion,
		Seed:                  bootstrap.Seed,
		RulesetKey:            bootstrap.RulesetKey,
		MapKey:                bootstrap.MapKey,
		Transitions:           make([]InitialPlacementRunTransition, 0, 2+len(bootstrap.State.Seats)*2),
	}
	result.Transitions = append(result.Transitions, BootstrapRunTransition{
		CommandType: BootstrapRunCommandType,
		Payload: BootstrapRunCommandPayload{
			Seed:       bootstrap.Seed,
			RulesetKey: bootstrap.RulesetKey,
			MapKey:     bootstrap.MapKey,
			Seats:      append([]Seat(nil), bootstrap.State.Seats...),
		},
		StateSchemaVersion: StateSchemaVersion,
		State:              cloneBootstrapRunState(bootstrap.State),
		Events:             append([]Event(nil), bootstrap.Events...),
	})

	nextEventSequence := len(bootstrap.Events) + 1
	started, err := BeginInitialPlacement(bootstrap.State, nextEventSequence)
	if err != nil {
		return InitialPlacementRunResult{}, fmt.Errorf("begin initial placement: %w", err)
	}
	result.Transitions = append(result.Transitions, BeginInitialPlacementRunTransition{
		CommandType:        BeginInitialPlacementRunCommandType,
		Payload:            EmptyRunCommandPayload{},
		StateSchemaVersion: started.StateSchemaVersion,
		State:              cloneRunPlacementState(started.State),
		Events:             append([]PlacementEvent(nil), started.Events...),
	})
	nextEventSequence += len(started.Events)

	state := started.State
	for state.Phase == PhaseInitialPlacement {
		controller, found := activePlacementController(state)
		if !found {
			return InitialPlacementRunResult{}, fmt.Errorf("active seat %d has no configured controller", state.ActiveSeatNumber)
		}
		if controller == ControllerHuman {
			result.StopReason = InitialPlacementRunStopReasonHumanInputRequired
			return result, nil
		}

		placement, err := ApplyInitialPlacementWithPolicy(state, RandomPlacementPolicy{}, nextEventSequence)
		if err != nil {
			return InitialPlacementRunResult{}, fmt.Errorf("apply AI placement for seat %d: %w", state.ActiveSeatNumber, err)
		}
		if placement.Command == nil || placement.Decision == nil {
			return InitialPlacementRunResult{}, fmt.Errorf("AI placement for seat %d omitted its accepted command or policy decision", state.ActiveSeatNumber)
		}

		result.Transitions = append(result.Transitions, AIPlacementRunTransition{
			CommandType:        placement.Command.CommandType,
			ActingSeatNumber:   placement.Command.ActingSeatNumber,
			Payload:            placement.Command.Payload,
			Decision:           *placement.Decision,
			StateSchemaVersion: placement.StateSchemaVersion,
			State:              cloneRunPlacementState(placement.State),
			Events:             append([]PlacementEvent(nil), placement.Events...),
		})
		nextEventSequence += len(placement.Events)
		state = placement.State
	}

	if state.Phase != PhaseTurnReady {
		return InitialPlacementRunResult{}, fmt.Errorf("initial placement stopped in unexpected phase %q", state.Phase)
	}
	result.StopReason = InitialPlacementRunStopReasonTurnReady
	return result, nil
}

func activePlacementController(state PlacementState) (ControllerType, bool) {
	for _, seat := range state.Seats {
		if seat.SeatNumber == state.ActiveSeatNumber {
			return seat.ControllerType, true
		}
	}
	return "", false
}

func cloneBootstrapRunState(state BootstrapState) BootstrapState {
	clone := state
	clone.Board = clonePolicyBoard(state.Board)
	clone.Seats = append([]Seat(nil), state.Seats...)
	return clone
}

func cloneRunPlacementState(state PlacementState) PlacementState {
	clone := clonePlacementState(state)
	clone.Board = clonePolicyBoard(state.Board)
	return clone
}
