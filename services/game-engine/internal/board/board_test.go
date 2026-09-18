package board

import (
	"errors"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

var standardConfig = Config{
	Seed:       "894177203164",
	RulesetKey: "base",
	MapKey:     "standard",
}

func TestGenerateStandardBoardCounts(t *testing.T) {
	board, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}

	if got, want := len(board.Hexes), 19; got != want {
		t.Fatalf("hex count = %d, want %d", got, want)
	}

	wantTerrainCounts := map[Terrain]int{
		Forest:    4,
		Pasture:   4,
		Fields:    4,
		Hills:     3,
		Mountains: 3,
		Desert:    1,
	}
	terrainCounts := make(map[Terrain]int)
	tokenCounts := make(map[int]int)
	coordinates := make(map[[2]int]bool)

	for _, hex := range board.Hexes {
		terrainCounts[hex.Terrain]++
		coordinate := [2]int{hex.Q, hex.R}
		if coordinates[coordinate] {
			t.Errorf("duplicate coordinate q=%d r=%d", hex.Q, hex.R)
		}
		coordinates[coordinate] = true

		if hex.ID != fmt.Sprintf("hex:%d:%d", hex.Q, hex.R) {
			t.Errorf("hex ID %q does not match its coordinates", hex.ID)
		}

		if hex.Terrain == Desert {
			if hex.NumberToken != nil {
				t.Errorf("desert hex %q has token %d, want no token", hex.ID, *hex.NumberToken)
			}
			continue
		}

		if hex.NumberToken == nil {
			t.Errorf("non-desert hex %q has no number token", hex.ID)
			continue
		}
		tokenCounts[*hex.NumberToken]++
	}

	if !reflect.DeepEqual(terrainCounts, wantTerrainCounts) {
		t.Errorf("terrain counts = %v, want %v", terrainCounts, wantTerrainCounts)
	}

	wantTokenCounts := map[int]int{
		2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1,
	}
	if !reflect.DeepEqual(tokenCounts, wantTokenCounts) {
		t.Errorf("number-token counts = %v, want %v", tokenCounts, wantTokenCounts)
	}

	for first := range board.Hexes {
		for second := first + 1; second < len(board.Hexes); second++ {
			if axialNeighbors(board.Hexes[first], board.Hexes[second]) &&
				isHighProbabilityToken(board.Hexes[first].NumberToken) &&
				isHighProbabilityToken(board.Hexes[second].NumberToken) {
				t.Errorf("adjacent 6/8 tokens on %q and %q", board.Hexes[first].ID, board.Hexes[second].ID)
			}
		}
	}
}

func TestGenerateBoardIsDeterministic(t *testing.T) {
	first, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("first Generate() error = %v", err)
	}

	for attempt := 0; attempt < 5; attempt++ {
		next, err := Generate(standardConfig)
		if err != nil {
			t.Fatalf("Generate() on attempt %d error = %v", attempt+1, err)
		}
		if !reflect.DeepEqual(next, first) {
			t.Fatalf("Generate() changed output on attempt %d", attempt+1)
		}
	}
}

func TestGenerateBoardMatchesGoldenFixture(t *testing.T) {
	board, err := Generate(standardConfig)
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}

	want, err := os.ReadFile("testdata/standard-seed-894177203164.golden")
	if err != nil {
		t.Fatalf("read golden fixture: %v", err)
	}
	if got := boardSnapshot(board); got != string(want) {
		t.Fatalf("board output differs from golden fixture\n--- got ---\n%s\n--- want ---\n%s", got, want)
	}
}

func TestGenerateBoardRejectsNonCanonicalSeeds(t *testing.T) {
	invalidSeeds := []string{
		"",
		"-1",
		"-0",
		"+1",
		"01",
		" 1",
		"1 ",
		"1.0",
		"9223372036854775808",
	}

	for _, seed := range invalidSeeds {
		t.Run(fmt.Sprintf("seed_%q", seed), func(t *testing.T) {
			config := standardConfig
			config.Seed = seed

			if _, err := Generate(config); !errors.Is(err, ErrInvalidSeed) {
				t.Fatalf("Generate() error = %v, want ErrInvalidSeed", err)
			}
		})
	}
}

func TestGenerateBoardAcceptsSeedBoundaries(t *testing.T) {
	for _, seed := range []string{"0", "9223372036854775807"} {
		t.Run(seed, func(t *testing.T) {
			config := standardConfig
			config.Seed = seed
			if _, err := Generate(config); err != nil {
				t.Fatalf("Generate() error = %v", err)
			}
		})
	}
}

func TestGenerateBoardRejectsUnsupportedConfiguration(t *testing.T) {
	tests := []struct {
		name   string
		config Config
		want   error
	}{
		{
			name: "empty ruleset",
			config: Config{
				Seed:       standardConfig.Seed,
				MapKey:     standardConfig.MapKey,
				RulesetKey: "",
			},
			want: ErrUnsupportedRuleset,
		},
		{
			name: "unknown ruleset",
			config: Config{
				Seed:       standardConfig.Seed,
				RulesetKey: "seafarers",
				MapKey:     standardConfig.MapKey,
			},
			want: ErrUnsupportedRuleset,
		},
		{
			name: "empty map",
			config: Config{
				Seed:       standardConfig.Seed,
				RulesetKey: standardConfig.RulesetKey,
				MapKey:     "",
			},
			want: ErrUnsupportedMap,
		},
		{
			name: "unknown map",
			config: Config{
				Seed:       standardConfig.Seed,
				RulesetKey: standardConfig.RulesetKey,
				MapKey:     "islands",
			},
			want: ErrUnsupportedMap,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := Generate(test.config); !errors.Is(err, test.want) {
				t.Fatalf("Generate() error = %v, want %v", err, test.want)
			}
		})
	}
}

func boardSnapshot(board Board) string {
	var snapshot strings.Builder
	snapshot.WriteString("id,q,r,terrain,token\n")
	for _, hex := range board.Hexes {
		token := "-"
		if hex.NumberToken != nil {
			token = strconv.Itoa(*hex.NumberToken)
		}
		fmt.Fprintf(&snapshot, "%s,%d,%d,%s,%s\n", hex.ID, hex.Q, hex.R, hex.Terrain, token)
	}
	return snapshot.String()
}

func axialNeighbors(first, second Hex) bool {
	deltaQ := first.Q - second.Q
	deltaR := first.R - second.R
	return (deltaQ == 1 && deltaR == 0) ||
		(deltaQ == -1 && deltaR == 0) ||
		(deltaQ == 0 && deltaR == 1) ||
		(deltaQ == 0 && deltaR == -1) ||
		(deltaQ == 1 && deltaR == -1) ||
		(deltaQ == -1 && deltaR == 1)
}

func isHighProbabilityToken(token *int) bool {
	return token != nil && (*token == 6 || *token == 8)
}
