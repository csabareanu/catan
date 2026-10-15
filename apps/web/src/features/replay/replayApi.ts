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

export type ReplayFrame = {
  command_sequence: string
  event_sequence: string
  state_schema_version: string
  public_projection_schema_version: string
  public_state: Record<string, unknown>
  viewer_projection_schema_version?: string | null
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

export async function getGameReplay(
  token: string,
  gameID: number,
  onUnauthorized?: () => void,
  signal?: AbortSignal,
): Promise<ReplayResponse> {
  return requestJson(
    `/api/v1/games/${gameID}/replay`,
    isReplayResponse,
    { token, onUnauthorized, signal },
  )
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
    isString(value.public_projection_schema_version) &&
    isRecord(value.public_state) &&
    (value.viewer_projection_schema_version === undefined ||
      isNullableString(value.viewer_projection_schema_version)) &&
    (value.viewer_state === null || isRecord(value.viewer_state))
  )
}
