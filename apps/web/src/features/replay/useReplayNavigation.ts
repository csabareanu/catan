import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import {
  getGameReplay,
  type ReplayEvent,
  type ReplayResponse,
} from './replayApi'

const POLL_INTERVAL_MS = 2000
const REPLAY_EVENT_PAGE_LIMIT = 25
const REFRESHABLE_LIFECYCLE_STATUSES = new Set(['queued', 'running'])

type ReplayLoadState = 'loading' | 'success' | 'error'

type UseReplayNavigationOptions = {
  gameID: number
  onUnauthorized: () => void
  token: string
}

export type ReplayNavigationResult = {
  errorMessage: string | null
  isLoadingMoreEvents: boolean
  isFollowingLatest: boolean
  loadState: ReplayLoadState
  loadMoreErrorMessage: string | null
  loadMoreEvents: () => void
  replay: ReplayResponse | null
  retry: () => void
  selectedCommandSequence: string | null
  selectCheckpoint: (commandSequence: string) => void
  selectLatest: () => void
}

export function useReplayNavigation({
  gameID,
  onUnauthorized,
  token,
}: UseReplayNavigationOptions): ReplayNavigationResult {
  const [replay, setReplay] = useState<ReplayResponse | null>(null)
  const [loadState, setLoadState] = useState<ReplayLoadState>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoadingMoreEvents, setIsLoadingMoreEvents] = useState(false)
  const [loadMoreErrorMessage, setLoadMoreErrorMessage] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedCommandSequence, setSelectedCommandSequence] = useState<string | null>(null)
  const replayRef = useRef<ReplayResponse | null>(null)
  const eventControllerRef = useRef<AbortController | null>(null)
  const eventRequestIDRef = useRef(0)

  useEffect(() => {
    replayRef.current = replay
  }, [replay])

  useEffect(() => {
    let isActive = true
    let timeoutID: number | null = null
    const controller = new AbortController()

    const loadReplay = async (preserveLoadedEvents: boolean): Promise<void> => {
      try {
        const response = await getGameReplay(token, gameID, {
          atCommandSequence: selectedCommandSequence ?? undefined,
          onUnauthorized,
          signal: controller.signal,
        })

        if (!isActive) {
          return
        }

        setReplay((currentReplay) => preserveLoadedEvents && currentReplay !== null
          ? mergeReplayRefresh(currentReplay, response)
          : response)
        setLoadState('success')
        setErrorMessage(null)

        if (shouldRefreshReplay(response.context.game.lifecycle_status)) {
          timeoutID = window.setTimeout(() => {
            void loadReplay(true)
          }, POLL_INTERVAL_MS)
        }
      } catch (caught: unknown) {
        if (
          !isActive ||
          controller.signal.aborted ||
          (caught instanceof ApiError && caught.status === 401)
        ) {
          return
        }

        setLoadState('error')
        setErrorMessage(toReplayErrorMessage(caught))
      }
    }

    void loadReplay(false)

    return () => {
      isActive = false

      if (timeoutID !== null) {
        window.clearTimeout(timeoutID)
      }

      controller.abort()
      eventControllerRef.current?.abort()
      eventControllerRef.current = null
      eventRequestIDRef.current += 1
    }
  }, [gameID, onUnauthorized, reloadKey, selectedCommandSequence, token])

  const loadMoreEvents = useCallback(() => {
    const currentReplay = replayRef.current
    const nextAfterSequence = currentReplay?.event_cursor.next_after_sequence

    if (
      currentReplay === null ||
      !currentReplay.event_cursor.has_more ||
      nextAfterSequence === null ||
      isLoadingMoreEvents
    ) {
      return
    }

    eventControllerRef.current?.abort()
    const controller = new AbortController()
    const requestID = eventRequestIDRef.current + 1
    eventRequestIDRef.current = requestID
    eventControllerRef.current = controller
    setIsLoadingMoreEvents(true)
    setLoadMoreErrorMessage(null)

    void getGameReplay(token, gameID, {
      atCommandSequence: selectedCommandSequence ?? undefined,
      afterEventSequence: nextAfterSequence,
      limit: REPLAY_EVENT_PAGE_LIMIT,
      onUnauthorized,
      signal: controller.signal,
    }).then((response) => {
      if (controller.signal.aborted || eventRequestIDRef.current !== requestID) {
        return
      }

      setReplay((currentReplay) => currentReplay === null
        ? response
        : mergeReplayPage(currentReplay, response))
      setIsLoadingMoreEvents(false)
      setLoadMoreErrorMessage(null)
      eventControllerRef.current = null
    }).catch((caught: unknown) => {
      if (
        controller.signal.aborted ||
        eventRequestIDRef.current !== requestID ||
        (caught instanceof ApiError && caught.status === 401)
      ) {
        return
      }

      setIsLoadingMoreEvents(false)
      setLoadMoreErrorMessage(toReplayErrorMessage(caught))
      eventControllerRef.current = null
    })
  }, [gameID, isLoadingMoreEvents, onUnauthorized, selectedCommandSequence, token])

  const retry = useCallback(() => {
    setErrorMessage(null)
    setIsLoadingMoreEvents(false)
    setLoadMoreErrorMessage(null)
    setLoadState('loading')
    setReloadKey((currentKey) => currentKey + 1)
  }, [])

  const selectCheckpoint = useCallback((commandSequence: string) => {
    setErrorMessage(null)
    setIsLoadingMoreEvents(false)
    setLoadMoreErrorMessage(null)
    setLoadState('loading')
    setSelectedCommandSequence(commandSequence)
  }, [])

  const selectLatest = useCallback(() => {
    setErrorMessage(null)
    setIsLoadingMoreEvents(false)
    setLoadMoreErrorMessage(null)
    setLoadState('loading')
    setSelectedCommandSequence(null)
  }, [])

  return {
    errorMessage,
    isLoadingMoreEvents,
    isFollowingLatest: selectedCommandSequence === null,
    loadState,
    loadMoreErrorMessage,
    loadMoreEvents,
    replay,
    retry,
    selectedCommandSequence,
    selectCheckpoint,
    selectLatest,
  }
}

