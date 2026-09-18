package board

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"testing"
)

func TestGenerateStandardBoardTopologyCountsAndReferences(t *testing.T) {
	generated, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}

	if got, want := len(generated.Vertices), 54; got != want {
		t.Fatalf("vertex count = %d, want %d", got, want)
	}
	if got, want := len(generated.Edges), 72; got != want {
		t.Fatalf("edge count = %d, want %d", got, want)
	}

	verticesByID := make(map[string]Vertex, len(generated.Vertices))
	coordinates := make(map[[2]int]bool, len(generated.Vertices))
	vertexUseCounts := make(map[string]int, len(generated.Vertices))
	for _, vertex := range generated.Vertices {
		if vertex.ID != fmt.Sprintf("vertex:%d:%d", vertex.X, vertex.Y) {
			t.Errorf("vertex ID %q does not match its logical coordinates", vertex.ID)
		}
		if _, exists := verticesByID[vertex.ID]; exists {
			t.Errorf("duplicate vertex ID %q", vertex.ID)
		}
		verticesByID[vertex.ID] = vertex

		coordinate := [2]int{vertex.X, vertex.Y}
		if coordinates[coordinate] {
			t.Errorf("duplicate vertex coordinate x=%d y=%d", vertex.X, vertex.Y)
		}
		coordinates[coordinate] = true
	}

	ringEdgeUseCounts := make(map[[2]string]int, len(generated.Edges))
	for _, hex := range generated.Hexes {
		if got, want := len(hex.VertexIDs), 6; got != want {
			t.Errorf("hex %q has %d vertex IDs, want %d", hex.ID, got, want)
			continue
		}

		seenHexVertices := make(map[string]bool, len(hex.VertexIDs))
		for _, vertexID := range hex.VertexIDs {
			if _, exists := verticesByID[vertexID]; !exists {
				t.Errorf("hex %q references missing vertex %q", hex.ID, vertexID)
			}
			if seenHexVertices[vertexID] {
				t.Errorf("hex %q repeats vertex %q", hex.ID, vertexID)
			}
			seenHexVertices[vertexID] = true
			vertexUseCounts[vertexID]++
		}

		for index, firstVertexID := range hex.VertexIDs {
			secondVertexID := hex.VertexIDs[(index+1)%len(hex.VertexIDs)]
			key := testCanonicalEdgeKey(firstVertexID, secondVertexID)
			ringEdgeUseCounts[key]++
		}
	}

	for vertexID := range verticesByID {
		if vertexUseCounts[vertexID] == 0 {
			t.Errorf("vertex %q is not referenced by any hex", vertexID)
		}
	}

	seenEdges := make(map[[2]string]bool, len(generated.Edges))
	perimeterEdgeCount := 0
	for _, edge := range generated.Edges {
		firstVertexID, secondVertexID := edge.VertexIDs[0], edge.VertexIDs[1]
		key := testCanonicalEdgeKey(firstVertexID, secondVertexID)
		if firstVertexID == secondVertexID {
			t.Errorf("edge %q repeats its endpoint %q", edge.ID, firstVertexID)
		}
		if firstVertexID != key[0] || secondVertexID != key[1] {
			t.Errorf("edge %q endpoints are not in canonical order", edge.ID)
		}
		if edge.ID != fmt.Sprintf("edge:%s|%s", key[0], key[1]) {
			t.Errorf("edge ID %q does not match its endpoints", edge.ID)
		}
		if seenEdges[key] {
			t.Errorf("duplicate edge endpoints %q and %q", key[0], key[1])
		}
		seenEdges[key] = true

		for _, vertexID := range edge.VertexIDs {
			if _, exists := verticesByID[vertexID]; !exists {
				t.Errorf("edge %q references missing vertex %q", edge.ID, vertexID)
			}
		}

		switch ringEdgeUseCounts[key] {
		case 1:
			perimeterEdgeCount++
		case 2:
		default:
			t.Errorf("edge %q appears in %d hex rings, want one or two", edge.ID, ringEdgeUseCounts[key])
		}
	}

	if got, want := len(seenEdges), len(ringEdgeUseCounts); got != want {
		t.Errorf("unique generated edge count = %d, hex rings describe %d", got, want)
	}
	if got, want := perimeterEdgeCount, 30; got != want {
		t.Errorf("perimeter edge count = %d, want %d", got, want)
	}
}

