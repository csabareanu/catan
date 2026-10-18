import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import type { BoardData } from './boardApi'

const MIN_BOARD_ZOOM = 1
const MAX_BOARD_ZOOM = 4
const BOARD_ZOOM_FACTOR = 1.25

export type ScreenPoint = {
  x: number
  y: number
}

export type LayoutBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type BoardLayout = {
  boardCenter: ScreenPoint
  bounds: LayoutBounds
  hexCenters: Map<string, ScreenPoint>
  vertexPoints: Map<string, ScreenPoint>
  viewBox: string
}

export type BoardViewState = {
  seed: string
  zoom: number
  x: number
  y: number
}

type BoardPointer = ScreenPoint

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

type BoardViewportOptions = {
  board: BoardData
  layout: BoardLayout | null
}

export type BoardViewport = {
  boardShellRef: RefObject<HTMLDivElement | null>
  boardView: BoardViewState
  viewBox: string
  canZoomIn: boolean
  canZoomOut: boolean
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  handleDoubleClick: (event: MouseEvent<HTMLDivElement>) => void
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  handlePointerCancel: (event: PointerEvent<HTMLDivElement>) => void
  handlePointerDown: (event: PointerEvent<HTMLDivElement>) => void
  handlePointerMove: (event: PointerEvent<HTMLDivElement>) => void
  handlePointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

export function useBoardViewport({ board, layout }: BoardViewportOptions): BoardViewport {
  const hasBoard = layout !== null
  const [viewState, setViewState] = useState<BoardViewState>(() =>
    layout
      ? createFittedBoardView(board.seed, layout)
      : { seed: board.seed, zoom: MIN_BOARD_ZOOM, x: 0, y: 0 },
  )
  const boardView = layout && viewState.seed === board.seed
    ? viewState
    : layout
      ? createFittedBoardView(board.seed, layout)
      : viewState
  const viewStateRef = useRef(boardView)
  const boardShellRef = useRef<HTMLDivElement | null>(null)
  const boardLayoutRef = useRef<BoardLayout | null>(layout)
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
  const updateBoardView = (nextView: BoardViewState) => {
    viewStateRef.current = nextView
    setViewState(nextView)
  }

  useLayoutEffect(() => {
    viewStateRef.current = boardView
    boardLayoutRef.current = layout
    boardSeedRef.current = board.seed
  }, [board.seed, boardView, layout])

  useLayoutEffect(() => {
    const shell = boardShellRef.current

    if (!shell || !hasBoard) {
      return
    }

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        return
      }

      const currentLayout = boardLayoutRef.current
      const seed = boardSeedRef.current

      if (!currentLayout || !seed) {
        return
      }

      event.preventDefault()
      const rect = shell.getBoundingClientRect()
      const current = viewStateRef.current.seed === seed
        ? viewStateRef.current
        : createFittedBoardView(seed, currentLayout)
      const zoomFactor = Math.pow(1.002, -event.deltaY)
      const nextZoom = clampBoardZoom(current.zoom * zoomFactor)
      const nextView = createViewAroundPoint(
        currentLayout,
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

      updateBoardView(nextView)
    }

    shell.addEventListener('wheel', handleNativeWheel, { passive: false })

    return () => {
      shell.removeEventListener('wheel', handleNativeWheel)
    }
  }, [hasBoard])

  const currentBoardView = () =>
    viewStateRef.current.seed === board.seed ? viewStateRef.current : boardView

  const zoomAroundPoint = (nextZoom: number, point: BoardPointer) => {
    if (!layout) {
      return
    }

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

  const resetZoom = () => {
    if (layout) {
      updateBoardView(createFittedBoardView(board.seed, layout))
    }
  }

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
    if (event.target instanceof HTMLButtonElement || !layout) {
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

    if (!shell || !layout) {
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

    if (!shell || !layout || !gesture.pointers.has(event.pointerId)) {
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

  return {
    boardShellRef,
    boardView,
    viewBox: layout ? createBoardViewBox(layout, boardView) : '',
    canZoomIn: hasBoard && boardView.zoom < MAX_BOARD_ZOOM,
    canZoomOut: hasBoard && boardView.zoom > MIN_BOARD_ZOOM,
    zoomIn,
    zoomOut,
    resetZoom,
    handleDoubleClick,
    handleKeyDown,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
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
