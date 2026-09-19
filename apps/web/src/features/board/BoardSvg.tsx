import type {
  BoardData,
  BoardEdge,
  BoardHex,
  BoardPort,
  ResourceType,
  Terrain,
} from './boardApi'

const HEX_RADIUS = 44
const LATTICE_X_SCALE = Math.sqrt(3) / 2
const LATTICE_Y_SCALE = 0.5
const VIEWBOX_PADDING = 72
const PORT_OFFSET = 26

const TERRAIN_LABELS: Record<Terrain, string> = {
  forest: 'Forest',
  pasture: 'Pasture',
  fields: 'Fields',
  hills: 'Hills',
  mountains: 'Mountains',
  desert: 'Desert',
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
  lumber: 'Lumber',
  wool: 'Wool',
  grain: 'Grain',
  brick: 'Brick',
  ore: 'Ore',
}

const TERRAIN_LEGEND: Terrain[] = [
  'forest',
  'pasture',
  'fields',
  'hills',
  'mountains',
  'desert',
]

type ScreenPoint = {
  x: number
  y: number
}

type LayoutBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BoardLayout = {
  boardCenter: ScreenPoint
  bounds: LayoutBounds
  hexCenters: Map<string, ScreenPoint>
  vertexPoints: Map<string, ScreenPoint>
  viewBox: string
}

type EdgePoints = [ScreenPoint, ScreenPoint]