func TestGenerateStandardBoardPortsAreValidAndEvenlySpaced(t *testing.T) {
	generated, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if got, want := len(generated.Ports), 9; got != want {
		t.Fatalf("port count = %d, want %d", got, want)
	}

	perimeterCycle, err := testPerimeterCycle(generated)
	if err != nil {
		t.Fatalf("derive perimeter cycle for test: %v", err)
	}
	if got, want := len(perimeterCycle), 30; got != want {
		t.Fatalf("perimeter edge count = %d, want %d", got, want)
	}

	perimeterPositions := make(map[string]int, len(perimeterCycle))
	for index, edgeID := range perimeterCycle {
		perimeterPositions[edgeID] = index
	}
	edgeIDs := make(map[string]bool, len(generated.Edges))
	for _, edge := range generated.Edges {
		edgeIDs[edge.ID] = true
	}
	usedPortEdges := make(map[string]bool, len(generated.Ports))
	portPositions := make([]int, 0, len(generated.Ports))
	resourceCounts := make(map[Resource]int)
	genericPortCount := 0
	for _, port := range generated.Ports {
		if port.ID != "port:"+port.EdgeID {
			t.Errorf("port ID %q does not match its edge %q", port.ID, port.EdgeID)
		}
		if !edgeIDs[port.EdgeID] {
			t.Errorf("port %q references missing edge %q", port.ID, port.EdgeID)
		}
		if usedPortEdges[port.EdgeID] {
			t.Errorf("multiple ports use edge %q", port.EdgeID)
		}
		usedPortEdges[port.EdgeID] = true

		position, isPerimeterEdge := perimeterPositions[port.EdgeID]
		if !isPerimeterEdge {
			t.Errorf("port %q is not on a perimeter edge", port.ID)
		} else {
			portPositions = append(portPositions, position)
		}

		if port.ResourceType == nil {
			if port.TradeRatio != 3 {
				t.Errorf("generic port %q ratio = %d, want 3", port.ID, port.TradeRatio)
			}
			genericPortCount++
			continue
		}
		if port.TradeRatio != 2 {
			t.Errorf("resource port %q ratio = %d, want 2", port.ID, port.TradeRatio)
		}
		resourceCounts[*port.ResourceType]++
	}

	if got, want := genericPortCount, 4; got != want {
		t.Errorf("generic 3:1 port count = %d, want %d", got, want)
	}
	for _, resource := range []Resource{Lumber, Wool, Grain, Brick, Ore} {
		if got, want := resourceCounts[resource], 1; got != want {
			t.Errorf("2:1 %s port count = %d, want %d", resource, got, want)
		}
	}

	if len(portPositions) == len(generated.Ports) {
		sort.Ints(portPositions)
		for index, position := range portPositions {
			nextPosition := portPositions[(index+1)%len(portPositions)]
			gap := (nextPosition - position + len(perimeterCycle)) % len(perimeterCycle)
			if gap < 3 || gap > 4 {
				t.Errorf("perimeter gap after port at edge index %d is %d, want 3 or 4", position, gap)
			}
		}
	}
}

func TestGenerateStandardBoardPortsMatchGoldenFixture(t *testing.T) {
	generated, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}

	want, err := os.ReadFile("testdata/standard-seed-894177203164-ports.golden")
	if err != nil {
		t.Fatalf("read port golden fixture: %v\nactual port output:\n%s", err, boardPortSnapshot(generated))
	}
	if got := boardPortSnapshot(generated); got != string(want) {
		t.Fatalf("port output differs from golden fixture\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func testPerimeterCycle(generated Board) ([]string, error) {
	ringEdgeUseCounts := make(map[[2]string]int)
	for _, hex := range generated.Hexes {
		for index, firstVertexID := range hex.VertexIDs {
			secondVertexID := hex.VertexIDs[(index+1)%len(hex.VertexIDs)]
			ringEdgeUseCounts[testCanonicalEdgeKey(firstVertexID, secondVertexID)]++
		}
	}

	perimeterEdges := make(map[string]Edge)
	for _, edge := range generated.Edges {
		if ringEdgeUseCounts[testCanonicalEdgeKey(edge.VertexIDs[0], edge.VertexIDs[1])] == 1 {
			perimeterEdges[edge.ID] = edge
		}
	}
	if len(perimeterEdges) == 0 {
		return nil, fmt.Errorf("board has no perimeter edges")
	}

	incidentEdges := make(map[string][]string)
	for edgeID, edge := range perimeterEdges {
		for _, vertexID := range edge.VertexIDs {
			incidentEdges[vertexID] = append(incidentEdges[vertexID], edgeID)
		}
	}
	for vertexID, edges := range incidentEdges {
		if len(edges) != 2 {
			return nil, fmt.Errorf("perimeter vertex %q has %d incident edges, want 2", vertexID, len(edges))
		}
	}

	var firstEdge Edge
	for _, edge := range perimeterEdges {
		firstEdge = edge
		break
	}
	startVertexID := firstEdge.VertexIDs[0]
	currentVertexID := firstEdge.VertexIDs[1]
	previousEdgeID := firstEdge.ID
	cycle := []string{firstEdge.ID}
	for len(cycle) < len(perimeterEdges) {
		var nextEdgeID string
		for _, edgeID := range incidentEdges[currentVertexID] {
			if edgeID != previousEdgeID {
				nextEdgeID = edgeID
				break
			}
		}
		if nextEdgeID == "" {
			return nil, fmt.Errorf("perimeter cycle stops at vertex %q", currentVertexID)
		}

		nextEdge := perimeterEdges[nextEdgeID]
		nextVertexID := nextEdge.VertexIDs[0]
		if nextVertexID == currentVertexID {
			nextVertexID = nextEdge.VertexIDs[1]
		}
		cycle = append(cycle, nextEdgeID)
		previousEdgeID = nextEdgeID
		currentVertexID = nextVertexID
	}
	if currentVertexID != startVertexID {
		return nil, fmt.Errorf("perimeter walk did not close at its starting vertex")
	}
	return cycle, nil
}

func testCanonicalEdgeKey(firstVertexID, secondVertexID string) [2]string {
	if secondVertexID < firstVertexID {
		firstVertexID, secondVertexID = secondVertexID, firstVertexID
	}
	return [2]string{firstVertexID, secondVertexID}
}

func boardPortSnapshot(generated Board) string {
	var snapshot strings.Builder
	snapshot.WriteString("id,edge_id,resource_type,trade_ratio\n")
	for _, port := range generated.Ports {
		resource := "-"
		if port.ResourceType != nil {
			resource = string(*port.ResourceType)
		}
		fmt.Fprintf(&snapshot, "%s,%s,%s,%d\n", port.ID, port.EdgeID, resource, port.TradeRatio)
	}
	return snapshot.String()
}
