package execution

import (
	"errors"
	"fmt"
	"strconv"

	"catan.local/game-engine/internal/board"
)

var (
	// ErrInvalidPlacementState means setup cannot start from the supplied state.
	ErrInvalidPlacementState = errors.New("invalid initial placement state")
	// ErrInvalidPlacementPhase means a placement command was submitted outside
	// the active setup phase.
	ErrInvalidPlacementPhase = errors.New("invalid initial placement phase")
	// ErrInvalidPlacementCommand means a required command field is malformed.
	ErrInvalidPlacementCommand = errors.New("invalid initial placement command")
	// ErrUnsupportedPlacementCommand means the command type is not supported.
	ErrUnsupportedPlacementCommand = errors.New("unsupported initial placement command")
	// ErrWrongActiveSeat means the caller does not control the active seat.
	ErrWrongActiveSeat = errors.New("wrong active seat")
	// ErrUnknownSettlementVertex means the selected vertex is not on the board.
	ErrUnknownSettlementVertex = errors.New("unknown settlement vertex")
	// ErrOccupiedSettlementVertex means a settlement already occupies the vertex.
	ErrOccupiedSettlementVertex = errors.New("occupied settlement vertex")
	// ErrAdjacentSettlement means another settlement is one edge away.
	ErrAdjacentSettlement = errors.New("settlement violates distance rule")
	// ErrUnknownRoadEdge means the selected edge is not on the board.
	ErrUnknownRoadEdge = errors.New("unknown road edge")
	// ErrOccupiedRoadEdge means a road already occupies the edge.
	ErrOccupiedRoadEdge = errors.New("occupied road edge")
	// ErrRoadNotConnected means the road does not touch the new settlement.
	ErrRoadNotConnected = errors.New("road is not connected to settlement")
	// ErrInvalidEventSequence means a transition was given a non-positive event
	// sequence.
	ErrInvalidEventSequence = errors.New("invalid event sequence")
	// ErrNoLegalInitialPlacementOptions means the active seat has no legal
	// settlement-and-road pair to choose.
	ErrNoLegalInitialPlacementOptions = errors.New("no legal initial placement options")
	// ErrInvalidPlacementPolicy means no usable placement policy was supplied.
	ErrInvalidPlacementPolicy = errors.New("invalid initial placement policy")
	// ErrInvalidPlacementPolicyDecision means the policy selected an option that
	// was not among the engine-generated legal options.
	ErrInvalidPlacementPolicyDecision = errors.New("invalid initial placement policy decision")
	// ErrPlacementPolicyRequiresAI means the policy was asked to act for a human
	// controlled seat.
	ErrPlacementPolicyRequiresAI = errors.New("initial placement policy requires an AI-controlled seat")
)

// InitialPlacementResult contains the canonical state and ordered events for a
// setup transition, including the transition that begins setup.
type InitialPlacementResult struct {
	ExecutionSchemaVersion string
	StateSchemaVersion     string
	State                  PlacementState
	Events                 []PlacementEvent
	// Command is the accepted placement command. It is nil for the system
	// transition that begins initial placement.
	Command *InitialPlacementCommand
	// Decision is nil for transitions that came from system setup or explicit
	// commands rather than a placement policy.
	Decision *PlacementDecision
}

