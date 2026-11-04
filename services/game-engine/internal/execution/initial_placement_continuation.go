package execution

import (
	"fmt"
)

// ContinueInitialPlacement applies one explicit human placement, then applies
// the deterministic AI policy until another human seat is active or setup is
// complete. The input state is never mutated.
func ContinueInitialPlacement(
	state PlacementState,
	command InitialPlacementCommand,
	nextEventSequence int,
) (InitialPlacementContinuationResult, error) {
	if state.Phase != PhaseInitialPlacement {
		return InitialPlacementContinuationResult{}, fmt.Errorf("continue initial placement: %w", ErrInvalidPlacementPhase)
	}
	if nextEventSequence < 1 {
		return InitialPlacementContinuationResult{}, ErrInvalidEventSequence
	}
	if _, _, err := validatePlacementProgress(state); err != nil {
		return InitialPlacementContinuationResult{}, err
	}

	controller, found := activePlacementController(state)
	if !found {
		return InitialPlacementContinuationResult{}, fmt.Errorf("active seat %d has no configured controller", state.ActiveSeatNumber)
	}
	if controller != ControllerHuman {
		return InitialPlacementContinuationResult{}, ErrPlacementCommandRequiresHuman
	}

	humanPlacement, err := ApplyInitialPlacementCommand(state, command, nextEventSequence)
	if err != nil {
		return InitialPlacementContinuationResult{}, err
	}
	result := InitialPlacementContinuationResult{
		SetupContinuationSchemaVersion: InitialPlacementContinuationSchemaVersion,
		Transitions:                    []InitialPlacementResult{humanPlacement},
	}

	if humanPlacement.State.Phase == PhaseTurnReady {
		result.StopReason = InitialPlacementRunStopReasonTurnReady
		return result, nil
	}
	if len(humanPlacement.Events) == 0 {
		return InitialPlacementContinuationResult{}, fmt.Errorf("human placement for seat %d emitted no events", command.ActingSeatNumber)
	}

	aiPlacements, stopReason, err := runAIPlacementsUntilBoundary(
		humanPlacement.State,
		humanPlacement.Events[len(humanPlacement.Events)-1].Sequence,
	)
	if err != nil {
		return InitialPlacementContinuationResult{}, fmt.Errorf("continue AI setup after human placement: %w", err)
	}
	result.Transitions = append(result.Transitions, aiPlacements...)
	result.StopReason = stopReason

	return result, nil
}

// runAIPlacementsUntilBoundary returns complete AI transitions through the
// next human-controlled seat or the turn-ready handoff.
func runAIPlacementsUntilBoundary(
	state PlacementState,
	lastEventSequence int,
) ([]InitialPlacementResult, InitialPlacementRunStopReason, error) {
	if state.Phase == PhaseTurnReady {
		return nil, InitialPlacementRunStopReasonTurnReady, nil
	}
	if state.Phase != PhaseInitialPlacement {
		return nil, "", fmt.Errorf("%w: expected %q, got %q", ErrInvalidPlacementPhase, PhaseInitialPlacement, state.Phase)
	}
	if _, _, err := validatePlacementProgress(state); err != nil {
		return nil, "", err
	}

	placements := make([]InitialPlacementResult, 0)
	for state.Phase == PhaseInitialPlacement {
		controller, found := activePlacementController(state)
		if !found {
			return nil, "", fmt.Errorf("active seat %d has no configured controller", state.ActiveSeatNumber)
		}
		if controller == ControllerHuman {
			return placements, InitialPlacementRunStopReasonHumanInputRequired, nil
		}

		nextEventSequence, err := nextPlacementEventSequence(lastEventSequence)
		if err != nil {
			return nil, "", err
		}
		placement, err := ApplyInitialPlacementWithPolicy(state, RandomPlacementPolicy{}, nextEventSequence)
		if err != nil {
			return nil, "", fmt.Errorf("apply AI placement for seat %d: %w", state.ActiveSeatNumber, err)
		}
		if placement.Command == nil || placement.Decision == nil {
			return nil, "", fmt.Errorf("AI placement for seat %d omitted its command or policy decision", state.ActiveSeatNumber)
		}
		if len(placement.Events) == 0 {
			return nil, "", fmt.Errorf("AI placement for seat %d emitted no events", state.ActiveSeatNumber)
		}

		placements = append(placements, placement)
		state = placement.State
		lastEventSequence = placement.Events[len(placement.Events)-1].Sequence
		if state.Phase == PhaseTurnReady {
			return placements, InitialPlacementRunStopReasonTurnReady, nil
		}
	}

	return nil, "", fmt.Errorf("initial placement stopped in unexpected phase %q", state.Phase)
}

func nextPlacementEventSequence(lastEventSequence int) (int, error) {
	maxInt := int(^uint(0) >> 1)
	if lastEventSequence < 0 || lastEventSequence == maxInt {
		return 0, fmt.Errorf("%w: next event sequence overflows", ErrInvalidEventSequence)
	}

	return lastEventSequence + 1, nil
}
