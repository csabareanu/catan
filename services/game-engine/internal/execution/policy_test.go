package execution

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	"catan.local/game-engine/internal/board"
)

func TestLegalInitialPlacementOptionsAreCompleteAndLegal(t *testing.T) {
	state := newPlacementTestState(t, 3)
	options, err := LegalInitialPlacementOptions(state)
	if err != nil {
		t.Fatalf("LegalInitialPlacementOptions() error = %v", err)
	}
	if len(options) != 12 {
		t.Fatalf("legal option count = %d, want one road choice for each of 12 vertices", len(options))
	}

	seenIDs := make(map[string]struct{}, len(options))
	for _, option := range options {
		if _, duplicate := seenIDs[option.ID]; duplicate {
			t.Errorf("duplicate option ID %q", option.ID)
		}
		seenIDs[option.ID] = struct{}{}
		if want := initialPlacementOptionID(option.SettlementVertexID, option.RoadEdgeID); option.ID != want {
			t.Errorf("option ID = %q, want stable ID %q", option.ID, want)
		}
		_, err := ApplyInitialPlacementCommand(state, InitialPlacementCommand{
			CommandType:      InitialPlacementCommandType,
			ActingSeatNumber: state.ActiveSeatNumber,
			Payload: InitialPlacementCommandPayload{
				SettlementVertexID: option.SettlementVertexID,
				RoadEdgeID:         option.RoadEdgeID,
			},
		}, 3)
		if err != nil {
			t.Errorf("generated option %+v was rejected by the transition: %v", option, err)
		}
	}

	first, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, 1), 3)
	if err != nil {
		t.Fatalf("ApplyInitialPlacementCommand() error = %v", err)
	}
	nextOptions, err := LegalInitialPlacementOptions(first.State)
	if err != nil {
		t.Fatalf("LegalInitialPlacementOptions() after first placement error = %v", err)
	}
	for _, option := range nextOptions {
		if option.SettlementVertexID == placementVertexID(1) || option.SettlementVertexID == fmt.Sprintf("vertex:road-end-%d", 1) {
			t.Errorf("option %+v violates settlement occupancy or distance", option)
		}
	}
}

func TestBuildPlacementObservationIsSeatSafeAndDefensive(t *testing.T) {
	state := newPlacementTestState(t, 3)
	state.ActiveSeatNumber = 2
	state.Players[0].Resources = ResourceCounts{Lumber: 11, Wool: 12, Grain: 13, Brick: 14, Ore: 15}
	state.Players[1].Resources = ResourceCounts{Lumber: 21, Wool: 22, Grain: 23, Brick: 24, Ore: 25}
	state.Players[2].Resources = ResourceCounts{Lumber: 31, Wool: 32, Grain: 33, Brick: 34, Ore: 35}
	state.Board.Hexes[0].VertexIDs = []string{placementVertexID(1)}
	numberToken := 8
	state.Board.Hexes[0].NumberToken = &numberToken
	resourceType := board.Lumber
	state.Board.Ports = []board.Port{{ID: "port:one", ResourceType: &resourceType}}

	observation, err := BuildPlacementObservation(state)
	if err != nil {
		t.Fatalf("BuildPlacementObservation() error = %v", err)
	}
	if observation.OwnPlayer.SeatNumber != 2 || observation.OwnPlayer.Resources != state.Players[1].Resources {
		t.Errorf("own player = %+v, want active seat 2 with its private inventory", observation.OwnPlayer)
	}
	if len(observation.PublicPlayers) != 2 {
		t.Fatalf("public player count = %d, want the two other seats", len(observation.PublicPlayers))
	}
	for _, player := range observation.PublicPlayers {
		if player.SeatNumber == state.ActiveSeatNumber {
			t.Errorf("active seat %d was duplicated in PublicPlayers", state.ActiveSeatNumber)
		}
		if _, hasResources := reflect.TypeOf(player).FieldByName("Resources"); hasResources {
			t.Errorf("public player state exposes a resource field: %+v", player)
		}
	}

	observation.Board.Hexes[0].VertexIDs[0] = "vertex:changed"
	*observation.Board.Hexes[0].NumberToken = 3
	*observation.Board.Ports[0].ResourceType = board.Ore
	if state.Board.Hexes[0].VertexIDs[0] != placementVertexID(1) || *state.Board.Hexes[0].NumberToken != 8 || *state.Board.Ports[0].ResourceType != board.Lumber {
		t.Fatal("mutating policy observation changed canonical board data")
	}
}