// ApplyInitialPlacementCommand validates and applies one complete initial
// settlement-and-road pair. It returns no partial result when any validation
// fails.
func ApplyInitialPlacementCommand(state PlacementState, command InitialPlacementCommand, nextEventSequence int) (InitialPlacementResult, error) {
	if state.Phase != PhaseInitialPlacement {
		return InitialPlacementResult{}, fmt.Errorf("%w: expected %q, got %q", ErrInvalidPlacementPhase, PhaseInitialPlacement, state.Phase)
	}
	if nextEventSequence < 1 {
		return InitialPlacementResult{}, fmt.Errorf("%w: got %d", ErrInvalidEventSequence, nextEventSequence)
	}
	if command.CommandType != InitialPlacementCommandType {
		return InitialPlacementResult{}, fmt.Errorf("%w: %q", ErrUnsupportedPlacementCommand, command.CommandType)
	}
	if command.Payload.SettlementVertexID == "" || command.Payload.RoadEdgeID == "" {
		return InitialPlacementResult{}, fmt.Errorf("%w: settlement vertex and road edge IDs are required", ErrInvalidPlacementCommand)
	}
	if command.ActingSeatNumber != state.ActiveSeatNumber {
		return InitialPlacementResult{}, fmt.Errorf("%w: seat %d, active seat is %d", ErrWrongActiveSeat, command.ActingSeatNumber, state.ActiveSeatNumber)
	}

	activeOrderIndex, playerIndex, err := validatePlacementProgress(state)
	if err != nil {
		return InitialPlacementResult{}, err
	}
	vertices, edges, occupiedVertices, occupiedEdges, err := placementBoardIndexes(state)
	if err != nil {
		return InitialPlacementResult{}, err
	}

	settlementVertexID := command.Payload.SettlementVertexID
	roadEdgeID := command.Payload.RoadEdgeID
	if err := validateSettlementPlacement(state.Board, settlementVertexID, vertices, occupiedVertices); err != nil {
		return InitialPlacementResult{}, err
	}
	if err := validateRoadPlacement(settlementVertexID, roadEdgeID, edges, occupiedEdges); err != nil {
		return InitialPlacementResult{}, err
	}

	grant := ResourceCounts{}
	if state.Round == 2 {
		grant, err = initialResourcesAtVertex(state.Board, settlementVertexID)
		if err != nil {
			return InitialPlacementResult{}, err
		}
	}

	completesSetup := state.Round == 2 && activeOrderIndex == 0
	eventCount := 2
	if state.Round == 2 {
		eventCount++
	}
	if completesSetup {
		eventCount++
	}
	maxInt := int(^uint(0) >> 1)
	if nextEventSequence > maxInt-(eventCount-1) {
		return InitialPlacementResult{}, fmt.Errorf("%w: event sequence range overflows", ErrInvalidEventSequence)
	}

	nextState := clonePlacementState(state)
	player := &nextState.Players[playerIndex]
	player.Settlements = append(player.Settlements, settlementVertexID)
	player.Roads = append(player.Roads, roadEdgeID)
	if state.Round == 2 {
		player.Resources.Lumber += grant.Lumber
		player.Resources.Wool += grant.Wool
		player.Resources.Grain += grant.Grain
		player.Resources.Brick += grant.Brick
		player.Resources.Ore += grant.Ore
	}

	events := make([]PlacementEvent, 0, eventCount)
	appendPublicEvent := func(eventType string, payload PlacementEventPayload) {
		events = append(events, PlacementEvent{
			Sequence:   nextEventSequence + len(events),
			EventType:  eventType,
			Payload:    payload,
			Visibility: VisibilityPublic,
		})
	}
	appendPublicEvent(InitialSettlementPlacedEventType, InitialSettlementPlacedPayload{
		SeatNumber:         command.ActingSeatNumber,
		SettlementVertexID: settlementVertexID,
	})
	appendPublicEvent(InitialRoadPlacedEventType, InitialRoadPlacedPayload{
		SeatNumber:         command.ActingSeatNumber,
		SettlementVertexID: settlementVertexID,
		RoadEdgeID:         roadEdgeID,
	})
	if state.Round == 2 {
		appendPublicEvent(InitialResourcesGrantedEventType, InitialResourcesGrantedPayload{
			SeatNumber: command.ActingSeatNumber,
			Resources:  grant,
		})
	}

	if completesSetup {
		nextState.Phase = PhaseTurnReady
		nextState.ActiveSeatNumber = 0
		nextState.Step = ""
		appendPublicEvent(InitialPlacementCompletedEventType, InitialPlacementCompletedPayload{
			SeatOrder: append([]int(nil), state.SeatOrder...),
			NextPhase: PhaseTurnReady,
		})
	} else if state.Round == 1 {
		if activeOrderIndex == len(state.SeatOrder)-1 {
			nextState.Round = 2
		} else {
			nextState.ActiveSeatNumber = state.SeatOrder[activeOrderIndex+1]
		}
	} else {
		nextState.ActiveSeatNumber = state.SeatOrder[activeOrderIndex-1]
	}

	return InitialPlacementResult{
		ExecutionSchemaVersion: ExecutionSchemaVersion,
		StateSchemaVersion:     PlacementStateSchemaVersion,
		State:                  nextState,
		Events:                 events,
		Command:                &command,
	}, nil
}

