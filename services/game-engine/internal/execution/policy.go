package execution

import (
	"fmt"
	"hash/fnv"

	"catan.local/game-engine/internal/board"
)

// RandomPlacementPolicyVersion identifies the deterministic baseline chooser.
const RandomPlacementPolicyVersion = "random_placement.v1"

const initialPlacementPolicySalt uint64 = 0xe7037ed1a0b428db

// InitialPlacementCommandType identifies the command accepted for one setup
// turn. The payload is intentionally just the two chosen board IDs.
const InitialPlacementCommandType = "place_initial_settlement_and_road.v1"

// InitialPlacementCommandPayload is the explicit placement command payload.
type InitialPlacementCommandPayload struct {
	SettlementVertexID string `json:"settlement_vertex_id"`
	RoadEdgeID         string `json:"road_edge_id"`
}

// InitialPlacementCommand is one accepted, atomic settlement-and-road choice
// made by the active seat.
type InitialPlacementCommand struct {
	CommandType      string
	ActingSeatNumber int
	Payload          InitialPlacementCommandPayload
}

// InitialPlacementOption is one complete legal settlement-and-road choice.
// The policy selects an option ID rather than constructing arbitrary IDs.
type InitialPlacementOption struct {
	ID                 string
	SettlementVertexID string
	RoadEdgeID         string
}

// PublicPlayerState contains only structure ownership that may be shared with
// every observer or policy.
type PublicPlayerState struct {
	SeatNumber  int
	Settlements []string
	Roads       []string
}

// PlacementObservation is the seat-safe view supplied to a placement policy.
// OwnPlayer may contain the acting seat's private resources; PublicPlayers do
// not contain any other seat's resource counts.
type PlacementObservation struct {
	Board            board.Board
	SeatOrder        []int
	Round            int
	ActiveSeatNumber int
	Step             string
	OwnPlayer        PlayerState
	PublicPlayers    []PublicPlayerState
}

// PlacementDecision is the policy output recorded by later orchestration.
type PlacementDecision struct {
	PolicyVersion string
	OptionID      string
}

// PlacementPolicy is the stable seam shared by the baseline and future
// learned placement decision-makers.
type PlacementPolicy interface {
	Version() string
	ChooseInitialPlacement(observation PlacementObservation, options []InitialPlacementOption) (string, error)
}

// RandomPlacementPolicy is a stateless baseline so identical seeded choices
// can be replayed without persisting a random-number generator between turns.
type RandomPlacementPolicy struct{}

func (RandomPlacementPolicy) Version() string {
	return RandomPlacementPolicyVersion
}

func (RandomPlacementPolicy) ChooseInitialPlacement(observation PlacementObservation, options []InitialPlacementOption) (string, error) {
	if len(options) == 0 {
		return "", ErrNoLegalInitialPlacementOptions
	}
	if observation.Step != InitialPlacementStep || (observation.Round != 1 && observation.Round != 2) || observation.ActiveSeatNumber < 1 {
		return "", fmt.Errorf("%w: invalid policy observation", ErrInvalidPlacementState)
	}
	seedValue, err := parsePlacementSeed(observation.Board.Seed)
	if err != nil {
		return "", err
	}

	// The legal option list is a stable signature of the current placement
	// position. Including it in the seed gives each position its own repeatable
	// draw without keeping random state across calls.
	stateHasher := fnv.New64a()
	_, _ = fmt.Fprintf(stateHasher, "%d:%d:%d:%s", seedValue, observation.Round, observation.ActiveSeatNumber, observation.Step)
	for _, option := range options {
		_, _ = fmt.Fprintf(stateHasher, ":%d:%s", len(option.ID), option.ID)
	}
	random := placementRandom{state: stateHasher.Sum64() ^ initialPlacementPolicySalt}
	return options[random.intn(len(options))].ID, nil
}

// LegalInitialPlacementOptions returns current legal pairs in board order so
// policy choice ordering remains stable across replay.
func LegalInitialPlacementOptions(state PlacementState) ([]InitialPlacementOption, error) {
	if state.Phase != PhaseInitialPlacement {
		return nil, fmt.Errorf("%w: expected %q, got %q", ErrInvalidPlacementPhase, PhaseInitialPlacement, state.Phase)
	}
	if _, _, err := validatePlacementProgress(state); err != nil {
		return nil, err
	}
	vertices, edges, occupiedVertices, occupiedEdges, err := placementBoardIndexes(state)
	if err != nil {
		return nil, err
	}

	options := make([]InitialPlacementOption, 0)
	for _, vertex := range state.Board.Vertices {
		if vertex.ID == "" || validateSettlementPlacement(state.Board, vertex.ID, vertices, occupiedVertices) != nil {
			continue
		}
		for _, edge := range state.Board.Edges {
			if edge.ID == "" || (edge.VertexIDs[0] != vertex.ID && edge.VertexIDs[1] != vertex.ID) {
				continue
			}
			if validateRoadPlacement(vertex.ID, edge.ID, edges, occupiedEdges) != nil {
				continue
			}
			options = append(options, InitialPlacementOption{
				ID:                 initialPlacementOptionID(vertex.ID, edge.ID),
				SettlementVertexID: vertex.ID,
				RoadEdgeID:         edge.ID,
			})
		}
	}
	return options, nil
}

