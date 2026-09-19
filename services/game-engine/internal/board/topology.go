package board

import "fmt"

type latticeCoordinate struct {
	x int
	y int
}

type edgeKey struct {
	firstVertexID  string
	secondVertexID string
}

type boardTopology struct {
	vertices       []Vertex
	edges          []Edge
	perimeterEdges []Edge
}

func deriveBoardTopology(hexes []Hex) (boardTopology, error) {
	vertices := make([]Vertex, 0, 54)
	verticesByCoordinate := make(map[latticeCoordinate]string, 54)
	edges := make([]Edge, 0, 72)
	seenEdges := make(map[edgeKey]bool, 72)
	edgeUseCounts := make(map[edgeKey]int, 72)

	for hexIndex := range hexes {
		hex := &hexes[hexIndex]
		hex.VertexIDs = make([]string, 0, 6)

		for _, coordinate := range hexVertexCoordinates(*hex) {
			vertexID := fmt.Sprintf("vertex:%d:%d", coordinate.x, coordinate.y)
			if _, exists := verticesByCoordinate[coordinate]; !exists {
				verticesByCoordinate[coordinate] = vertexID
				vertices = append(vertices, Vertex{
					ID: vertexID,
					X:  coordinate.x,
					Y:  coordinate.y,
				})
			}
			hex.VertexIDs = append(hex.VertexIDs, vertexID)
		}

		for index, firstVertexID := range hex.VertexIDs {
			secondVertexID := hex.VertexIDs[(index+1)%len(hex.VertexIDs)]
			key := canonicalEdgeKey(firstVertexID, secondVertexID)
			edgeUseCounts[key]++
			if seenEdges[key] {
				continue
			}
			seenEdges[key] = true
			edges = append(edges, Edge{
				ID:        fmt.Sprintf("edge:%s|%s", key.firstVertexID, key.secondVertexID),
				VertexIDs: [2]string{key.firstVertexID, key.secondVertexID},
			})
		}
	}

	perimeterEdges := make([]Edge, 0, 30)
	for _, edge := range edges {
		key := canonicalEdgeKey(edge.VertexIDs[0], edge.VertexIDs[1])
		switch edgeUseCounts[key] {
		case 1:
			perimeterEdges = append(perimeterEdges, edge)
		case 2:
			// Interior edges are shared by two hex rings.
		default:
			return boardTopology{}, fmt.Errorf("edge %q belongs to %d hex rings, want one or two", edge.ID, edgeUseCounts[key])
		}
	}

	orderedPerimeter, err := orderPerimeterEdges(perimeterEdges)
	if err != nil {
		return boardTopology{}, err
	}

	return boardTopology{
		vertices:       vertices,
		edges:          edges,
		perimeterEdges: orderedPerimeter,
	}, nil
}

func hexVertexCoordinates(hex Hex) [6]latticeCoordinate {
	// Scaling pointy-top axial centers makes every corner an integer lattice point.
	center := latticeCoordinate{x: 2*hex.Q + hex.R, y: 3 * hex.R}
	offsets := [...]latticeCoordinate{
		{x: 0, y: -2},
		{x: 1, y: -1},
		{x: 1, y: 1},
		{x: 0, y: 2},
		{x: -1, y: 1},
		{x: -1, y: -1},
	}

	var coordinates [6]latticeCoordinate
	for index, offset := range offsets {
		coordinates[index] = latticeCoordinate{
			x: center.x + offset.x,
			y: center.y + offset.y,
		}
	}
	return coordinates
}

func canonicalEdgeKey(firstVertexID, secondVertexID string) edgeKey {
	if secondVertexID < firstVertexID {
		firstVertexID, secondVertexID = secondVertexID, firstVertexID
	}
	return edgeKey{firstVertexID: firstVertexID, secondVertexID: secondVertexID}
}

func orderPerimeterEdges(perimeterEdges []Edge) ([]Edge, error) {
	if len(perimeterEdges) == 0 {
		return nil, fmt.Errorf("board topology has no perimeter edges")
	}

	edgesByID := make(map[string]Edge, len(perimeterEdges))
	incidentEdges := make(map[string][]string, len(perimeterEdges))
	for _, edge := range perimeterEdges {
		if _, exists := edgesByID[edge.ID]; exists {
			return nil, fmt.Errorf("duplicate perimeter edge ID %q", edge.ID)
		}
		edgesByID[edge.ID] = edge
		for _, vertexID := range edge.VertexIDs {
			incidentEdges[vertexID] = append(incidentEdges[vertexID], edge.ID)
		}
	}

	startVertexID := ""
	for vertexID, edgeIDs := range incidentEdges {
		if len(edgeIDs) != 2 {
			return nil, fmt.Errorf("perimeter vertex %q has %d incident edges, want two", vertexID, len(edgeIDs))
		}
		if startVertexID == "" || vertexID < startVertexID {
			startVertexID = vertexID
		}
	}

	ordered := make([]Edge, 0, len(perimeterEdges))
	currentVertexID := startVertexID
	previousEdgeID := ""
	for len(ordered) < len(perimeterEdges) {
		edgeIDs := incidentEdges[currentVertexID]
		nextEdgeID := ""
		if previousEdgeID == "" {
			nextEdgeID = edgeIDs[0]
			firstNeighborID, _ := otherEdgeEndpoint(edgesByID[nextEdgeID], currentVertexID)
			for _, candidateID := range edgeIDs[1:] {
				candidateNeighborID, _ := otherEdgeEndpoint(edgesByID[candidateID], currentVertexID)
				if candidateNeighborID < firstNeighborID {
					nextEdgeID = candidateID
					firstNeighborID = candidateNeighborID
				}
			}
		} else {
			for _, candidateID := range edgeIDs {
				if candidateID != previousEdgeID {
					nextEdgeID = candidateID
					break
				}
			}
		}
		if nextEdgeID == "" {
			return nil, fmt.Errorf("perimeter walk stops at vertex %q", currentVertexID)
		}

		edge := edgesByID[nextEdgeID]
		nextVertexID, ok := otherEdgeEndpoint(edge, currentVertexID)
		if !ok {
			return nil, fmt.Errorf("perimeter edge %q does not touch vertex %q", edge.ID, currentVertexID)
		}
		ordered = append(ordered, edge)
		previousEdgeID = edge.ID
		currentVertexID = nextVertexID
		if currentVertexID == startVertexID {
			break
		}
	}

	if currentVertexID != startVertexID || len(ordered) != len(perimeterEdges) {
		return nil, fmt.Errorf("perimeter edges do not form one closed cycle")
	}
	return ordered, nil
}

func otherEdgeEndpoint(edge Edge, vertexID string) (string, bool) {
	if edge.VertexIDs[0] == vertexID {
		return edge.VertexIDs[1], true
	}
	if edge.VertexIDs[1] == vertexID {
		return edge.VertexIDs[0], true
	}
	return "", false
}
