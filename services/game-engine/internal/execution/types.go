package execution

import (
	"errors"

	"catan.local/game-engine/internal/board"
)

const (
	ExecutionSchemaVersion              = "1"
	StateSchemaVersion                  = "state-v1"
	PlacementStateSchemaVersion         = "state-v2"
	PhaseInitialized                    = "initialized"
	PhaseInitialPlacement               = "initial_placement"
	PhaseTurnReady                      = "turn_ready"
	InitialPlacementStep                = "place_initial_settlement_and_road"
	GameInitializedEventType            = "game_initialized.v1"
	InitialPlacementStartedEventType    = "initial_placement_started.v1"
	InitialSettlementPlacedEventType    = "initial_settlement_placed.v1"
	InitialRoadPlacedEventType          = "initial_road_placed.v1"
	InitialResourcesGrantedEventType    = "initial_resources_granted.v1"
	InitialPlacementCompletedEventType  = "initial_placement_completed.v1"
	InitialPlacementRunSchemaVersion    = "1"
	BootstrapRunCommandType             = "bootstrap.v1"
	BeginInitialPlacementRunCommandType = "begin_initial_placement.v1"
)

// InitialPlacementRunStopReason explains why an automated setup run stopped.
type InitialPlacementRunStopReason string

const (
	InitialPlacementRunStopReasonHumanInputRequired InitialPlacementRunStopReason = "human_input_required"
	InitialPlacementRunStopReasonTurnReady          InitialPlacementRunStopReason = "turn_ready"
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
	VisibilityPublic      Visibility = "public"
	VisibilitySeatPrivate Visibility = "seat_private"
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

// PlayerState contains the canonical state belonging to one seat. Resources
// are filtered by the caller before this state is exposed to another seat.
type PlayerState struct {
	SeatNumber  int
	Resources   ResourceCounts
	Settlements []string
	Roads       []string
}

// ResourceCounts is the fixed base-game resource inventory for one seat.
type ResourceCounts struct {
	Lumber int
	Wool   int
	Grain  int
	Brick  int
	Ore    int
}

// PlacementState is the canonical state while the initial placement phase is
// active or has just completed.
type PlacementState struct {
	Phase            string
	SeatOrder        []int
	Round            int
	ActiveSeatNumber int
	Step             string
	Board            board.Board
	Seats            []Seat
	Players          []PlayerState
}

// PlacementEvent is an ordered event emitted by the initial placement
// transition. It is separate from the existing bootstrap Event so the stable
// bootstrap event adapter does not need to change in this slice.
type PlacementEvent struct {
	Sequence            int
	EventType           string
	Payload             PlacementEventPayload
	Visibility          Visibility
	VisibleToSeatNumber *int
}

// PlacementEventPayload is the versioned payload union for setup events.
type PlacementEventPayload interface {
	placementEventPayload()
}

// InitialPlacementStartedPayload announces the established setup order.
type InitialPlacementStartedPayload struct {
	SeatOrder        []int
	Round            int
	ActiveSeatNumber int
}

func (InitialPlacementStartedPayload) placementEventPayload() {}

// InitialSettlementPlacedPayload identifies a newly placed settlement.
type InitialSettlementPlacedPayload struct {
	SeatNumber         int
	SettlementVertexID string
}

func (InitialSettlementPlacedPayload) placementEventPayload() {}

// InitialRoadPlacedPayload identifies the road paired with a settlement.
type InitialRoadPlacedPayload struct {
	SeatNumber         int
	SettlementVertexID string
	RoadEdgeID         string
}

func (InitialRoadPlacedPayload) placementEventPayload() {}

// InitialResourcesGrantedPayload contains the publicly derivable
// second-settlement grant for its receiving seat. The current resource
// inventory remains private in state projections.
type InitialResourcesGrantedPayload struct {
	SeatNumber int
	Resources  ResourceCounts
}

func (InitialResourcesGrantedPayload) placementEventPayload() {}

// InitialPlacementCompletedPayload identifies the handoff to normal turns.
type InitialPlacementCompletedPayload struct {
	SeatOrder []int
	NextPhase string
}

func (InitialPlacementCompletedPayload) placementEventPayload() {}

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

// BootstrapRunCommandPayload records the canonical configuration accepted by
// the bootstrap transition.
type BootstrapRunCommandPayload struct {
	Seed       string
	RulesetKey string
	MapKey     string
	Seats      []Seat
}

// EmptyRunCommandPayload represents the system command that begins setup.
type EmptyRunCommandPayload struct{}

// InitialPlacementRunTransition is a closed union of the transitions returned
// by a deterministic initial-placement run.
type InitialPlacementRunTransition interface {
	initialPlacementRunTransition()
}

// BootstrapRunTransition contains the initialized state and its event.
type BootstrapRunTransition struct {
	CommandType        string
	Payload            BootstrapRunCommandPayload
	StateSchemaVersion string
	State              BootstrapState
	Events             []Event
}

func (BootstrapRunTransition) initialPlacementRunTransition() {}

// BeginInitialPlacementRunTransition contains the system transition that
// establishes setup order and activates the first seat.
type BeginInitialPlacementRunTransition struct {
	CommandType        string
	Payload            EmptyRunCommandPayload
	StateSchemaVersion string
	State              PlacementState
	Events             []PlacementEvent
}

func (BeginInitialPlacementRunTransition) initialPlacementRunTransition() {}

// AIPlacementRunTransition contains one legal placement selected by policy.
type AIPlacementRunTransition struct {
	CommandType        string
	ActingSeatNumber   int
	Payload            InitialPlacementCommandPayload
	Decision           PlacementDecision
	StateSchemaVersion string
	State              PlacementState
	Events             []PlacementEvent
}

func (AIPlacementRunTransition) initialPlacementRunTransition() {}

// InitialPlacementRunResult contains all ordered transitions through the
// first human decision or completion of setup.
type InitialPlacementRunResult struct {
	SetupRunSchemaVersion string
	Seed                  string
	RulesetKey            string
	MapKey                string
	StopReason            InitialPlacementRunStopReason
	Transitions           []InitialPlacementRunTransition
}