// BuildPlacementObservation copies a seat-safe view so a policy cannot inspect
// another seat's inventory or mutate canonical state through shared slices.
func BuildPlacementObservation(state PlacementState) (PlacementObservation, error) {
	if state.Phase != PhaseInitialPlacement {
		return PlacementObservation{}, fmt.Errorf("%w: expected %q, got %q", ErrInvalidPlacementPhase, PhaseInitialPlacement, state.Phase)
	}
	_, playerIndex, err := validatePlacementProgress(state)
	if err != nil {
		return PlacementObservation{}, err
	}

	observation := PlacementObservation{
		Board:            clonePolicyBoard(state.Board),
		SeatOrder:        append([]int(nil), state.SeatOrder...),
		Round:            state.Round,
		ActiveSeatNumber: state.ActiveSeatNumber,
		Step:             state.Step,
		OwnPlayer:        clonePolicyPlayer(state.Players[playerIndex]),
		PublicPlayers:    make([]PublicPlayerState, 0, len(state.Players)-1),
	}
	for _, player := range state.Players {
		if player.SeatNumber == state.ActiveSeatNumber {
			continue
		}
		observation.PublicPlayers = append(observation.PublicPlayers, PublicPlayerState{
			SeatNumber:  player.SeatNumber,
			Settlements: append([]string(nil), player.Settlements...),
			Roads:       append([]string(nil), player.Roads...),
		})
	}
	return observation, nil
}

// ApplyInitialPlacementWithPolicy routes an AI choice through the same
// authoritative validation path used for explicit human commands.
func ApplyInitialPlacementWithPolicy(state PlacementState, policy PlacementPolicy, nextEventSequence int) (InitialPlacementResult, error) {
	if state.Phase != PhaseInitialPlacement {
		return InitialPlacementResult{}, fmt.Errorf("%w: expected %q, got %q", ErrInvalidPlacementPhase, PhaseInitialPlacement, state.Phase)
	}
	if nextEventSequence < 1 {
		return InitialPlacementResult{}, fmt.Errorf("%w: got %d", ErrInvalidEventSequence, nextEventSequence)
	}
	if policy == nil {
		return InitialPlacementResult{}, ErrInvalidPlacementPolicy
	}
	if _, _, err := validatePlacementProgress(state); err != nil {
		return InitialPlacementResult{}, err
	}
	if !isActiveSeatAI(state) {
		return InitialPlacementResult{}, ErrPlacementPolicyRequiresAI
	}

	options, err := LegalInitialPlacementOptions(state)
	if err != nil {
		return InitialPlacementResult{}, err
	}
	if len(options) == 0 {
		return InitialPlacementResult{}, ErrNoLegalInitialPlacementOptions
	}
	observation, err := BuildPlacementObservation(state)
	if err != nil {
		return InitialPlacementResult{}, err
	}
	policyVersion := policy.Version()
	if policyVersion == "" {
		return InitialPlacementResult{}, ErrInvalidPlacementPolicy
	}

	policyOptions := append([]InitialPlacementOption(nil), options...)
	optionID, err := policy.ChooseInitialPlacement(observation, policyOptions)
	if err != nil {
		return InitialPlacementResult{}, fmt.Errorf("choose initial placement: %w", err)
	}
	var selectedOption *InitialPlacementOption
	for index := range options {
		if options[index].ID == optionID {
			selectedOption = &options[index]
			break
		}
	}
	if selectedOption == nil {
		return InitialPlacementResult{}, fmt.Errorf("%w: option ID %q is not legal", ErrInvalidPlacementPolicyDecision, optionID)
	}

	result, err := ApplyInitialPlacementCommand(state, InitialPlacementCommand{
		CommandType:      InitialPlacementCommandType,
		ActingSeatNumber: state.ActiveSeatNumber,
		Payload: InitialPlacementCommandPayload{
			SettlementVertexID: selectedOption.SettlementVertexID,
			RoadEdgeID:         selectedOption.RoadEdgeID,
		},
	}, nextEventSequence)
	if err != nil {
		return InitialPlacementResult{}, err
	}
	result.Decision = &PlacementDecision{
		PolicyVersion: policyVersion,
		OptionID:      selectedOption.ID,
	}
	return result, nil
}

func isActiveSeatAI(state PlacementState) bool {
	for _, seat := range state.Seats {
		if seat.SeatNumber == state.ActiveSeatNumber {
			return seat.ControllerType == ControllerAI
		}
	}
	return false
}

func initialPlacementOptionID(settlementVertexID, roadEdgeID string) string {
	return fmt.Sprintf("settlement:%d:%s:road:%d:%s", len(settlementVertexID), settlementVertexID, len(roadEdgeID), roadEdgeID)
}

func clonePolicyBoard(boardState board.Board) board.Board {
	clone := boardState
	clone.Hexes = make([]board.Hex, len(boardState.Hexes))
	for index, hex := range boardState.Hexes {
		clone.Hexes[index] = hex
		clone.Hexes[index].VertexIDs = append([]string(nil), hex.VertexIDs...)
		if hex.NumberToken != nil {
			numberToken := *hex.NumberToken
			clone.Hexes[index].NumberToken = &numberToken
		}
	}
	clone.Vertices = append([]board.Vertex(nil), boardState.Vertices...)
	clone.Edges = append([]board.Edge(nil), boardState.Edges...)
	clone.Ports = make([]board.Port, len(boardState.Ports))
	for index, port := range boardState.Ports {
		clone.Ports[index] = port
		if port.ResourceType != nil {
			resourceType := *port.ResourceType
			clone.Ports[index].ResourceType = &resourceType
		}
	}
	return clone
}

func clonePolicyPlayer(player PlayerState) PlayerState {
	player.Settlements = append([]string(nil), player.Settlements...)
	player.Roads = append([]string(nil), player.Roads...)
	return player
}
