package board

import "fmt"

type portSpec struct {
	resourceType *Resource
	tradeRatio   int
}

func generateStandardPorts(perimeterEdges []Edge, random *splitMix64) ([]Port, error) {
	specs := standardPortSpecs()
	if len(perimeterEdges) < len(specs) {
		return nil, fmt.Errorf("standard map has %d perimeter edges, need at least %d ports", len(perimeterEdges), len(specs))
	}

	start := random.intn(len(perimeterEdges))
	selectedEdges := make([]Edge, 0, len(specs))
	for index := range specs {
		perimeterIndex := (start + index*len(perimeterEdges)/len(specs)) % len(perimeterEdges)
		selectedEdges = append(selectedEdges, perimeterEdges[perimeterIndex])
	}
	shuffle(random, specs)

	ports := make([]Port, len(specs))
	for index, spec := range specs {
		edge := selectedEdges[index]
		ports[index] = Port{
			ID:           "port:" + edge.ID,
			EdgeID:       edge.ID,
			ResourceType: spec.resourceType,
			TradeRatio:   spec.tradeRatio,
		}
	}
	return ports, nil
}

func standardPortSpecs() []portSpec {
	specs := make([]portSpec, 0, 9)
	for range 4 {
		specs = append(specs, portSpec{tradeRatio: 3})
	}
	for _, resource := range []Resource{Lumber, Wool, Grain, Brick, Ore} {
		specs = append(specs, portSpec{
			resourceType: resourcePointer(resource),
			tradeRatio:   2,
		})
	}
	return specs
}

func resourcePointer(resource Resource) *Resource {
	return &resource
}