func TestRandomPlacementPolicyCompletesDeterministicAISetup(t *testing.T) {
	play := func() (PlacementState, []PlacementDecision) {
		state := newPlacementTestState(t, 3)
		for index := range state.Seats {
			state.Seats[index].ControllerType = ControllerAI
		}
		decisions := make([]PlacementDecision, 0, len(state.Seats)*2)
		nextEventSequence := 3
		for state.Phase == PhaseInitialPlacement {
			result, err := ApplyInitialPlacementWithPolicy(state, RandomPlacementPolicy{}, nextEventSequence)
			if err != nil {
				t.Fatalf("ApplyInitialPlacementWithPolicy() for seat %d: %v", state.ActiveSeatNumber, err)
			}
			if result.Decision == nil {
				t.Fatal("AI transition returned no placement decision metadata")
			}
			if result.Decision.PolicyVersion != RandomPlacementPolicyVersion {
				t.Errorf("policy version = %q, want %q", result.Decision.PolicyVersion, RandomPlacementPolicyVersion)
			}
			decisions = append(decisions, *result.Decision)
			nextEventSequence += len(result.Events)
			state = result.State
		}
		return state, decisions
	}

	firstState, firstDecisions := play()
	repeatedState, repeatedDecisions := play()
	if !reflect.DeepEqual(repeatedState, firstState) || !reflect.DeepEqual(repeatedDecisions, firstDecisions) {
		t.Fatal("same seeded setup produced different AI placements or final state")
	}
	if len(firstDecisions) != 6 {
		t.Fatalf("decision count = %d, want six placements for three seats", len(firstDecisions))
	}
}

func TestApplyInitialPlacementWithPolicyRejectsInvalidPolicyDecision(t *testing.T) {
	state := newPlacementTestState(t, 3)
	state.ActiveSeatNumber = 2
	before := state
	policy := &placementPolicyStub{version: "test-policy.v1", optionID: "not-a-legal-option"}

	result, err := ApplyInitialPlacementWithPolicy(state, policy, 3)
	if !errors.Is(err, ErrInvalidPlacementPolicyDecision) {
		t.Fatalf("ApplyInitialPlacementWithPolicy() error = %v, want ErrInvalidPlacementPolicyDecision", err)
	}
	if !reflect.DeepEqual(state, before) {
		t.Fatal("invalid policy result mutated the canonical state")
	}
	if !reflect.DeepEqual(result.State, PlacementState{}) || len(result.Events) != 0 || result.Decision != nil {
		t.Errorf("invalid policy result returned partial transition: %+v", result)
	}
}

func TestApplyInitialPlacementWithPolicyRequiresAnAISeat(t *testing.T) {
	state := newPlacementTestState(t, 3)
	state.ActiveSeatNumber = 1
	policy := &placementPolicyStub{version: "test-policy.v1", optionID: "unused"}

	if _, err := ApplyInitialPlacementWithPolicy(state, policy, 3); !errors.Is(err, ErrPlacementPolicyRequiresAI) {
		t.Fatalf("ApplyInitialPlacementWithPolicy() error = %v, want ErrPlacementPolicyRequiresAI", err)
	}
	if policy.called {
		t.Fatal("policy was invoked for a human-controlled seat")
	}
}

func TestApplyInitialPlacementCommandLeavesDecisionMetadataEmpty(t *testing.T) {
	state := newPlacementTestState(t, 3)
	state.ActiveSeatNumber = 1
	result, err := ApplyInitialPlacementCommand(state, testPlacementCommand(state.ActiveSeatNumber, 1), 3)
	if err != nil {
		t.Fatalf("ApplyInitialPlacementCommand() error = %v", err)
	}
	if result.Decision != nil {
		t.Errorf("explicit human command has decision metadata %+v, want nil", result.Decision)
	}
}

func TestApplyInitialPlacementWithPolicyRejectsNoLegalOptions(t *testing.T) {
	state := newPlacementTestState(t, 3)
	state.ActiveSeatNumber = 2
	state.Board.Edges = nil
	policy := &placementPolicyStub{version: "test-policy.v1", optionID: "unused"}

	if _, err := ApplyInitialPlacementWithPolicy(state, policy, 3); !errors.Is(err, ErrNoLegalInitialPlacementOptions) {
		t.Fatalf("ApplyInitialPlacementWithPolicy() error = %v, want ErrNoLegalInitialPlacementOptions", err)
	}
	if policy.called {
		t.Fatal("policy was invoked when the engine had no legal options")
	}
}

type placementPolicyStub struct {
	version  string
	optionID string
	called   bool
}

func (policy *placementPolicyStub) Version() string {
	return policy.version
}

func (policy *placementPolicyStub) ChooseInitialPlacement(_ PlacementObservation, _ []InitialPlacementOption) (string, error) {
	policy.called = true
	return policy.optionID, nil
}
