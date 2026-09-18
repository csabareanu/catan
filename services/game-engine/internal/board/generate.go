package board

import (
	"fmt"
	"strconv"
)

const (
	baseRulesetKey = "base"
	standardMapKey = "standard"
)

type axialCoordinate struct {
	q int
	r int
}

// Generate builds the standard base-game board for a canonical non-negative seed.
// Changes to its random sequence or shuffle order change existing seed results
// and require a corresponding map-version update.
func Generate(config Config) (Board, error) {
	seed, err := parseSeed(config.Seed)
	if err != nil {
		return Board{}, err
	}
	if config.RulesetKey != baseRulesetKey {
		return Board{}, fmt.Errorf("%w: %q", ErrUnsupportedRuleset, config.RulesetKey)
	}
	if config.MapKey != standardMapKey {
		return Board{}, fmt.Errorf("%w: %q", ErrUnsupportedMap, config.MapKey)
	}

	random := splitMix64{state: uint64(seed)}
	coordinates := standardCoordinates()
	terrains := standardTerrains()
	shuffle(&random, terrains)

	hexes := make([]Hex, len(coordinates))
	for index, coordinate := range coordinates {
		hexes[index] = Hex{
			ID:      fmt.Sprintf("hex:%d:%d", coordinate.q, coordinate.r),
			Q:       coordinate.q,
			R:       coordinate.r,
			Terrain: terrains[index],
		}
	}

	if err := assignNumberTokens(hexes, &random); err != nil {
		return Board{}, err
	}

	return Board{
		Seed:       config.Seed,
		RulesetKey: config.RulesetKey,
		MapKey:     config.MapKey,
		Hexes:      hexes,
	}, nil
}

func parseSeed(seed string) (int64, error) {
	value, err := strconv.ParseInt(seed, 10, 64)
	if err != nil || value < 0 || strconv.FormatInt(value, 10) != seed {
		return 0, fmt.Errorf("%w: expected a canonical non-negative signed 64-bit integer", ErrInvalidSeed)
	}
	return value, nil
}

func standardCoordinates() []axialCoordinate {
	coordinates := make([]axialCoordinate, 0, 19)
	for r := -2; r <= 2; r++ {
		minimumQ := max(-2, -r-2)
		maximumQ := min(2, -r+2)
		for q := minimumQ; q <= maximumQ; q++ {
			coordinates = append(coordinates, axialCoordinate{q: q, r: r})
		}
	}
	return coordinates
}

func standardTerrains() []Terrain {
	return []Terrain{
		Forest, Forest, Forest, Forest,
		Pasture, Pasture, Pasture, Pasture,
		Fields, Fields, Fields, Fields,
		Hills, Hills, Hills,
		Mountains, Mountains, Mountains,
		Desert,
	}
}

func assignNumberTokens(hexes []Hex, random *splitMix64) error {
	resourceIndices := make([]int, 0, 18)
	for index, hex := range hexes {
		if hex.Terrain != Desert {
			resourceIndices = append(resourceIndices, index)
		}
	}
	if len(resourceIndices) != 18 {
		return fmt.Errorf("standard board must have 18 non-desert hexes, got %d", len(resourceIndices))
	}

	redPositions := chooseNonAdjacentPositions(hexes, resourceIndices, 4, random)
	if len(redPositions) != 4 {
		return fmt.Errorf("standard board has no valid placement for the four 6/8 tokens")
	}

	isRedPosition := make([]bool, len(hexes))
	redTokens := []int{6, 6, 8, 8}
	shuffle(random, redTokens)
	for index, position := range redPositions {
		hexes[position].NumberToken = intPointer(redTokens[index])
		isRedPosition[position] = true
	}

	otherTokens := []int{
		2, 12,
		3, 3, 4, 4, 5, 5,
		9, 9, 10, 10, 11, 11,
	}
	shuffle(random, otherTokens)
	otherTokenIndex := 0
	for index := range hexes {
		if hexes[index].Terrain == Desert || isRedPosition[index] {
			continue
		}
		hexes[index].NumberToken = intPointer(otherTokens[otherTokenIndex])
		otherTokenIndex++
	}

	return nil
}

// chooseNonAdjacentPositions selects uniformly from the board's valid positions
// for high-probability tokens instead of retrying random layouts indefinitely.
func chooseNonAdjacentPositions(hexes []Hex, candidates []int, count int, random *splitMix64) []int {
	validPositions := make([][]int, 0)
	chosen := make([]int, 0, count)
	var search func(start int)
	search = func(start int) {
		if len(chosen) == count {
			validPositions = append(validPositions, append([]int(nil), chosen...))
			return
		}
		if len(candidates)-start < count-len(chosen) {
			return
		}

		for index := start; index < len(candidates); index++ {
			candidate := candidates[index]
			isAdjacent := false
			for _, selected := range chosen {
				if areAxialNeighbors(hexes[candidate], hexes[selected]) {
					isAdjacent = true
					break
				}
			}
			if isAdjacent {
				continue
			}

			chosen = append(chosen, candidate)
			search(index + 1)
			chosen = chosen[:len(chosen)-1]
		}
	}

	search(0)
	if len(validPositions) == 0 {
		return nil
	}
	return validPositions[random.intn(len(validPositions))]
}

func areAxialNeighbors(first, second Hex) bool {
	deltaQ := first.Q - second.Q
	deltaR := first.R - second.R
	return (deltaQ == 1 && deltaR == 0) ||
		(deltaQ == -1 && deltaR == 0) ||
		(deltaQ == 0 && deltaR == 1) ||
		(deltaQ == 0 && deltaR == -1) ||
		(deltaQ == 1 && deltaR == -1) ||
		(deltaQ == -1 && deltaR == 1)
}

func intPointer(value int) *int {
	return &value
}