func validatePlacementProgress(state PlacementState) (int, int, error) {
	if state.Step != InitialPlacementStep || (state.Round != 1 && state.Round != 2) {
		return 0, 0, fmt.Errorf("%w: setup round %d and step %q are inconsistent", ErrInvalidPlacementState, state.Round, state.Step)
	}
	seats, err := normalizeSeats(state.Seats)
	if err != nil {
		return 0, 0, fmt.Errorf("%w: %v", ErrInvalidPlacementState, err)
	}
	if len(state.SeatOrder) != len(seats) || len(state.Players) != len(seats) {
		return 0, 0, fmt.Errorf("%w: seats, seat order, and players must have the same length", ErrInvalidPlacementState)
	}

	seatSet := make(map[int]struct{}, len(seats))
	for _, seat := range seats {
		seatSet[seat.SeatNumber] = struct{}{}
	}
	orderIndex := -1
	orderedSeats := make(map[int]struct{}, len(state.SeatOrder))
	for index, seatNumber := range state.SeatOrder {
		if _, exists := seatSet[seatNumber]; !exists {
			return 0, 0, fmt.Errorf("%w: seat order contains unknown seat %d", ErrInvalidPlacementState, seatNumber)
		}
		if _, exists := orderedSeats[seatNumber]; exists {
			return 0, 0, fmt.Errorf("%w: seat order repeats seat %d", ErrInvalidPlacementState, seatNumber)
		}
		orderedSeats[seatNumber] = struct{}{}
		if seatNumber == state.ActiveSeatNumber {
			orderIndex = index
		}
	}
	if orderIndex < 0 || len(orderedSeats) != len(seatSet) {
		return 0, 0, fmt.Errorf("%w: active seat or established order is invalid", ErrInvalidPlacementState)
	}

	playerIndexes := make(map[int]int, len(state.Players))
	for index, player := range state.Players {
		if _, exists := seatSet[player.SeatNumber]; !exists {
			return 0, 0, fmt.Errorf("%w: player state contains unknown seat %d", ErrInvalidPlacementState, player.SeatNumber)
		}
		if _, exists := playerIndexes[player.SeatNumber]; exists {
			return 0, 0, fmt.Errorf("%w: player state repeats seat %d", ErrInvalidPlacementState, player.SeatNumber)
		}
		playerIndexes[player.SeatNumber] = index
	}
	playerIndex, exists := playerIndexes[state.ActiveSeatNumber]
	if !exists {
		return 0, 0, fmt.Errorf("%w: active seat %d has no player state", ErrInvalidPlacementState, state.ActiveSeatNumber)
	}
	wantPlacements := state.Round - 1
	activePlayer := state.Players[playerIndex]
	if len(activePlayer.Settlements) != wantPlacements || len(activePlayer.Roads) != wantPlacements {
		return 0, 0, fmt.Errorf("%w: active seat %d has %d settlements and %d roads before round %d", ErrInvalidPlacementState, state.ActiveSeatNumber, len(activePlayer.Settlements), len(activePlayer.Roads), state.Round)
	}
	return orderIndex, playerIndex, nil
}

