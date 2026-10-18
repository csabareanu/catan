import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { navigateTo } from '../../lib/navigation'
import type { BoardData } from '../board/boardApi'
import {
  createGame,
  getGame,
  startGameRun,
  type GameLifecycleStatus,
  type GameResource,
} from './gameApi'
import {
  clearGameStartIntent,
  createGameStartIntent,
  readGameStartIntent,
  writeGameStartIntent,
  type GameStartIntent,
} from './gameStartIntent'

type StartFailureAction = 'create' | 'save' | 'run' | 'refresh'

type StartFailure = {
  action: StartFailureAction
  error: ApiError
}

type StartPhase = 'idle' | 'creating' | 'starting' | 'checking' | 'ready' | 'mismatch' | 'error'

type UseGameStartOptions = {
  ownerId: number
  token: string
  seed: string
  aiCount: 2 | 3
  previewBoard: BoardData | null
  previewIsCurrent: boolean
  existingGameID?: number
  existingGame?: GameResource | null
  onUnauthorized: () => void
}

export type GameStartState = {
  phase: StartPhase
  intent: GameStartIntent | null
  authoritativeBoard: BoardData | null
  errorMessage: string | null
  recoveryAction: 'start' | 'save' | 'refresh' | null
  statusMessage: string | null
  isBusy: boolean
  isLocked: boolean
  canStart: boolean
  startLabel: string
  canSaveSetup: boolean
  saveLabel: string
  start: () => void
  saveSetup: () => void
  refreshStatus: () => void
  confirmBoard: () => void
}

const OBSERVER_READY_STATUSES: ReadonlySet<GameLifecycleStatus> = new Set([
  'queued',
  'running',
  'awaiting_human_input',
  'completed',
])

