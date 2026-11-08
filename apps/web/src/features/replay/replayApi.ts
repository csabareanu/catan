import { isBoardData } from '../board/boardApi'
import type { BoardData } from '../board/boardApi'
import {
  requestJson,
  isInteger,
  isNullableString,
  isRecord,
  isString,
} from '../../lib/apiClient'

export type ReplayEvent = {
  sequence: string
  event_type: string
  payload: Record<string, unknown>
  occurred_at: string | null
}

export type ReplaySnapshotIndexEntry = {
  command_sequence: string
  event_sequence: string
  state_schema_version: string
  created_at: string | null
}

export type ReplayPublicProjectionSchemaVersion =
  | 'replay-public-v1'
  | 'replay-public-v2'
  | 'replay-public-v3'
export type ReplayViewerProjectionSchemaVersion = 'replay-viewer-v1'

export type ReplayFrame = {
  command_sequence: string
  event_sequence: string
  state_schema_version: string
  public_projection_schema_version: ReplayPublicProjectionSchemaVersion
  public_state: Record<string, unknown>
  viewer_projection_schema_version?: ReplayViewerProjectionSchemaVersion | null
  viewer_state: Record<string, unknown> | null
}

export type ReplayContext = {
  game: {
    id: number
    mode: string
    lifecycle_status: string
    ruleset_key: string
    ruleset_version: string
    state_schema_version: string | null
    seed: string
    seat_count: number
    human_seat_number: number | null
    started_at: string | null
    completed_at: string | null
    created_at: string | null
  }
  board: BoardData
  seats: Array<{
    seat_number: number
    controller_type: string
    label: string | null
  }>
}

export type ReplayResponse = {
  schema_version: 'replay-v1'
  context: ReplayContext
  events: ReplayEvent[]
  event_cursor: {
    requested_after_sequence: string
    returned_through_sequence: string | null
    has_more: boolean
    next_after_sequence: string | null
  }
  snapshot_index: ReplaySnapshotIndexEntry[]
  frame: ReplayFrame | null
}

export type InitialPlacementOption = {
  settlement_vertex_id: string
  road_edge_id: string
}

export type InitialPlacementOptionsResponse = {
  schema_version: 'initial-placement-options-v1'
  data: {
    command_sequence: string
    active_seat_number: number
    round: number
    options: InitialPlacementOption[]
  }
}

export type InitialPlacementCommandResponse = {
  schema_version: 'initial-placement-command-v1'
  data: {
    replayed: boolean
    lifecycle_status: string
    last_command_sequence: string
    last_event_sequence: string
  }
}

export type ReplayRequestOptions = {
  atCommandSequence?: string
  afterEventSequence?: string
  limit?: number
}

type GetGameReplayOptions = ReplayRequestOptions & {
  onUnauthorized?: () => void
  signal?: AbortSignal
}

export async function getGameReplay(
  token: string,
  gameID: number,
  {
    atCommandSequence,
    afterEventSequence,
    limit,
    onUnauthorized,
    signal,
  }: GetGameReplayOptions = {},
): Promise<ReplayResponse> {
  if (isMultiEventReplayMockEnabled()) {
    const { getMultiEventReplay } = await import('./replayMock')

    return getMultiEventReplay(gameID, {
      atCommandSequence,
      afterEventSequence,
      signal,
    })
  }

  const query = new URLSearchParams()

  if (atCommandSequence !== undefined) {
    query.set('at_command_sequence', atCommandSequence)
  }

  if (afterEventSequence !== undefined) {
    query.set('after_event_sequence', afterEventSequence)
  }

  if (limit !== undefined) {
    query.set('limit', String(limit))
  }

  const queryString = query.toString()
  const replayPath = `/api/v1/games/${gameID}/replay${queryString === '' ? '' : `?${queryString}`}`

  return requestJson(
    replayPath,
    isReplayResponse,
    { token, onUnauthorized, signal },
  )
}

export async function getInitialPlacementOptions(
  token: string,
  gameID: number,
  onUnauthorized?: () => void,
  signal?: AbortSignal,
): Promise<InitialPlacementOptionsResponse> {
  return requestJson(
    `/api/v1/games/${gameID}/initial-placement/options`,
    isInitialPlacementOptionsResponse,
    { token, onUnauthorized, signal },
  )
}

export async function submitInitialPlacement(
  token: string,
  gameID: number,
  command: {
    expected_command_sequence: string
    settlement_vertex_id: string
    road_edge_id: string
  },
  idempotencyKey: string,
  onUnauthorized?: () => void,
): Promise<InitialPlacementCommandResponse> {
  return requestJson(
    `/api/v1/games/${gameID}/initial-placement`,
    isInitialPlacementCommandResponse,
    {
      method: 'POST',
      body: command,
      headers: { 'Idempotency-Key': idempotencyKey },
      token,
      onUnauthorized,
    },
  )
}

function isMultiEventReplayMockEnabled(): boolean {
  return import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mock') === 'multi-events'
}