func placementBoardIndexes(state PlacementState) (map[string]board.Vertex, map[string]board.Edge, map[string]struct{}, map[string]struct{}, error) {
	vertices := make(map[string]board.Vertex, len(state.Board.Vertices))
	for _, vertex := range state.Board.Vertices {
		if _, exists := vertices[vertex.ID]; exists {
			return nil, nil, nil, nil, fmt.Errorf("%w: board repeats vertex %q", ErrInvalidPlacementState, vertex.ID)
		}
		vertices[vertex.ID] = vertex
	}
	edges := make(map[string]board.Edge, len(state.Board.Edges))
	for _, edge := range state.Board.Edges {
		if _, exists := edges[edge.ID]; exists {
			return nil, nil, nil, nil, fmt.Errorf("%w: board repeats edge %q", ErrInvalidPlacementState, edge.ID)
		}
		edges[edge.ID] = edge
	}

	occupiedVertices := make(map[string]struct{})
	occupiedEdges := make(map[string]struct{})
	for _, player := range state.Players {
		for _, vertexID := range player.Settlements {
			if _, exists := vertices[vertexID]; !exists {
				return nil, nil, nil, nil, fmt.Errorf("%w: existing settlement uses unknown vertex %q", ErrInvalidPlacementState, vertexID)
			}
			occupiedVertices[vertexID] = struct{}{}
		}
		for _, edgeID := range player.Roads {
			if _, exists := edges[edgeID]; !exists {
				return nil, nil, nil, nil, fmt.Errorf("%w: existing road uses unknown edge %q", ErrInvalidPlacementState, edgeID)
			}
			occupiedEdges[edgeID] = struct{}{}
		}
	}
	return vertices, edges, occupiedVertices, occupiedEdges, nil
}

func validateSettlementPlacement(
	boardState board.Board,
	settlementVertexID string,
	vertices map[string]board.Vertex,
	occupiedVertices map[string]struct{},
) error {
	if _, exists := vertices[settlementVertexID]; !exists {
		return fmt.Errorf("%w: %q", ErrUnknownSettlementVertex, settlementVertexID)
	}
	if _, occupied := occupiedVertices[settlementVertexID]; occupied {
		return fmt.Errorf("%w: %q", ErrOccupiedSettlementVertex, settlementVertexID)
	}
	if isAdjacentToPlacedSettlement(boardState, settlementVertexID, occupiedVertices) {
		return fmt.Errorf("%w: %q", ErrAdjacentSettlement, settlementVertexID)
	}
	return nil
}

func validateRoadPlacement(
	settlementVertexID string,
	roadEdgeID string,
	edges map[string]board.Edge,
	occupiedEdges map[string]struct{},
) error {
	road, exists := edges[roadEdgeID]
	if !exists {
		return fmt.Errorf("%w: %q", ErrUnknownRoadEdge, roadEdgeID)
	}
	if _, occupied := occupiedEdges[roadEdgeID]; occupied {
		return fmt.Errorf("%w: %q", ErrOccupiedRoadEdge, roadEdgeID)
	}
	if road.VertexIDs[0] != settlementVertexID && road.VertexIDs[1] != settlementVertexID {
		return fmt.Errorf("%w: edge %q does not touch vertex %q", ErrRoadNotConnected, roadEdgeID, settlementVertexID)
	}
	return nil
}

func isAdjacentToPlacedSettlement(boardState board.Board, vertexID string, occupiedVertices map[string]struct{}) bool {
	for _, edge := range boardState.Edges {
		if edge.VertexIDs[0] == vertexID {
			if _, occupied := occupiedVertices[edge.VertexIDs[1]]; occupied {
				return true
			}
		}
		if edge.VertexIDs[1] == vertexID {
			if _, occupied := occupiedVertices[edge.VertexIDs[0]]; occupied {
				return true
			}
		}
	}
	return false
}

func initialResourcesAtVertex(boardState board.Board, vertexID string) (ResourceCounts, error) {
	var resources ResourceCounts
	for _, hex := range boardState.Hexes {
		adjacent := false
		for _, hexVertexID := range hex.VertexIDs {
			if hexVertexID == vertexID {
				adjacent = true
				break
			}
		}
		if !adjacent {
			continue
		}
		switch hex.Terrain {
		case board.Forest:
			resources.Lumber++
		case board.Pasture:
			resources.Wool++
		case board.Fields:
			resources.Grain++
		case board.Hills:
			resources.Brick++
		case board.Mountains:
			resources.Ore++
		case board.Desert:
			// The desert produces no starting resource.
		default:
			return ResourceCounts{}, fmt.Errorf("%w: hex %q has unsupported terrain %q", ErrInvalidPlacementState, hex.ID, hex.Terrain)
		}
	}
	return resources, nil
}