export function useGameStart({
  ownerId,
  token,
  seed,
  aiCount,
  previewBoard,
  previewIsCurrent,
  existingGameID,
  existingGame = null,
  onUnauthorized,
}: UseGameStartOptions): GameStartState {
  const [intent, setIntent] = useState<GameStartIntent | null>(() => (
    existingGameID === undefined ? readGameStartIntent(ownerId) : null
  ))
  const [phase, setPhase] = useState<StartPhase>('idle')
  const [failure, setFailure] = useState<StartFailure | null>(null)
  const [authoritativeBoard, setAuthoritativeBoard] = useState<BoardData | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const authoritativeGameRef = useRef<GameResource | null>(null)
  const recoveredGameIdRef = useRef<number | null>(null)
  const startAttemptedRef = useRef(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
      requestRef.current?.abort()
    }
  }, [])

  const updateIntent = useCallback((nextIntent: GameStartIntent) => {
    writeGameStartIntent(nextIntent)
    setIntent(nextIntent)
  }, [])

  const finishStart = useCallback((gameId: number) => {
    clearGameStartIntent(ownerId)
    setIntent(null)
    navigateTo(`/games/${gameId}/observe`)
  }, [ownerId])

  const finishSave = useCallback((gameId: number) => {
    clearGameStartIntent(ownerId)
    setIntent(null)
    setFailure(null)
    setAuthoritativeBoard(null)
    setPhase('idle')
    navigateTo(`/games/${gameId}/setup?saved=1`)
  }, [ownerId])

  const saveGameID = useCallback((currentIntent: GameStartIntent, gameId: number): GameStartIntent => {
    const nextIntent = { ...currentIntent, gameId }
    updateIntent(nextIntent)

    return nextIntent
  }, [updateIntent])

  const handleBoardMismatch = useCallback((game: GameResource) => {
    authoritativeGameRef.current = game
    setAuthoritativeBoard(game.board)
    setFailure(null)
    setPhase('mismatch')
  }, [])

  const startRunForGame = useCallback(async (
    game: GameResource,
    controller: AbortController,
  ): Promise<void> => {
    if (OBSERVER_READY_STATUSES.has(game.lifecycle_status)) {
      finishStart(game.id)
      return
    }

    setPhase('starting')
    const response = await startGameRun(
      token,
      game.id,
      onUnauthorized,
      controller.signal,
    )

    if (!isMountedRef.current || controller.signal.aborted) {
      return
    }

    if (OBSERVER_READY_STATUSES.has(response.data.lifecycle_status)) {
      finishStart(response.data.id)
      return
    }

    setFailure(null)
    setPhase('ready')
  }, [finishStart, onUnauthorized, token])

  const handleRequestFailure = useCallback((action: StartFailureAction, caught: unknown) => {
    if (!isMountedRef.current) {
      return
    }

    const error = caught instanceof ApiError
      ? caught
      : new ApiError(
        'The start request could not be completed. Please try again.',
        'unknown_error',
        0,
      )

    setFailure({ action, error })
    setPhase('error')
  }, [])

  const start = useCallback(async () => {
    if (
      requestRef.current !== null ||
      previewBoard === null ||
      !previewIsCurrent ||
      (existingGameID !== undefined && existingGame === null)
    ) {
      return
    }

    startAttemptedRef.current = true

    const storedIntent = existingGameID === undefined
      ? intent ?? readGameStartIntent(ownerId)
      : null
    if (
      storedIntent !== null &&
      (storedIntent.seed !== seed || storedIntent.aiCount !== aiCount)
    ) {
      setFailure({
        action: 'create',
        error: new ApiError(
          'This start request belongs to a different setup. Refresh the page to recover it.',
          'start_intent_mismatch',
          409,
        ),
      })
      setPhase('error')
      return
    }

    let currentIntent = storedIntent ?? createGameStartIntent(ownerId, seed, aiCount)
    let failureAction: StartFailureAction = existingGameID !== undefined
      ? 'run'
      : currentIntent.gameId === null
        ? 'create'
        : 'refresh'

    if (existingGameID === undefined && currentIntent.operation !== 'start') {
      currentIntent = { ...currentIntent, operation: 'start' }
    }

    if (existingGameID === undefined && (storedIntent === null || currentIntent.operation !== storedIntent.operation)) {
      updateIntent(currentIntent)
    }

    const controller = new AbortController()
    requestRef.current = controller
    setFailure(null)
    setAuthoritativeBoard(null)

    try {
      let game: GameResource

      if (existingGameID !== undefined) {
        setPhase('starting')
        game = existingGame as GameResource
      } else if (currentIntent.gameId === null) {
        setPhase('creating')
        const response = await createGame(
          token,
          {
            seed,
            ruleset_key: 'base',
            map_key: 'standard',
            ai_count: aiCount,
            creation_key: currentIntent.creationKey,
          },
          onUnauthorized,
          controller.signal,
        )

        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }

        currentIntent = saveGameID(currentIntent, response.data.id)
        game = response.data
      } else {
        setPhase('checking')
        const response = await getGame(
          token,
          currentIntent.gameId,
          onUnauthorized,
          controller.signal,
        )

        if (!isMountedRef.current || controller.signal.aborted) {
          return
        }

        game = response.data
      }

      if (!boardsMatch(previewBoard, game.board)) {
        handleBoardMismatch(game)
        return
      }

      failureAction = 'run'
      await startRunForGame(game, controller)
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        handleRequestFailure(failureAction, caught)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
      }
    }
  }, [
    aiCount,
    handleBoardMismatch,
    handleRequestFailure,
    intent,
    onUnauthorized,
    ownerId,
    previewBoard,
    previewIsCurrent,
    saveGameID,
    seed,
    startRunForGame,
    token,
    updateIntent,
    existingGame,
    existingGameID,
  ])

  const saveSetup = useCallback(async () => {
    if (
      requestRef.current !== null ||
      existingGameID !== undefined ||
      previewBoard === null ||
      !previewIsCurrent
    ) {
      return
    }

    const storedIntent = intent ?? readGameStartIntent(ownerId)
    if (storedIntent !== null && storedIntent.operation !== 'save') {
      return
    }

    if (
      storedIntent !== null &&
      (storedIntent.seed !== seed || storedIntent.aiCount !== aiCount)
    ) {
      setFailure({
        action: 'save',
        error: new ApiError(
          'This save request belongs to a different setup. Refresh the page to recover it.',
          'save_intent_mismatch',
          409,
        ),
      })
      setPhase('error')
      return
    }

    let currentIntent = storedIntent ?? createGameStartIntent(ownerId, seed, aiCount, 'save')
    if (currentIntent.gameId !== null) {
      finishSave(currentIntent.gameId)
      return
    }

    if (storedIntent === null) {
      updateIntent(currentIntent)
    }

    const controller = new AbortController()
    requestRef.current = controller
    setFailure(null)
    setAuthoritativeBoard(null)
    setPhase('creating')

    try {
      const response = await createGame(
        token,
        {
          seed,
          ruleset_key: 'base',
          map_key: 'standard',
          ai_count: aiCount,
          creation_key: currentIntent.creationKey,
        },
        onUnauthorized,
        controller.signal,
      )

      if (!isMountedRef.current || controller.signal.aborted) {
        return
      }

      currentIntent = saveGameID(currentIntent, response.data.id)

      if (!boardsMatch(previewBoard, response.data.board)) {
        handleBoardMismatch(response.data)
        return
      }

      finishSave(response.data.id)
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        handleRequestFailure('save', caught)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
      }
    }
  }, [
    aiCount,
    finishSave,
    handleBoardMismatch,
    handleRequestFailure,
    intent,
    onUnauthorized,
    ownerId,
    previewBoard,
    previewIsCurrent,
    saveGameID,
    seed,
    token,
    updateIntent,
    existingGameID,
  ])

  const refreshStatus = useCallback(async () => {
    if (requestRef.current !== null) {
      return
    }

    const currentIntent = existingGameID === undefined
      ? intent ?? readGameStartIntent(ownerId)
      : null
    const gameID = existingGameID ?? currentIntent?.gameId
    if (gameID === undefined || gameID === null) {
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setFailure(null)
    setPhase('checking')

    try {
      const response = await getGame(
        token,
        gameID,
        onUnauthorized,
        controller.signal,
      )

      if (!isMountedRef.current || controller.signal.aborted) {
        return
      }

      if (!boardsMatch(previewBoard, response.data.board)) {
        handleBoardMismatch(response.data)
        return
      }

      if (OBSERVER_READY_STATUSES.has(response.data.lifecycle_status)) {
        finishStart(response.data.id)
        return
      }

      setFailure(null)
      setPhase('ready')
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        handleRequestFailure('refresh', caught)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
      }
    }
  }, [
    finishStart,
    handleBoardMismatch,
    handleRequestFailure,
    intent,
    onUnauthorized,
    ownerId,
    previewBoard,
    token,
    existingGameID,
  ])

  const confirmBoard = useCallback(async () => {
    const game = authoritativeGameRef.current

    if (requestRef.current !== null || game === null) {
      return
    }

    startAttemptedRef.current = true

    if (intent?.operation === 'save') {
      finishSave(game.id)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setFailure(null)
    setPhase('starting')

    try {
      await startRunForGame(game, controller)
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        handleRequestFailure('run', caught)
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
      }
    }
  }, [finishSave, handleRequestFailure, intent, startRunForGame])

  useEffect(() => {
    const gameId = intent?.gameId

    if (
      gameId === undefined ||
      gameId === null ||
      previewBoard === null ||
      !previewIsCurrent ||
      startAttemptedRef.current ||
      recoveredGameIdRef.current === gameId
    ) {
      return
    }

    recoveredGameIdRef.current = gameId
    void refreshStatus()
  }, [intent?.gameId, previewBoard, previewIsCurrent, refreshStatus])

  const isBusy = phase === 'creating' || phase === 'starting' || phase === 'checking'
  const startIntentAllowsAction = intent === null || intent.operation === 'start'
  const canStart = previewBoard !== null && previewIsCurrent && !isBusy && startIntentAllowsAction && (
    existingGameID !== undefined
      ? existingGame !== null && (phase === 'idle' || phase === 'ready')
      : phase === 'idle' ||
        phase === 'ready' ||
        (phase === 'error' && failure?.action === 'create')
  )
  const canSaveSetup = existingGameID === undefined &&
    previewBoard !== null &&
    previewIsCurrent &&
    !isBusy &&
    (intent === null || intent.operation === 'save') &&
    (phase === 'idle' || (phase === 'error' && failure?.action === 'save'))
  const errorMessage = failure === null
    ? null
    : startFailureMessage(failure)
  const recoveryAction = failure?.action === 'create'
    ? 'start'
    : failure?.action === 'save'
      ? 'save'
      : failure === null
        ? null
        : 'refresh'

  return {
    phase,
    intent,
    authoritativeBoard,
    errorMessage,
    recoveryAction,
    statusMessage: phase === 'ready' && intent !== null && intent.gameId !== null
      ? 'The saved game is ready. Start it when you are ready.'
      : phase === 'ready' && existingGameID !== undefined
        ? 'The saved game is ready. Start it when you are ready.'
        : null,
    isBusy,
    isLocked: intent !== null || isBusy,
    canStart,
    startLabel: startButtonLabel(phase, intent, existingGameID),
    canSaveSetup,
    saveLabel: saveButtonLabel(phase, intent),
    start: () => void start(),
    saveSetup: () => void saveSetup(),
    refreshStatus: () => void refreshStatus(),
    confirmBoard: () => void confirmBoard(),
  }
}

