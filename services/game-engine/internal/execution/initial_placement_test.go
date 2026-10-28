package execution

import (
	"errors"
	"reflect"
	"testing"

	"catan.local/game-engine/internal/board"
)

func TestBeginInitialPlacementEstablishesDeterministicThreeSeatOrder(t *testing.T) {
	bootstrap, err := Bootstrap(standardBootstrapConfig)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}

	first, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	repeated, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("repeated BeginInitialPlacement() error = %v", err)
	}
	if !reflect.DeepEqual(repeated, first) {
		t.Fatal("BeginInitialPlacement() changed output for the same state and event sequence")
	}

	assertInitialPlacementState(t, first, []int{1, 2, 3}, 2)
	started, ok := first.Events[0].Payload.(InitialPlacementStartedPayload)
	if !ok {
		t.Fatalf("event payload type = %T, want InitialPlacementStartedPayload", first.Events[0].Payload)
	}
	if !reflect.DeepEqual(started.SeatOrder, first.State.SeatOrder) {
		t.Errorf("event seat order = %v, state seat order = %v", started.SeatOrder, first.State.SeatOrder)
	}
}

func TestBeginInitialPlacementEstablishesDeterministicFourSeatOrder(t *testing.T) {
	config := standardBootstrapConfig
	config.Seats = []Seat{
		{SeatNumber: 4, ControllerType: ControllerAI},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 1, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerHuman},
	}
	bootstrap, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}

	result, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("BeginInitialPlacement() error = %v", err)
	}
	repeated, err := BeginInitialPlacement(bootstrap.State, 2)
	if err != nil {
		t.Fatalf("repeated BeginInitialPlacement() error = %v", err)
	}
	if !reflect.DeepEqual(repeated, result) {
		t.Fatal("BeginInitialPlacement() changed four-seat output for the same state and event sequence")
	}

	assertInitialPlacementState(t, result, []int{1, 2, 3, 4}, 2)
}

func TestInitialResourcesGrantedEventIsPublic(t *testing.T) {
	receivingSeat := 2
	event := PlacementEvent{
		Sequence:  4,
		EventType: InitialResourcesGrantedEventType,
		Payload: InitialResourcesGrantedPayload{
			SeatNumber: receivingSeat,
			Resources: ResourceCounts{
				Lumber: 1,
				Grain:  2,
			},
		},
		Visibility: VisibilityPublic,
	}

	payload, ok := event.Payload.(InitialResourcesGrantedPayload)
	if !ok {
		t.Fatalf("event payload type = %T, want InitialResourcesGrantedPayload", event.Payload)
	}
	if payload.SeatNumber != receivingSeat || payload.Resources.Lumber != 1 || payload.Resources.Grain != 2 {
		t.Errorf("public payload = %+v, want seat %d with lumber 1 and grain 2", payload, receivingSeat)
	}
	if event.Visibility != VisibilityPublic || event.VisibleToSeatNumber != nil {
		t.Errorf("event visibility = %+v, want public visibility without a seat restriction", event)
	}
}

func TestBeginInitialPlacementRejectsInvalidStateAndSequence(t *testing.T) {
	bootstrap, err := Bootstrap(standardBootstrapConfig)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}

	invalidPhase := bootstrap.State
	invalidPhase.Phase = PhaseInitialPlacement
	if _, err := BeginInitialPlacement(invalidPhase, 2); !errors.Is(err, ErrInvalidPlacementState) {
		t.Fatalf("invalid phase error = %v, want ErrInvalidPlacementState", err)
	}
	if _, err := BeginInitialPlacement(bootstrap.State, 0); !errors.Is(err, ErrInvalidEventSequence) {
		t.Fatalf("invalid sequence error = %v, want ErrInvalidEventSequence", err)
	}

	invalidSeed := bootstrap.State
	invalidSeed.Board.Seed = "01"
	if _, err := BeginInitialPlacement(invalidSeed, 2); !errors.Is(err, board.ErrInvalidSeed) {
		t.Fatalf("invalid seed error = %v, want board.ErrInvalidSeed", err)
	}
}

func assertInitialPlacementState(t *testing.T, result InitialPlacementResult, expectedSeats []int, eventSequence int) {
	t.Helper()

	if result.ExecutionSchemaVersion != ExecutionSchemaVersion {
		t.Errorf("execution schema version = %q, want %q", result.ExecutionSchemaVersion, ExecutionSchemaVersion)
	}
	if result.StateSchemaVersion != PlacementStateSchemaVersion {
		t.Errorf("state schema version = %q, want %q", result.StateSchemaVersion, PlacementStateSchemaVersion)
	}
	if result.State.Phase != PhaseInitialPlacement {
		t.Errorf("phase = %q, want %q", result.State.Phase, PhaseInitialPlacement)
	}
	if result.State.Round != 1 || result.State.Step != InitialPlacementStep {
		t.Errorf("setup position = round %d, step %q", result.State.Round, result.State.Step)
	}
	if len(result.State.SeatOrder) != len(expectedSeats) || result.State.ActiveSeatNumber != result.State.SeatOrder[0] {
		t.Errorf("seat order = %v, active seat = %d", result.State.SeatOrder, result.State.ActiveSeatNumber)
	}
	seen := make(map[int]bool, len(result.State.SeatOrder))
	for _, seatNumber := range result.State.SeatOrder {
		seen[seatNumber] = true
	}
	for _, seatNumber := range expectedSeats {
		if !seen[seatNumber] {
			t.Errorf("seat order %v does not contain seat %d", result.State.SeatOrder, seatNumber)
		}
	}
	if len(result.State.Players) != len(expectedSeats) {
		t.Errorf("player count = %d, want %d", len(result.State.Players), len(expectedSeats))
	}
	for _, player := range result.State.Players {
		if player.Resources != (ResourceCounts{}) || len(player.Settlements) != 0 || len(player.Roads) != 0 {
			t.Errorf("new player state = %+v, want empty setup state", player)
		}
	}
	if len(result.Events) != 1 {
		t.Fatalf("event count = %d, want 1", len(result.Events))
	}
	event := result.Events[0]
	if event.Sequence != eventSequence || event.EventType != InitialPlacementStartedEventType || event.Visibility != VisibilityPublic || event.VisibleToSeatNumber != nil {
		t.Errorf("start event = %+v, want public event sequence %d", event, eventSequence)
	}
}