export function BoardSvg({ board }: { board: BoardData }) {
  if (board.hexes.length === 0) {
    return (
      <div className="board-renderer board-renderer-empty" role="status">
        <p className="board-renderer-empty-title">No board geometry returned.</p>
        <p>The canonical response did not contain any hexes to draw.</p>
      </div>
    )
  }

  const layout = createLayout(board)
  const titleID = 'board-svg-title'
  const descriptionID = 'board-svg-description'

  return (
    <div className="board-renderer">
      <div className="board-svg-shell">
        <svg
          className="board-svg"
          viewBox={layout.viewBox}
          role="img"
          aria-labelledby={`${titleID} ${descriptionID}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <title id={titleID}>
            Standard Catan board generated from seed {board.seed}
          </title>
          <desc id={descriptionID}>
            A responsive pointy-top board with 19 terrain hexes, number tokens,
            logical edges, and nine trade ports.
          </desc>

          <rect
            className="board-svg-background"
            x={layout.bounds.x}
            y={layout.bounds.y}
            width={layout.bounds.width}
            height={layout.bounds.height}
            rx="18"
          />

          <g className="board-hex-layer">
            {board.hexes.map((hex) => renderHex(hex, layout))}
          </g>

          <g className="board-edge-layer" aria-hidden="true">
            {board.edges.map((edge) => renderEdge(edge, layout.vertexPoints))}
          </g>

          <g className="board-port-layer">
            {board.ports.map((port) => renderPort(port, board, layout))}
          </g>
        </svg>
      </div>

      <div className="board-legend" aria-label="Terrain legend">
        {TERRAIN_LEGEND.map((terrain) => (
          <span className="board-legend-item" key={terrain}>
            <span
              className={`board-legend-swatch board-hex-${terrain}`}
              aria-hidden="true"
            />
            <span>{TERRAIN_LABELS[terrain]}</span>
          </span>
        ))}
      </div>

      <p className="board-renderer-note">
        Ports use the perimeter edges supplied by the canonical topology.
      </p>
    </div>
  )
}

function createLayout(board: BoardData): BoardLayout {
  const vertexPoints = new Map(
    board.vertices.map((vertex) => [vertex.id, toScreenPoint(vertex.x, vertex.y)]),
  )
  const hexCenters = new Map(
    board.hexes.map((hex) => [hex.id, axialCenter(hex.q, hex.r)]),
  )
  const points = [...vertexPoints.values(), ...hexCenters.values()]
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const bounds = {
    x: minX - VIEWBOX_PADDING,
    y: minY - VIEWBOX_PADDING,
    width: maxX - minX + VIEWBOX_PADDING * 2,
    height: maxY - minY + VIEWBOX_PADDING * 2,
  }

  return {
    boardCenter: {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
    },
    bounds,
    hexCenters,
    vertexPoints,
    viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
  }
}

function toScreenPoint(x: number, y: number): ScreenPoint {
  return {
    x: x * HEX_RADIUS * LATTICE_X_SCALE,
    y: y * HEX_RADIUS * LATTICE_Y_SCALE,
  }
}

function axialCenter(q: number, r: number): ScreenPoint {
  return toScreenPoint(2 * q + r, 3 * r)
}

function renderHex(hex: BoardHex, layout: BoardLayout) {
  const center = layout.hexCenters.get(hex.id)
  const points = hex.vertex_ids
    .map((vertexID) => layout.vertexPoints.get(vertexID))
    .filter((point): point is ScreenPoint => point !== undefined)

  if (!center || points.length !== 6) {
    return null
  }

  const hasNumberToken = hex.number_token !== null
  const isHighProbability = hex.number_token === 6 || hex.number_token === 8
  const terrainLabel = TERRAIN_LABELS[hex.terrain]
  const tokenLabel = hasNumberToken
    ? `, number token ${hex.number_token}`
    : ', no number token'

  return (
    <g className={`board-hex-group board-hex-group-${hex.terrain}`} key={hex.id}>
      <title>
        {terrainLabel} hex at {hex.q}, {hex.r}
        {tokenLabel}
      </title>
      <polygon
        className={`board-hex board-hex-${hex.terrain}`}
        data-hex-id={hex.id}
        points={pointsToAttribute(points)}
      />
      {hasNumberToken && (
        <g
          className={`number-token${isHighProbability ? ' number-token-red' : ''}`}
          transform={`translate(${center.x} ${center.y})`}
        >
          <circle className="number-token-disc" r="14" />
          <text className="number-token-value" textAnchor="middle" y="5">
            {hex.number_token}
          </text>
          {isHighProbability && (
            <circle className="number-token-pip" cy="20" r="1.7" />
          )}
        </g>
      )}
      <text
        className="board-hex-label"
        x={center.x}
        y={center.y + (hasNumberToken ? 29 : 5)}
        textAnchor="middle"
      >
        {terrainLabel}
      </text>
    </g>
  )
}

function renderEdge(
  edge: BoardEdge,
  vertexPoints: Map<string, ScreenPoint>,
) {
  const points = edgePoints(edge, vertexPoints)

  if (!points) {
    return null
  }

  return (
    <line
      className="board-edge"
      data-edge-id={edge.id}
      key={edge.id}
      x1={points[0].x}
      y1={points[0].y}
      x2={points[1].x}
      y2={points[1].y}
    />
  )
}

function renderPort(port: BoardPort, board: BoardData, layout: BoardLayout) {
  const edge = board.edges.find((candidate) => candidate.id === port.edge_id)
  const points = edge ? edgePoints(edge, layout.vertexPoints) : null

  if (!points) {
    return null
  }

  const midpoint = {
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  }
  const direction = {
    x: midpoint.x - layout.boardCenter.x,
    y: midpoint.y - layout.boardCenter.y,
  }
  const distance = Math.hypot(direction.x, direction.y) || 1
  const marker = {
    x: midpoint.x + (direction.x / distance) * PORT_OFFSET,
    y: midpoint.y + (direction.y / distance) * PORT_OFFSET,
  }
  const label = port.resource_type
    ? `2:1 ${RESOURCE_LABELS[port.resource_type]}`
    : '3:1'
  const labelWidth = Math.max(42, label.length * 6.3 + 18)

  return (
    <g className="board-port" data-port-id={port.id} key={port.id}>
      <title>
        {port.resource_type
          ? `${RESOURCE_LABELS[port.resource_type]} port, trade ratio ${port.trade_ratio} to 1`
          : `Generic port, trade ratio ${port.trade_ratio} to 1`}
      </title>
      <line
        className="board-port-connector"
        x1={midpoint.x}
        y1={midpoint.y}
        x2={marker.x}
        y2={marker.y}
      />
      <rect
        className="board-port-badge"
        x={marker.x - labelWidth / 2}
        y={marker.y - 11}
        width={labelWidth}
        height="22"
        rx="7"
      />
      <text
        className="board-port-label"
        x={marker.x}
        y={marker.y + 4}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  )
}

function edgePoints(
  edge: BoardEdge,
  vertexPoints: Map<string, ScreenPoint>,
): EdgePoints | null {
  const first = vertexPoints.get(edge.vertex_ids[0])
  const second = vertexPoints.get(edge.vertex_ids[1])

  return first && second ? [first, second] : null
}

function pointsToAttribute(points: ScreenPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}