func clonePlacementState(state PlacementState) PlacementState {
	clone := state
	clone.SeatOrder = append([]int(nil), state.SeatOrder...)
	clone.Seats = append([]Seat(nil), state.Seats...)
	clone.Players = make([]PlayerState, len(state.Players))
	for index, player := range state.Players {
		clone.Players[index] = player
		clone.Players[index].Settlements = append([]string(nil), player.Settlements...)
		clone.Players[index].Roads = append([]string(nil), player.Roads...)
	}
	return clone
}

// BeginInitialPlacement establishes the seeded player order and hands control
// to the first seat. It is a system transition, not a player command.
func BeginInitialPlacement(state BootstrapState, nextEventSequence int) (InitialPlacementResult, error) {
	if state.Phase != PhaseInitialized {
		return InitialPlacementResult{}, fmt.Errorf("%w: expected phase %q, got %q", ErrInvalidPlacementState, PhaseInitialized, state.Phase)
	}
	if nextEventSequence < 1 {
		return InitialPlacementResult{}, fmt.Errorf("%w: got %d", ErrInvalidEventSequence, nextEventSequence)
	}

	seats, err := normalizeSeats(state.Seats)
	if err != nil {
		return InitialPlacementResult{}, err
	}
	seatOrder, err := deriveSeatOrder(state.Board.Seed, seats)
	if err != nil {
		return InitialPlacementResult{}, err
	}

	players := make([]PlayerState, len(seats))
	for index, seat := range seats {
		players[index] = PlayerState{
			SeatNumber:  seat.SeatNumber,
			Settlements: []string{},
			Roads:       []string{},
		}
	}

	placementState := PlacementState{
		Phase:            PhaseInitialPlacement,
		SeatOrder:        append([]int(nil), seatOrder...),
		Round:            1,
		ActiveSeatNumber: seatOrder[0],
		Step:             InitialPlacementStep,
		Board:            state.Board,
		Seats:            seats,
		Players:          players,
	}

	return InitialPlacementResult{
		ExecutionSchemaVersion: ExecutionSchemaVersion,
		StateSchemaVersion:     PlacementStateSchemaVersion,
		State:                  placementState,
		Events: []PlacementEvent{
			{
				Sequence:  nextEventSequence,
				EventType: InitialPlacementStartedEventType,
				Payload: InitialPlacementStartedPayload{
					SeatOrder:        append([]int(nil), seatOrder...),
					Round:            1,
					ActiveSeatNumber: seatOrder[0],
				},
				Visibility: VisibilityPublic,
			},
		},
	}, nil
}

const initialPlacementOrderSalt uint64 = 0xa0761d6478bd642f

func deriveSeatOrder(seed string, seats []Seat) ([]int, error) {
	seedValue, err := parsePlacementSeed(seed)
	if err != nil {
		return nil, err
	}

	order := make([]int, len(seats))
	for index, seat := range seats {
		order[index] = seat.SeatNumber
	}

	random := placementRandom{state: uint64(seedValue) ^ initialPlacementOrderSalt}
	for index := len(order) - 1; index > 0; index-- {
		other := random.intn(index + 1)
		order[index], order[other] = order[other], order[index]
	}

	return order, nil
}

func parsePlacementSeed(seed string) (int64, error) {
	seedValue, err := strconv.ParseInt(seed, 10, 64)
	if err != nil || seedValue < 0 || strconv.FormatInt(seedValue, 10) != seed {
		return 0, fmt.Errorf("%w: expected a canonical non-negative signed 64-bit integer", board.ErrInvalidSeed)
	}
	return seedValue, nil
}

type placementRandom struct {
	state uint64
}

func (random *placementRandom) next() uint64 {
	random.state += 0x9e3779b97f4a7c15
	value := random.state
	value = (value ^ (value >> 30)) * 0xbf58476d1ce4e5b9
	value = (value ^ (value >> 27)) * 0x94d049bb133111eb
	return value ^ (value >> 31)
}

func (random *placementRandom) intn(limit int) int {
	bound := uint64(limit)
	threshold := -bound % bound
	for {
		value := random.next()
		if value >= threshold {
			return int(value % bound)
		}
	}
}
