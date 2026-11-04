import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/apiClient'
import {
  getInitialPlacementOptions,
  submitInitialPlacement,
  type InitialPlacementCommandResponse,
  type InitialPlacementOption,
} from './replayApi'

const EMPTY_PLACEMENT_OPTIONS: InitialPlacementOption[] = []

type OptionsState = {
  requestKey: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  options: InitialPlacementOption[]
  errorMessage: string | null
  needsSavedGameRefresh: boolean
}

type SelectionState = {
  requestKey: string | null
  settlementVertexID: string | null
  roadEdgeID: string | null
}

type SubmissionState = {
  requestKey: string | null
  status: 'idle' | 'submitting' | 'accepted' | 'retry' | 'stale'
  errorMessage: string | null
}

type IdempotentAttempt = {
  requestKey: string
  settlementVertexID: string
  roadEdgeID: string
  key: string
}

type UseHumanInitialPlacementOptions = {
  enabled: boolean
  gameID: number
  token: string
  commandSequence: string
  activeSeatNumber: number
  round: number
  onUnauthorized: () => void
  onAccepted: (response: InitialPlacementCommandResponse) => void
  onStale: () => void
}

export function useHumanInitialPlacement({
  enabled,
  gameID,
  token,
  commandSequence,
  activeSeatNumber,
  round,
  onUnauthorized,
  onAccepted,
  onStale,
}: UseHumanInitialPlacementOptions) {
  const requestKey = enabled
    ? `${gameID}:${commandSequence}:${activeSeatNumber}:${round}`
    : null
  const [optionsState, setOptionsState] = useState<OptionsState>({
    requestKey: null,
    status: 'idle',
    options: [],
    errorMessage: null,
    needsSavedGameRefresh: false,
  })
  const [optionsRetry, setOptionsRetry] = useState(0)
  const [selection, setSelection] = useState<SelectionState>({
    requestKey: null,
    settlementVertexID: null,
    roadEdgeID: null,
  })
  const [submission, setSubmission] = useState<SubmissionState>({
    requestKey: null,
    status: 'idle',
    errorMessage: null,
  })
  const attemptRef = useRef<IdempotentAttempt | null>(null)
  const submissionInFlightRef = useRef<string | null>(null)
  const optionsAreCurrent = enabled && optionsState.requestKey === requestKey
  const options = optionsAreCurrent ? optionsState.options : EMPTY_PLACEMENT_OPTIONS
  const isLoadingOptions = enabled && (
    !optionsAreCurrent || optionsState.status === 'loading'
  )
  const hasOptionsError = optionsAreCurrent && optionsState.status === 'error'
  const isReady = enabled && optionsAreCurrent && optionsState.status === 'ready'
  const currentSelection = enabled && selection.requestKey === requestKey
    ? selection
    : null
  const selectedSettlementVertexID = currentSelection?.settlementVertexID ?? null
  const selectedRoadEdgeID = currentSelection?.roadEdgeID ?? null
  const selectedSettlementOptions = selectedSettlementVertexID === null
    ? []
    : options.filter((option) => option.settlement_vertex_id === selectedSettlementVertexID)
  const selectedPairIsLegal = selectedRoadEdgeID !== null &&
    selectedSettlementOptions.some((option) => option.road_edge_id === selectedRoadEdgeID)
  const currentSubmission = enabled && submission.requestKey === requestKey
    ? submission
    : null
  const isSubmitting = currentSubmission?.status === 'submitting'
  const hasAccepted = currentSubmission?.status === 'accepted'
  const needsSavedGameRefresh = currentSubmission?.status === 'stale' ||
    (hasOptionsError && optionsState.needsSavedGameRefresh)
  const canRetrySubmission = currentSubmission?.status === 'retry'
  const errorMessage = currentSubmission?.errorMessage ??
    (hasOptionsError ? optionsState.errorMessage : null)

  useEffect(() => {
    if (requestKey === null) {
      return
    }

    const controller = new AbortController()
    void getInitialPlacementOptions(token, gameID, onUnauthorized, controller.signal)
      .then((response) => {
        if (
          response.data.command_sequence !== commandSequence ||
          response.data.active_seat_number !== activeSeatNumber ||
          response.data.round !== round
        ) {
          throw new ApiError(
            'The saved game moved before the legal placement choices loaded.',
            'stale_initial_placement',
            409,
          )
        }

        setOptionsState({
          requestKey,
          status: 'ready',
          options: response.data.options,
          errorMessage: null,
          needsSavedGameRefresh: false,
        })
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setOptionsState({
          requestKey,
          status: 'error',
          options: [],
          errorMessage: toInitialPlacementErrorMessage(caught, 'options'),
          needsSavedGameRefresh: isStalePlacementError(caught),
        })
      })

    return () => controller.abort()
  }, [
    activeSeatNumber,
    commandSequence,
    gameID,
    onUnauthorized,
    optionsRetry,
    requestKey,
    round,
    token,
  ])

  const selectSettlement = useCallback((settlementVertexID: string) => {
    if (!isReady || !options.some((option) => option.settlement_vertex_id === settlementVertexID)) {
      return
    }

    setSelection({ requestKey, settlementVertexID, roadEdgeID: null })
    setSubmission({ requestKey, status: 'idle', errorMessage: null })
  }, [isReady, options, requestKey])

  const selectRoad = useCallback((roadEdgeID: string) => {
    if (!isReady || !options.some((option) =>
      option.settlement_vertex_id === selectedSettlementVertexID &&
      option.road_edge_id === roadEdgeID)) {
      return
    }

    setSelection({
      requestKey,
      settlementVertexID: selectedSettlementVertexID,
      roadEdgeID,
    })
    setSubmission({ requestKey, status: 'idle', errorMessage: null })
  }, [isReady, options, requestKey, selectedSettlementVertexID])

  const clearSelection = useCallback(() => {
    setSelection({ requestKey, settlementVertexID: null, roadEdgeID: null })
    setSubmission({ requestKey, status: 'idle', errorMessage: null })
  }, [requestKey])

  const retryOptions = useCallback(() => {
    if (requestKey === null) {
      return
    }

    setOptionsState({
      requestKey,
      status: 'loading',
      options: [],
      errorMessage: null,
      needsSavedGameRefresh: false,
    })
    setSelection({ requestKey, settlementVertexID: null, roadEdgeID: null })
    setSubmission({ requestKey, status: 'idle', errorMessage: null })
    setOptionsRetry((retry) => retry + 1)
  }, [requestKey])

  const submit = useCallback(async () => {
    if (
      requestKey === null ||
      !isReady ||
      !selectedSettlementVertexID ||
      !selectedRoadEdgeID ||
      !selectedPairIsLegal ||
      currentSubmission?.status === 'submitting' ||
      currentSubmission?.status === 'accepted' ||
      currentSubmission?.status === 'stale' ||
      submissionInFlightRef.current === requestKey
    ) {
      return
    }

    submissionInFlightRef.current = requestKey
    setSubmission({ requestKey, status: 'submitting', errorMessage: null })

    try {
      const currentAttempt = attemptRef.current
      const attempt = currentAttempt?.requestKey === requestKey &&
        currentAttempt.settlementVertexID === selectedSettlementVertexID &&
        currentAttempt.roadEdgeID === selectedRoadEdgeID
        ? currentAttempt
        : {
            requestKey,
            settlementVertexID: selectedSettlementVertexID,
            roadEdgeID: selectedRoadEdgeID,
            key: createIdempotencyKey(),
          }
      attemptRef.current = attempt

      const response = await submitInitialPlacement(
        token,
        gameID,
        {
          expected_command_sequence: commandSequence,
          settlement_vertex_id: selectedSettlementVertexID,
          road_edge_id: selectedRoadEdgeID,
        },
        attempt.key,
        onUnauthorized,
      )

      setSubmission({ requestKey, status: 'accepted', errorMessage: null })
      onAccepted(response)
    } catch (caught: unknown) {
      const isStale = isStalePlacementError(caught)
      setSubmission({
        requestKey,
        status: isStale ? 'stale' : 'retry',
        errorMessage: toInitialPlacementErrorMessage(caught, 'submission'),
      })

      if (isStale) {
        onStale()
      }
    } finally {
      if (submissionInFlightRef.current === requestKey) {
        submissionInFlightRef.current = null
      }
    }
  }, [
    commandSequence,
    currentSubmission?.status,
    gameID,
    isReady,
    onAccepted,
    onStale,
    onUnauthorized,
    requestKey,
    selectedPairIsLegal,
    selectedRoadEdgeID,
    selectedSettlementVertexID,
    token,
  ])

  return {
    canRetrySubmission: canRetrySubmission === true,
    clearSelection,
    errorMessage,
    hasAccepted: hasAccepted === true,
    hasOptionsError,
    isLoadingOptions,
    isReady,
    isSubmitting: isSubmitting === true,
    needsSavedGameRefresh: needsSavedGameRefresh === true,
    options,
    retryOptions,
    selectRoad,
    selectSettlement,
    selectedRoadEdgeID,
    selectedSettlementVertexID,
    selectedPairIsLegal,
    submit,
  }
}

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function isStalePlacementError(caught: unknown): boolean {
  return caught instanceof ApiError && (
    caught.code === 'stale_initial_placement' ||
    caught.code === 'initial_placement_not_available' ||
    caught.status === 409
  )
}

function toInitialPlacementErrorMessage(
  caught: unknown,
  phase: 'options' | 'submission',
): string {
  if (isStalePlacementError(caught)) {
    return 'The saved game has moved. Refresh the latest replay before choosing again.'
  }

  if (caught instanceof ApiError && caught.code === 'game_engine_unavailable') {
    return 'The game engine is unavailable right now. You can retry this placement safely.'
  }

  if (caught instanceof ApiError && caught.code === 'network_error') {
    return phase === 'submission'
      ? 'The request could not be confirmed. Retrying uses the same key, so it cannot place twice.'
      : 'The legal choices could not be loaded. Try again.'
  }

  if (caught instanceof ApiError && caught.code === 'invalid_response') {
    return 'The game server returned an unexpected placement response. Refresh the saved game to try again.'
  }

  return caught instanceof Error
    ? caught.message
    : 'The placement could not be completed. Please try again.'
}
