package execution

import (
	"fmt"
	"sort"

	"catan.local/game-engine/internal/board"
)

// Bootstrap creates the deterministic initial state and initialization events
// for a valid game configuration.
func Bootstrap(config BootstrapConfig) (BootstrapResult, error) {
	seats, err := normalizeSeats(config.Seats)
	if err != nil {
		return BootstrapResult{}, err
	}

	generatedBoard, err := board.Generate(board.Config{
		Seed:       config.Seed,
		RulesetKey: config.RulesetKey,
		MapKey:     config.MapKey,
	})
	if err != nil {
		return BootstrapResult{}, err
	}

	return BootstrapResult{
		ExecutionSchemaVersion: ExecutionSchemaVersion,
		StateSchemaVersion:     StateSchemaVersion,
		Seed:                   generatedBoard.Seed,
		RulesetKey:             generatedBoard.RulesetKey,
		MapKey:                 generatedBoard.MapKey,
		State: BootstrapState{
			Phase: PhaseInitialized,
			Board: generatedBoard,
			Seats: seats,
		},
		Events: []Event{
			{
				Sequence:   1,
				EventType:  GameInitializedEventType,
				Payload:    InitializationPayload{Seed: generatedBoard.Seed, SeatCount: len(seats)},
				Visibility: VisibilityPublic,
			},
		},
	}, nil
}

func normalizeSeats(seats []Seat) ([]Seat, error) {
	if len(seats) != 3 && len(seats) != 4 {
		return nil, fmt.Errorf("%w: expected three or four seats, got %d", ErrInvalidSeats, len(seats))
	}

	normalized := append([]Seat(nil), seats...)
	seenNumbers := make(map[int]struct{}, len(normalized))
	for _, seat := range normalized {
		if seat.SeatNumber < 1 || seat.SeatNumber > len(normalized) {
			return nil, fmt.Errorf("%w: seat number %d must be between 1 and %d", ErrInvalidSeats, seat.SeatNumber, len(normalized))
		}
		if _, exists := seenNumbers[seat.SeatNumber]; exists {
			return nil, fmt.Errorf("%w: seat number %d is duplicated", ErrInvalidSeats, seat.SeatNumber)
		}
		if seat.ControllerType != ControllerHuman && seat.ControllerType != ControllerAI {
			return nil, fmt.Errorf("%w: seat number %d has unsupported controller type %q", ErrInvalidSeats, seat.SeatNumber, seat.ControllerType)
		}
		seenNumbers[seat.SeatNumber] = struct{}{}
	}

	sort.Slice(normalized, func(first, second int) bool {
		return normalized[first].SeatNumber < normalized[second].SeatNumber
	})
	return normalized, nil
}
