import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import { getGame, startGameRun, type GameLifecycleStatus } from './gameApi'

const POLL_INTERVAL_MS = 2000

type RunAction = 'start' | 'refresh'

type RunFailure = {
  action: RunAction
  error: ApiError
}

type GameRunOptions = {
  gameId: number
  lifecycleStatus: GameLifecycleStatus
  token: string
  disabled: boolean
  onStatusChange: (gameId: number, status: GameLifecycleStatus) => void
  onUnauthorized: () => void
}

export function useGameRun({
  gameId,
  lifecycleStatus,
  token,
  disabled,
  onStatusChange,
  onUnauthorized,
}: GameRunOptions) {
  const [pendingAction, setPendingAction] = useState<RunAction | null>(null)
  const [failure, setFailure] = useState<RunFailure | null>(null)
  const actionRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => actionRequest.current?.abort()
  }, [])

  useEffect(() => {
    if (disabled || pendingAction !== null || failure !== null || !isActive(lifecycleStatus)) {
      return
    }

    const controller = new AbortController()
    let timerId: number | undefined

    const poll = async () => {
      try {
        const response = await getGame(token, gameId, onUnauthorized, controller.signal)

        if (controller.signal.aborted) {
          return
        }

        onStatusChange(gameId, response.data.lifecycle_status)

        if (isActive(response.data.lifecycle_status)) {
          timerId = window.setTimeout(() => void poll(), POLL_INTERVAL_MS)
        }
      } catch (caught: unknown) {
        if (!controller.signal.aborted) {
          setFailure({ action: 'refresh', error: asRunError(caught) })
        }
      }
    }

    timerId = window.setTimeout(() => void poll(), POLL_INTERVAL_MS)

    return () => {
      window.clearTimeout(timerId)
      controller.abort()
    }
  }, [disabled, failure, gameId, lifecycleStatus, onStatusChange, onUnauthorized, pendingAction, token])

  const request = async (action: RunAction) => {
    if (disabled || actionRequest.current !== null || (action === 'start' && failure !== null)) {
      return
    }

    const controller = new AbortController()
    actionRequest.current = controller
    setPendingAction(action)

    try {
      const response = action === 'start'
        ? await startGameRun(token, gameId, onUnauthorized, controller.signal)
        : await getGame(token, gameId, onUnauthorized, controller.signal)

      if (!controller.signal.aborted) {
        onStatusChange(gameId, response.data.lifecycle_status)
        setFailure(null)
      }
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setFailure({ action, error: asRunError(caught) })
      }
    } finally {
      if (!controller.signal.aborted) {
        actionRequest.current = null
        setPendingAction(null)
      }
    }
  }

  return {
    pendingAction,
    failure,
    startRun: () => request('start'),
    refreshStatus: () => request('refresh'),
  }
}

function isActive(status: GameLifecycleStatus): boolean {
  return status === 'queued' || status === 'running'
}

function asRunError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError('The run request could not be completed.', 'unknown_error', 0)
}
