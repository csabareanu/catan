import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
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
const MIN_BOARD_ZOOM = 1
const MAX_BOARD_ZOOM = 4
const BOARD_ZOOM_FACTOR = 1.25

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

const RESOURCE_SYMBOLS: Record<ResourceType, string> = {
  lumber: '↟',
  wool: '✦',
  grain: '✣',
  brick: '▰',
  ore: '◈',
}

type TerrainPresentation = {
  resourceType: ResourceType | null
  symbol: string
}

const TERRAIN_PRESENTATION: Record<Terrain, TerrainPresentation> = {
  forest: { resourceType: 'lumber', symbol: RESOURCE_SYMBOLS.lumber },
  pasture: { resourceType: 'wool', symbol: RESOURCE_SYMBOLS.wool },
  fields: { resourceType: 'grain', symbol: RESOURCE_SYMBOLS.grain },
  hills: { resourceType: 'brick', symbol: RESOURCE_SYMBOLS.brick },
  mountains: { resourceType: 'ore', symbol: RESOURCE_SYMBOLS.ore },
  desert: { resourceType: null, symbol: '—' },
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

type BoardViewState = {
  seed: string
  zoom: number
  x: number
  y: number
}

type BoardPointer = {
  x: number
  y: number
}

type BoardGesture = {
  pointers: Map<number, BoardPointer>
  mode: 'pan' | 'pinch' | null
  startPoint: BoardPointer | null
  startView: BoardViewState | null
  moved: boolean
  initialDistance: number
  initialZoom: number
  initialWorldPoint: ScreenPoint | null
}

type EdgePoints = [ScreenPoint, ScreenPoint]

export function BoardSvg({ board }: { board: BoardData }) {
  const hasBoard = board.hexes.length > 0
  const initialLayout = hasBoard ? createLayout(board) : null
  const [viewState, setViewState] = useState<BoardViewState>(() =>
    initialLayout
      ? createFittedBoardView(board.seed, initialLayout)
      : { seed: board.seed, zoom: MIN_BOARD_ZOOM, x: 0, y: 0 },
  )
  const boardView = initialLayout && viewState.seed === board.seed
    ? viewState
    : initialLayout
      ? createFittedBoardView(board.seed, initialLayout)
      : viewState
  const { seed: boardViewSeed, zoom: boardViewZoom, x: boardViewX, y: boardViewY } = boardView
  const viewStateRef = useRef(boardView)
  const boardShellRef = useRef<HTMLDivElement>(null)
  const boardLayoutRef = useRef<BoardLayout | null>(initialLayout)
  const boardSeedRef = useRef(board.seed)
  const gestureRef = useRef<BoardGesture>({
    pointers: new Map(),
    mode: null,
    startPoint: null,
    startView: null,
    moved: false,
    initialDistance: 0,
    initialZoom: MIN_BOARD_ZOOM,
    initialWorldPoint: null,
  })
  const lastTouchTapRef = useRef<{ point: BoardPointer; timestamp: number } | null>(null)
  const lastTouchZoomRef = useRef(0)

  useLayoutEffect(() => {
    viewStateRef.current = {
      seed: boardViewSeed,
      zoom: boardViewZoom,
      x: boardViewX,
      y: boardViewY,
    }
    boardLayoutRef.current = initialLayout
    boardSeedRef.current = board.seed
  }, [board.seed, boardViewSeed, boardViewZoom, boardViewX, boardViewY, initialLayout])

  useLayoutEffect(() => {
    const shell = boardShellRef.current

    if (!shell || !hasBoard) {
      return
    }

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        return
      }

      const layout = boardLayoutRef.current
      const seed = boardSeedRef.current

      if (!layout || !seed) {
        return
      }

      event.preventDefault()
      const rect = shell.getBoundingClientRect()
      const current = viewStateRef.current.seed === seed
        ? viewStateRef.current
        : createFittedBoardView(seed, layout)
      const zoomFactor = Math.pow(1.002, -event.deltaY)
      const nextZoom = clampBoardZoom(current.zoom * zoomFactor)
      const nextView = createViewAroundPoint(
        layout,
        seed,
        current,
        nextZoom,
        {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        },
        shell.clientWidth,
        shell.clientHeight,
      )

      viewStateRef.current = nextView
      setViewState(nextView)
    }

    shell.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      shell.removeEventListener('wheel', handleNativeWheel)
    }
  }, [hasBoard])

  if (!initialLayout) {
    return (
      <div className="board-renderer board-renderer-empty" role="status">
        <p className="board-renderer-empty-title">No board tiles to display.</p>
        <p>The preview did not include any terrain tiles.</p>
      </div>
    )
  }

  const layout = initialLayout
  const titleID = 'board-svg-title'
  const descriptionID = 'board-svg-description'

  const updateBoardView = (nextView: BoardViewState) => {
    viewStateRef.current = nextView
    setViewState(nextView)
  }

  const currentBoardView = () =>
    viewStateRef.current.seed === board.seed ? viewStateRef.current : boardView

  const zoomAroundPoint = (nextZoom: number, point: BoardPointer) => {
    const shell = boardShellRef.current

    if (!shell) {
      return
    }

    const current = currentBoardView()
    const nextView = createViewAroundPoint(
      layout,
      board.seed,
      current,
      nextZoom,
      point,
      shell.clientWidth,
      shell.clientHeight,
    )

    updateBoardView(nextView)
  }

  const zoomIn = () => {
    const current = currentBoardView()
    zoomAroundPoint(Math.min(MAX_BOARD_ZOOM, current.zoom * BOARD_ZOOM_FACTOR), getViewportCenter(boardShellRef.current))
  }

  const zoomOut = () => {
    const current = currentBoardView()
    zoomAroundPoint(Math.max(MIN_BOARD_ZOOM, current.zoom / BOARD_ZOOM_FACTOR), getViewportCenter(boardShellRef.current))
  }

  const resetZoom = () => updateBoardView(createFittedBoardView(board.seed, layout))

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('button')) {
      return
    }

    if (performance.now() - lastTouchZoomRef.current < 500) {
      return
    }

    event.preventDefault()
    const shell = boardShellRef.current

    if (!shell) {
      return
    }

    const rect = shell.getBoundingClientRect()
    const current = currentBoardView()
    zoomAroundPoint(Math.min(MAX_BOARD_ZOOM, current.zoom * BOARD_ZOOM_FACTOR), {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLButtonElement) {
      return
    }

    const shell = boardShellRef.current

    if (!shell) {
      return
    }

    const current = currentBoardView()
    if (event.key === 'Home') {
      event.preventDefault()
      resetZoom()
      return
    }

    if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      zoomIn()
      return
    }

    if (event.key === '-' || event.key === '_') {
      event.preventDefault()
      zoomOut()
      return
    }

    const panFactor = event.shiftKey ? 0.8 : 0.25
    const viewBox = getViewBoxDimensions(layout, current.zoom)
    const panDirection = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      PageUp: { x: 0, y: -4 },
      PageDown: { x: 0, y: 4 },
    }[event.key]

    if (!panDirection) {
      return
    }

    event.preventDefault()
    updateBoardView(createPannedBoardView(
      layout,
      current,
      panDirection.x * viewBox.width * panFactor,
      panDirection.y * viewBox.height * panFactor,
    ))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    if (event.target instanceof Element && event.target.closest('button')) {
      return
    }

    const shell = boardShellRef.current

    if (!shell) {
      return
    }

    const gesture = gestureRef.current
    const point = { x: event.clientX, y: event.clientY }
    gesture.pointers.set(event.pointerId, point)
    event.currentTarget.setPointerCapture(event.pointerId)

    if (gesture.pointers.size === 1) {
      gesture.mode = 'pan'
      gesture.startPoint = point
      gesture.startView = currentBoardView()
      gesture.moved = false
      return
    }

    if (gesture.pointers.size === 2) {
      const points = [...gesture.pointers.values()]
      const midpoint = midpointOf(points[0], points[1])
      const rect = shell.getBoundingClientRect()
      const current = currentBoardView()
      gesture.mode = 'pinch'
      gesture.moved = true
      gesture.initialDistance = distanceBetween(points[0], points[1])
      gesture.initialZoom = current.zoom
      gesture.initialWorldPoint = worldPointAtViewport(
        layout,
        current,
        { x: midpoint.x - rect.left, y: midpoint.y - rect.top },
        shell.clientWidth,
        shell.clientHeight,
      )
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const shell = boardShellRef.current
    const gesture = gestureRef.current

    if (!shell || !gesture.pointers.has(event.pointerId)) {
      return
    }

    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (gesture.mode === 'pan' && gesture.pointers.size === 1 && gesture.startPoint && gesture.startView) {
      const deltaX = event.clientX - gesture.startPoint.x
      const deltaY = event.clientY - gesture.startPoint.y
      gesture.moved = gesture.moved || Math.hypot(deltaX, deltaY) >= 6
      const viewBox = getViewBoxDimensions(layout, gesture.startView.zoom)
      updateBoardView(createPannedBoardView(
        layout,
        gesture.startView,
        -deltaX * viewBox.width / shell.clientWidth,
        -deltaY * viewBox.height / shell.clientHeight,
      ))
      return
    }

    if (gesture.pointers.size < 2) {
      return
    }

    const points = [...gesture.pointers.values()]
    const midpoint = midpointOf(points[0], points[1])
    const distance = distanceBetween(points[0], points[1])
    const rect = shell.getBoundingClientRect()
    const nextZoom = clampBoardZoom(
      gesture.initialZoom * (distance / Math.max(gesture.initialDistance, 1)),
    )

    if (gesture.initialWorldPoint) {
      updateBoardView(createViewAroundWorldPoint(
        layout,
        board.seed,
        nextZoom,
        gesture.initialWorldPoint,
        { x: midpoint.x - rect.left, y: midpoint.y - rect.top },
        shell.clientWidth,
        shell.clientHeight,
      ))
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    const point = gesture.pointers.get(event.pointerId)
    const wasSinglePointerTap = gesture.pointers.size === 1 && gesture.mode === 'pan' &&
      !gesture.moved && point && gesture.startPoint
      ? distanceBetween(point, gesture.startPoint) < 12
      : false

    gesture.pointers.delete(event.pointerId)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (wasSinglePointerTap && point && event.pointerType === 'touch') {
      const now = performance.now()
      const previousTap = lastTouchTapRef.current
      const isDoubleTap = previousTap && now - previousTap.timestamp < 320 &&
        distanceBetween(previousTap.point, point) < 28

      if (isDoubleTap) {
        const shell = boardShellRef.current

        if (shell) {
          lastTouchZoomRef.current = now
          const rect = shell.getBoundingClientRect()
          const current = currentBoardView()
          zoomAroundPoint(Math.min(MAX_BOARD_ZOOM, current.zoom * BOARD_ZOOM_FACTOR), {
            x: point.x - rect.left,
            y: point.y - rect.top,
          })
        }

        lastTouchTapRef.current = null
      } else {
        lastTouchTapRef.current = { point, timestamp: now }
      }
    }

    if (gesture.pointers.size === 1) {
      const remainingPoint = [...gesture.pointers.values()][0]
      gesture.mode = 'pan'
      gesture.startPoint = remainingPoint
      gesture.startView = currentBoardView()
      gesture.moved = true
    } else if (gesture.pointers.size === 0) {
      gesture.mode = null
      gesture.startPoint = null
      gesture.startView = null
      gesture.initialWorldPoint = null
    }
  }

  const handlePointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    gesture.pointers.delete(event.pointerId)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (gesture.pointers.size === 0) {
      gesture.mode = null
      gesture.startPoint = null
      gesture.startView = null
      gesture.initialWorldPoint = null
    }
  }

  return (
    <div className="board-renderer">
      <div
        ref={boardShellRef}
        className="board-svg-shell"
        role="region"
        aria-label="Interactive board viewport"
        tabIndex={0}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          className="board-svg"
          viewBox={createBoardViewBox(layout, boardView)}
          role="img"
          aria-labelledby={`${titleID} ${descriptionID}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <title id={titleID}>
            Standard Catan board generated from seed {board.seed}
          </title>
          <desc id={descriptionID}>
            A Catan board with terrain hexes, number tokens, and trade ports.
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
        <div className="board-svg-controls" role="toolbar" aria-label="Board view controls">
          <button
            className="board-svg-control"
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={zoomOut}
            disabled={boardView.zoom <= MIN_BOARD_ZOOM}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            className="board-svg-control board-svg-fit-control"
            type="button"
            aria-label="Fit board"
            title="Fit board"
            onClick={resetZoom}
            disabled={boardView.zoom <= MIN_BOARD_ZOOM}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4" />
            </svg>
          </button>
          <button
            className="board-svg-control"
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={zoomIn}
            disabled={boardView.zoom >= MAX_BOARD_ZOOM}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span className="board-svg-zoom-status" aria-live="polite">
            Board zoom {Math.round(boardView.zoom * 100)}%
          </span>
        </div>
      </div>

      <BoardHelp />
    </div>
  )
}

export function BoardHelp() {
  return (
    <>
      <div className="board-legend" aria-label="Terrain and resource guide" role="list">
        {TERRAIN_LEGEND.map((terrain) => (
          <span className="board-legend-item" key={terrain} role="listitem">
            <span
              className={`board-legend-swatch board-legend-swatch-${terrain}`}
              aria-hidden="true"
            />
            <span className="board-legend-symbol" aria-hidden="true">
              {TERRAIN_PRESENTATION[terrain].symbol}
            </span>
            <span className="board-legend-copy">
              <strong>{TERRAIN_LABELS[terrain]}</strong>
              <small>
                {TERRAIN_PRESENTATION[terrain].resourceType
                  ? RESOURCE_LABELS[TERRAIN_PRESENTATION[terrain].resourceType as ResourceType]
                  : 'No production'}
              </small>
            </span>
          </span>
        ))}
      </div>

      <p className="board-renderer-note">
        Number tokens show production rolls. Resource symbols identify output;
        coastal markers show trade rates.
      </p>
    </>
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

function createFittedBoardView(seed: string, layout: BoardLayout): BoardViewState {
  return {
    seed,
    zoom: MIN_BOARD_ZOOM,
    x: layout.bounds.x,
    y: layout.bounds.y,
  }
}

function createBoardViewBox(layout: BoardLayout, view: BoardViewState): string {
  const dimensions = getViewBoxDimensions(layout, view.zoom)
  return `${view.x} ${view.y} ${dimensions.width} ${dimensions.height}`
}

function getViewBoxDimensions(layout: BoardLayout, zoom: number): Pick<LayoutBounds, 'width' | 'height'> {
  return {
    width: layout.bounds.width / zoom,
    height: layout.bounds.height / zoom,
  }
}

function createViewAroundPoint(
  layout: BoardLayout,
  seed: string,
  current: BoardViewState,
  nextZoom: number,
  point: BoardPointer,
  viewportWidth: number,
  viewportHeight: number,
): BoardViewState {
  const worldPoint = worldPointAtViewport(layout, current, point, viewportWidth, viewportHeight)
  return createViewAroundWorldPoint(
    layout,
    seed,
    nextZoom,
    worldPoint,
    point,
    viewportWidth,
    viewportHeight,
  )
}

function createViewAroundWorldPoint(
  layout: BoardLayout,
  seed: string,
  nextZoom: number,
  worldPoint: ScreenPoint,
  viewportPoint: BoardPointer,
  viewportWidth: number,
  viewportHeight: number,
): BoardViewState {
  const dimensions = getViewBoxDimensions(layout, nextZoom)
  const x = worldPoint.x - (viewportPoint.x / Math.max(viewportWidth, 1)) * dimensions.width
  const y = worldPoint.y - (viewportPoint.y / Math.max(viewportHeight, 1)) * dimensions.height

  return {
    seed,
    zoom: nextZoom,
    x: clampBoardOrigin(layout, nextZoom, x, 'x'),
    y: clampBoardOrigin(layout, nextZoom, y, 'y'),
  }
}

function createPannedBoardView(
  layout: BoardLayout,
  current: BoardViewState,
  deltaX: number,
  deltaY: number,
): BoardViewState {
  return {
    ...current,
    x: clampBoardOrigin(layout, current.zoom, current.x + deltaX, 'x'),
    y: clampBoardOrigin(layout, current.zoom, current.y + deltaY, 'y'),
  }
}

function worldPointAtViewport(
  layout: BoardLayout,
  view: BoardViewState,
  viewportPoint: BoardPointer,
  viewportWidth: number,
  viewportHeight: number,
): ScreenPoint {
  const dimensions = getViewBoxDimensions(layout, view.zoom)
  return {
    x: view.x + (viewportPoint.x / Math.max(viewportWidth, 1)) * dimensions.width,
    y: view.y + (viewportPoint.y / Math.max(viewportHeight, 1)) * dimensions.height,
  }
}

function clampBoardOrigin(
  layout: BoardLayout,
  zoom: number,
  value: number,
  axis: 'x' | 'y',
): number {
  const dimensions = getViewBoxDimensions(layout, zoom)
  const start = axis === 'x' ? layout.bounds.x : layout.bounds.y
  const total = axis === 'x' ? layout.bounds.width : layout.bounds.height
  const visible = axis === 'x' ? dimensions.width : dimensions.height

  return Math.min(Math.max(value, start), start + total - visible)
}

function clampBoardZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_BOARD_ZOOM), MAX_BOARD_ZOOM)
}

function getViewportCenter(shell: HTMLDivElement | null): BoardPointer {
  return {
    x: (shell?.clientWidth ?? 0) / 2,
    y: (shell?.clientHeight ?? 0) / 2,
  }
}

function midpointOf(first: BoardPointer, second: BoardPointer): BoardPointer {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function distanceBetween(first: BoardPointer, second: BoardPointer): number {
  return Math.hypot(second.x - first.x, second.y - first.y)
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
  const terrainPresentation = TERRAIN_PRESENTATION[hex.terrain]
  const resourceLabel = terrainPresentation.resourceType
    ? RESOURCE_LABELS[terrainPresentation.resourceType]
    : terrainLabel
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
      <g
        className="board-resource-marker"
        transform={`translate(${center.x} ${center.y + (hasNumberToken ? -27 : -7)})`}
      >
        <title>
          {terrainPresentation.resourceType
            ? `${resourceLabel} resource from ${terrainLabel}`
            : `${terrainLabel}, no resource production`}
        </title>
        <text className="board-resource-symbol" textAnchor="middle" y="5">
          {terrainPresentation.symbol}
        </text>
      </g>
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
        y={center.y + (hasNumberToken ? 29 : 16)}
        textAnchor="middle"
      >
        {resourceLabel}
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
    ? `${port.trade_ratio}:1 ${RESOURCE_SYMBOLS[port.resource_type]} ${RESOURCE_LABELS[port.resource_type]}`
    : `${port.trade_ratio}:1 Generic`
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
