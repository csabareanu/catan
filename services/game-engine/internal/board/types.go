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
	Vertices   []Vertex
	Edges      []Edge
	Ports      []Port
}

// Hex is one tile in the board's axial coordinate grid.
type Hex struct {
	ID          string
	Q           int
	R           int
	Terrain     Terrain
	NumberToken *int
	VertexIDs   []string
}

// Vertex is a board corner in integer logical-lattice coordinates, not pixels.
type Vertex struct {
	ID string
	X  int
	Y  int
}

// Edge is one side of a hex, identified by its two canonical endpoint IDs.
type Edge struct {
	ID        string
	VertexIDs [2]string
}

// Resource identifies the resource traded at a specific 2:1 port.
type Resource string

const (
	Lumber Resource = "lumber"
	Wool   Resource = "wool"
	Grain  Resource = "grain"
	Brick  Resource = "brick"
	Ore    Resource = "ore"
)

// Port is a trade location on one perimeter edge. A nil ResourceType is a
// generic 3:1 port; resource-specific ports trade at 2:1.
type Port struct {
	ID           string
	EdgeID       string
	ResourceType *Resource
	TradeRatio   int
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