function mergeReplayPage(
  currentReplay: ReplayResponse,
  response: ReplayResponse,
): ReplayResponse {
  return {
    ...response,
    events: mergeReplayEvents(currentReplay.events, response.events),
  }
}

function mergeReplayRefresh(
  currentReplay: ReplayResponse,
  response: ReplayResponse,
): ReplayResponse {
  const returnedThroughSequence = greatestSequence(
    currentReplay.event_cursor.returned_through_sequence,
    response.event_cursor.returned_through_sequence,
  )
  const hasMore = currentReplay.event_cursor.has_more || response.event_cursor.has_more

  return {
    ...response,
    events: mergeReplayEvents(currentReplay.events, response.events),
    event_cursor: {
      ...response.event_cursor,
      returned_through_sequence: returnedThroughSequence,
      has_more: hasMore,
      next_after_sequence: hasMore ? returnedThroughSequence : null,
    },
  }
}

function mergeReplayEvents(
  currentEvents: ReplayEvent[],
  incomingEvents: ReplayEvent[],
): ReplayEvent[] {
  const eventsBySequence = new Map<string, ReplayEvent>()

  for (const event of currentEvents) {
    eventsBySequence.set(event.sequence, event)
  }

  for (const event of incomingEvents) {
    eventsBySequence.set(event.sequence, event)
  }

  return [...eventsBySequence.values()].sort((left, right) =>
    compareDecimalStrings(left.sequence, right.sequence))
}

function greatestSequence(
  left: string | null,
  right: string | null,
): string | null {
  if (left === null) {
    return right
  }

  if (right === null) {
    return left
  }

  return compareDecimalStrings(left, right) >= 0 ? left : right
}

function compareDecimalStrings(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length
  }

  if (left === right) {
    return 0
  }

  return left < right ? -1 : 1
}

function shouldRefreshReplay(status: string): boolean {
  return REFRESHABLE_LIFECYCLE_STATUSES.has(status)
}

function toReplayErrorMessage(caught: unknown): string {
  if (!(caught instanceof ApiError)) {
    return 'The replay could not be loaded. Check the connection and try again.'
  }

  if (caught.status === 404) {
    return caught.message
  }

  if (caught.status === 422) {
    return caught.message
  }

  if (caught.status === 503) {
    return 'The replay service is unavailable right now. Please try again.'
  }

  if (caught.status === 0) {
    return 'The replay could not be reached. Check the connection and try again.'
  }

  if (caught.code === 'invalid_response') {
    return 'The replay service returned an invalid response. Please try again.'
  }

  return caught.message
}