function boardsMatch(left: BoardData | null, right: BoardData): boolean {
  return left !== null && boardFingerprint(left) === boardFingerprint(right)
}

function boardFingerprint(board: BoardData): string {
  return JSON.stringify({
    board_schema_version: board.board_schema_version,
    seed: board.seed,
    ruleset: board.ruleset,
    map: board.map,
    hexes: board.hexes.map((hex) => ({
      id: hex.id,
      q: hex.q,
      r: hex.r,
      terrain: hex.terrain,
      number_token: hex.number_token,
      vertex_ids: hex.vertex_ids,
    })),
    vertices: board.vertices.map((vertex) => ({
      id: vertex.id,
      x: vertex.x,
      y: vertex.y,
    })),
    edges: board.edges.map((edge) => ({
      id: edge.id,
      vertex_ids: edge.vertex_ids,
    })),
    ports: board.ports.map((port) => ({
      id: port.id,
      edge_id: port.edge_id,
      resource_type: port.resource_type,
      trade_ratio: port.trade_ratio,
    })),
  })
}

function startButtonLabel(
  phase: StartPhase,
  intent: GameStartIntent | null,
  existingGameID?: number,
): string {
  if (phase === 'creating') {
    return 'Saving game...'
  }

  if (phase === 'starting') {
    return 'Starting game...'
  }

  if (phase === 'checking') {
    return 'Checking saved game...'
  }

  if (
    phase === 'error' &&
    intent !== null &&
    intent.operation === 'start' &&
    intent.gameId === null
  ) {
    return 'Retry start safely'
  }

  return existingGameID !== undefined || (intent !== null && intent.gameId !== null)
    ? 'Start saved game'
    : 'Start game'
}

function saveButtonLabel(phase: StartPhase, intent: GameStartIntent | null): string {
  if (phase === 'creating' && intent?.operation === 'save') {
    return 'Saving setup...'
  }

  if (phase === 'error' && intent?.operation === 'save') {
    return 'Retry save safely'
  }

  return 'Save setup'
}

function startFailureMessage({ action, error }: StartFailure): string {
  if (action === 'create' && error.status === 0) {
    return 'The save may have succeeded. Retry safely with the same request.'
  }

  if ((action === 'run' || action === 'save') && error.status === 0) {
    if (action === 'save') {
      return 'The setup may have been saved. Retry safely with the same request.'
    }

    return 'The start request may have succeeded. Refresh the saved game before trying again.'
  }

  if (action === 'refresh' && error.status === 0) {
    return 'The saved game status could not be checked. Try again before starting.'
  }

  return error.message
}