function isReplayResponse(value: unknown): value is ReplayResponse {
  return (
    isRecord(value) &&
    value.schema_version === 'replay-v1' &&
    isReplayContext(value.context) &&
    Array.isArray(value.events) &&
    value.events.every(isReplayEvent) &&
    isReplayCursor(value.event_cursor) &&
    Array.isArray(value.snapshot_index) &&
    value.snapshot_index.every(isReplaySnapshotIndexEntry) &&
    (value.frame === null || isReplayFrame(value.frame))
  )
}

function isInitialPlacementOptionsResponse(
  value: unknown,
): value is InitialPlacementOptionsResponse {
  return (
    isRecord(value) &&
    value.schema_version === 'initial-placement-options-v1' &&
    isRecord(value.data) &&
    isDecimalSequence(value.data.command_sequence) &&
    isPositiveInteger(value.data.active_seat_number) &&
    isPositiveInteger(value.data.round) &&
    Array.isArray(value.data.options) &&
    value.data.options.every(isInitialPlacementOption)
  )
}

function isInitialPlacementCommandResponse(
  value: unknown,
): value is InitialPlacementCommandResponse {
  return (
    isRecord(value) &&
    value.schema_version === 'initial-placement-command-v1' &&
    isRecord(value.data) &&
    typeof value.data.replayed === 'boolean' &&
    isString(value.data.lifecycle_status) &&
    isDecimalSequence(value.data.last_command_sequence) &&
    isDecimalSequence(value.data.last_event_sequence)
  )
}

function isInitialPlacementOption(value: unknown): value is InitialPlacementOption {
  return (
    isRecord(value) &&
    isNonEmptyString(value.settlement_vertex_id) &&
    isNonEmptyString(value.road_edge_id)
  )
}

function isDecimalSequence(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim() !== ''
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0
}

function isReplayContext(value: unknown): value is ReplayContext {
  if (!isRecord(value) || !isReplayGameContext(value.game)) {
    return false
  }

  return (
    isBoardData(value.board) &&
    Array.isArray(value.seats) &&
    value.seats.every(isReplaySeat)
  )
}

function isReplayGameContext(value: unknown): value is ReplayContext['game'] {
  return (
    isRecord(value) &&
    isInteger(value.id) &&
    isString(value.mode) &&
    isString(value.lifecycle_status) &&
    isString(value.ruleset_key) &&
    isString(value.ruleset_version) &&
    isNullableString(value.state_schema_version) &&
    isString(value.seed) &&
    isInteger(value.seat_count) &&
    (value.human_seat_number === null || isInteger(value.human_seat_number)) &&
    isNullableString(value.started_at) &&
    isNullableString(value.completed_at) &&
    isNullableString(value.created_at)
  )
}

function isReplaySeat(value: unknown): value is ReplayContext['seats'][number] {
  return (
    isRecord(value) &&
    isInteger(value.seat_number) &&
    isString(value.controller_type) &&
    isNullableString(value.label)
  )
}

function isReplayEvent(value: unknown): value is ReplayEvent {
  return (
    isRecord(value) &&
    isString(value.sequence) &&
    isString(value.event_type) &&
    isRecord(value.payload) &&
    isNullableString(value.occurred_at)
  )
}

function isReplayCursor(value: unknown): value is ReplayResponse['event_cursor'] {
  return (
    isRecord(value) &&
    isString(value.requested_after_sequence) &&
    isNullableString(value.returned_through_sequence) &&
    typeof value.has_more === 'boolean' &&
    isNullableString(value.next_after_sequence)
  )
}

function isReplaySnapshotIndexEntry(
  value: unknown,
): value is ReplaySnapshotIndexEntry {
  return (
    isRecord(value) &&
    isString(value.command_sequence) &&
    isString(value.event_sequence) &&
    isString(value.state_schema_version) &&
    isNullableString(value.created_at)
  )
}

function isReplayFrame(value: unknown): value is ReplayFrame {
  return (
    isRecord(value) &&
    isString(value.command_sequence) &&
    isString(value.event_sequence) &&
    isString(value.state_schema_version) &&
    isReplayPublicProjectionSchemaVersion(value.public_projection_schema_version) &&
    isRecord(value.public_state) &&
    (value.viewer_projection_schema_version === undefined ||
      value.viewer_projection_schema_version === null ||
      isReplayViewerProjectionSchemaVersion(value.viewer_projection_schema_version)) &&
    (value.viewer_state === null || isRecord(value.viewer_state))
  )
}

function isReplayPublicProjectionSchemaVersion(
  value: unknown,
): value is ReplayPublicProjectionSchemaVersion {
  return value === 'replay-public-v1' ||
    value === 'replay-public-v2' ||
    value === 'replay-public-v3'
}

function isReplayViewerProjectionSchemaVersion(
  value: unknown,
): value is ReplayViewerProjectionSchemaVersion {
  return value === 'replay-viewer-v1'
}
