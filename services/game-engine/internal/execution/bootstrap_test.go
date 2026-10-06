package execution

import (
	"errors"
	"reflect"
	"testing"

	"catan.local/game-engine/internal/board"
)

var standardBootstrapConfig = BootstrapConfig{
	Seed:       "894177203164",
	RulesetKey: "base",
	MapKey:     "standard",
	Seats: []Seat{
		{SeatNumber: 1, ControllerType: ControllerHuman},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerAI},
	},
}

func TestBootstrapIsDeterministicForThreeSeats(t *testing.T) {
	first, err := Bootstrap(standardBootstrapConfig)
	if err != nil {
		t.Fatalf("first Bootstrap() error = %v", err)
	}

	for attempt := 0; attempt < 5; attempt++ {
		next, err := Bootstrap(standardBootstrapConfig)
		if err != nil {
			t.Fatalf("Bootstrap() on attempt %d error = %v", attempt+1, err)
		}
		if !reflect.DeepEqual(next, first) {
			t.Fatalf("Bootstrap() changed output on attempt %d", attempt+1)
		}
	}

	if first.ExecutionSchemaVersion != ExecutionSchemaVersion {
		t.Errorf("execution schema version = %q, want %q", first.ExecutionSchemaVersion, ExecutionSchemaVersion)
	}
	if first.StateSchemaVersion != StateSchemaVersion {
		t.Errorf("state schema version = %q, want %q", first.StateSchemaVersion, StateSchemaVersion)
	}
	if first.State.Phase != PhaseInitialized {
		t.Errorf("state phase = %q, want %q", first.State.Phase, PhaseInitialized)
	}
	if len(first.State.Board.Hexes) != 19 {
		t.Errorf("state board hex count = %d, want 19", len(first.State.Board.Hexes))
	}
	if len(first.Events) != 1 {
		t.Fatalf("event count = %d, want 1", len(first.Events))
	}
	if event := first.Events[0]; event.Sequence != 1 || event.EventType != GameInitializedEventType || event.Visibility != VisibilityPublic || event.VisibleToSeatNumber != nil {
		t.Errorf("initial event = %+v, want sequence 1 public game_initialized event", event)
	}
	if payload := first.Events[0].Payload; payload.Seed != standardBootstrapConfig.Seed || payload.SeatCount != 3 {
		t.Errorf("initial event payload = %+v, want seed %q and seat count 3", payload, standardBootstrapConfig.Seed)
	}
}

func TestBootstrapSupportsFourSeatAndAIOnlyGames(t *testing.T) {
	config := standardBootstrapConfig
	config.Seats = []Seat{
		{SeatNumber: 4, ControllerType: ControllerAI},
		{SeatNumber: 2, ControllerType: ControllerAI},
		{SeatNumber: 1, ControllerType: ControllerAI},
		{SeatNumber: 3, ControllerType: ControllerAI},
	}

	result, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("Bootstrap() error = %v", err)
	}
	repeated, err := Bootstrap(config)
	if err != nil {
		t.Fatalf("repeated Bootstrap() error = %v", err)
	}
	if !reflect.DeepEqual(repeated, result) {
		t.Fatal("Bootstrap() changed output for a repeated four-seat configuration")
	}

	if got, want := len(result.State.Seats), 4; got != want {
		t.Fatalf("seat count = %d, want %d", got, want)
	}
	for index, seat := range result.State.Seats {
		if seat.SeatNumber != index+1 {
			t.Errorf("seat at index %d has number %d, want %d", index, seat.SeatNumber, index+1)
		}
		if seat.ControllerType != ControllerAI {
			t.Errorf("seat %d controller = %q, want ai", seat.SeatNumber, seat.ControllerType)
		}
	}
}

func TestBootstrapRejectsInvalidSeats(t *testing.T) {
	tests := []struct {
		name  string
		seats []Seat
	}{
		{
			name: "too few seats",
			seats: []Seat{
				{SeatNumber: 1, ControllerType: ControllerAI},
				{SeatNumber: 2, ControllerType: ControllerAI},
			},
		},
		{
			name: "duplicate seat number",
			seats: []Seat{
				{SeatNumber: 1, ControllerType: ControllerAI},
				{SeatNumber: 1, ControllerType: ControllerAI},
				{SeatNumber: 3, ControllerType: ControllerAI},
			},
		},
		{
			name: "out of range seat number",
			seats: []Seat{
				{SeatNumber: 1, ControllerType: ControllerAI},
				{SeatNumber: 2, ControllerType: ControllerAI},
				{SeatNumber: 4, ControllerType: ControllerAI},
			},
		},
		{
			name: "unsupported controller",
			seats: []Seat{
				{SeatNumber: 1, ControllerType: ControllerType("bot")},
				{SeatNumber: 2, ControllerType: ControllerAI},
				{SeatNumber: 3, ControllerType: ControllerAI},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			config := standardBootstrapConfig
			config.Seats = test.seats

			if _, err := Bootstrap(config); !errors.Is(err, ErrInvalidSeats) {
				t.Fatalf("Bootstrap() error = %v, want ErrInvalidSeats", err)
			}
		})
	}
}

func TestBootstrapPropagatesBoardConfigurationErrors(t *testing.T) {
	tests := []struct {
		name   string
		config BootstrapConfig
		want   error
	}{
		{
			name: "invalid seed",
			config: BootstrapConfig{
				Seed:       "01",
				RulesetKey: standardBootstrapConfig.RulesetKey,
				MapKey:     standardBootstrapConfig.MapKey,
				Seats:      standardBootstrapConfig.Seats,
			},
			want: board.ErrInvalidSeed,
		},
		{
			name: "unsupported ruleset",
			config: BootstrapConfig{
				Seed:       standardBootstrapConfig.Seed,
				RulesetKey: "seafarers",
				MapKey:     standardBootstrapConfig.MapKey,
				Seats:      standardBootstrapConfig.Seats,
			},
			want: board.ErrUnsupportedRuleset,
		},
		{
			name: "unsupported map",
			config: BootstrapConfig{
				Seed:       standardBootstrapConfig.Seed,
				RulesetKey: standardBootstrapConfig.RulesetKey,
				MapKey:     "archipelago",
				Seats:      standardBootstrapConfig.Seats,
			},
			want: board.ErrUnsupportedMap,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Bootstrap(test.config); !errors.Is(err, test.want) {
				t.Fatalf("Bootstrap() error = %v, want %v", err, test.want)
			}
		})
	}
}
