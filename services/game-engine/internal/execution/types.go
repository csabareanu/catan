package execution

import (
	"errors"

	"catan.local/game-engine/internal/board"
)

const (
	ExecutionSchemaVersion   = "1"
	StateSchemaVersion       = "state-v1"
	PhaseInitialized         = "initialized"
	GameInitializedEventType = "game_initialized.v1"
)

var (
	// ErrInvalidSeats means the bootstrap configuration does not describe a
	// valid three- or four-seat game.
	ErrInvalidSeats = errors.New("invalid seats")
)

// ControllerType identifies who will make decisions for a seat.
type ControllerType string

const (
	ControllerHuman ControllerType = "human"
	ControllerAI    ControllerType = "ai"
)

// Seat is the engine-owned identity and controller configuration for one seat.
type Seat struct {
	SeatNumber     int
	ControllerType ControllerType
}

// BootstrapConfig contains the canonical inputs for initializing a game run.
type BootstrapConfig struct {
	Seed       string
	RulesetKey string
	MapKey     string
	Seats      []Seat
}

// BootstrapState is the canonical state immediately after game initialization.
type BootstrapState struct {
	Phase string
	Board board.Board
	Seats []Seat
}

// Visibility controls which players may receive an event projection.
type Visibility string

const (
	VisibilityPublic Visibility = "public"
)

// Event is an ordered domain event emitted while creating the bootstrap state.
type Event struct {
	Sequence            int
	EventType           string
	Payload             InitializationPayload
	Visibility          Visibility
	VisibleToSeatNumber *int
}

// InitializationPayload is the payload of the first game_initialized event.
type InitializationPayload struct {
	Seed      string
	SeatCount int
}

// BootstrapResult contains the deterministic state and events for one run.
type BootstrapResult struct {
	ExecutionSchemaVersion string
	StateSchemaVersion     string
	Seed                   string
	RulesetKey             string
	MapKey                 string
	State                  BootstrapState
	Events                 []Event
}
