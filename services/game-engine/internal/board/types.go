package board

import "errors"

var (
	// ErrInvalidSeed means a board seed is not canonical or is out of range.
	ErrInvalidSeed = errors.New("invalid board seed")
	// ErrUnsupportedRuleset means the requested ruleset is not implemented.
	ErrUnsupportedRuleset = errors.New("unsupported ruleset")
	// ErrUnsupportedMap means the requested map is not implemented.
	ErrUnsupportedMap = errors.New("unsupported map")
)

// Config selects the seed and supported board configuration.
type Config struct {
	Seed       string
	RulesetKey string
	MapKey     string
}

// Board is the deterministic board data generated from a Config.
type Board struct {
	Seed       string
	RulesetKey string
	MapKey     string
	Hexes      []Hex
}

// Hex is one tile in the board's axial coordinate grid.
type Hex struct {
	ID          string
	Q           int
	R           int
	Terrain     Terrain
	NumberToken *int
}

// Terrain identifies the resource terrain or desert on a hex.
type Terrain string

const (
	Forest    Terrain = "forest"
	Pasture   Terrain = "pasture"
	Fields    Terrain = "fields"
	Hills     Terrain = "hills"
	Mountains Terrain = "mountains"
	Desert    Terrain = "desert"
)
