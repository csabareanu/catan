import { isBoardData } from '../board/boardApi'
import type { BoardData } from '../board/boardApi'
import {
  requestJson,
  requestNoContent,
  isInteger,
  isNullableString,
  isRecord,
  isString,
} from '../../lib/apiClient'

const GAMES_PATH = '/api/v1/games'

const LIFECYCLE_STATUSES = [
  'created',
  'queued',
  'running',
  'awaiting_human_input',
  'completed',
  'failed',
] as const

export type GameLifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]

export type GameSummary = {
  id: number
  owner_id: number
  mode: string
  seed: string
  ruleset: { key: string; version: string }
  map: { key: string; version: string; orientation: string }
  seat_count: number
  human_seat_number: number | null
  lifecycle_status: GameLifecycleStatus
  configuration: Record<string, unknown>
  created_at: string | null
  updated_at: string | null
}

type GameCore = Omit<GameSummary, 'updated_at'>
type GameRecord = GameCore & Record<string, unknown>

export type GameSeat = {
  seat_number: number
  controller_type: string
  user_id: number | null
  label: string | null
}

export type GameResource = GameCore & {
  board: BoardData
  seats: GameSeat[]
}

export type GameListPagination = {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export type GameListResponse = {
  data: GameSummary[]
  links: Record<string, unknown>
  meta: GameListPagination
}

export type GameResponse = {
  data: GameResource
}

export type CreateGameInput = {
  creation_key?: string
  seed: string
  ruleset_key: 'base'
  map_key: 'standard'
  ai_count: 2 | 3
}

export async function listGames(
  token: string,
  onUnauthorized?: () => void,
  page = 1,
  signal?: AbortSignal,
): Promise<GameListResponse> {
  const path = page === 1 ? GAMES_PATH : `${GAMES_PATH}?page=${page}`

  return requestJson(path, isGameListResponse, {
    token,
    onUnauthorized,
    signal,
  })
}

export async function createGame(
  token: string,
  input: CreateGameInput,
  onUnauthorized?: () => void,
  signal?: AbortSignal,
): Promise<GameResponse> {
  return requestJson(GAMES_PATH, isGameResponse, {
    method: 'POST',
    body: input,
    token,
    onUnauthorized,
    signal,
  })
}

export async function getGame(
  token: string,
  gameID: number,
  onUnauthorized?: () => void,
  signal?: AbortSignal,
): Promise<GameResponse> {
  return requestJson(`${GAMES_PATH}/${gameID}`, isGameResponse, {
    token,
    onUnauthorized,
    signal,
  })
}

export async function startGameRun(
  token: string,
  gameID: number,
  onUnauthorized?: () => void,
  signal?: AbortSignal,
): Promise<GameResponse> {
  return requestJson(`${GAMES_PATH}/${gameID}/run`, isGameResponse, {
    method: 'POST',
    token,
    onUnauthorized,
    signal,
  })
}

export async function deleteGame(
  token: string,
  gameID: number,
  onUnauthorized?: () => void,
): Promise<void> {
  return requestNoContent(`${GAMES_PATH}/${gameID}`, {
    method: 'DELETE',
    token,
    onUnauthorized,
  })
}

function isGameListResponse(value: unknown): value is GameListResponse {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isGameSummary) &&
    isRecord(value.links) &&
    isGameListPagination(value.meta)
  )
}

function isGameListPagination(value: unknown): value is GameListPagination {
  return (
    isRecord(value) &&
    isInteger(value.current_page) && value.current_page >= 1 &&
    isInteger(value.last_page) && value.last_page >= 1 &&
    isInteger(value.per_page) && value.per_page >= 1 &&
    isInteger(value.total) && value.total >= 0
  )
}

function isGameResponse(value: unknown): value is GameResponse {
  return isRecord(value) && isGameResource(value.data)
}

function isGameSummary(value: unknown): value is GameSummary {
  return isRecord(value) && isGameCore(value) && isNullableString(value.updated_at)
}

function isGameResource(value: unknown): value is GameResource {
  return (
    isRecord(value) &&
    isGameCore(value) &&
    isBoardData(value.board) &&
    Array.isArray(value.seats) &&
    value.seats.every(isGameSeat)
  )
}

function isGameCore(
  value: unknown,
): value is GameRecord {
  if (!isRecord(value)) {
    return false
  }

  return (
    isInteger(value.id) &&
    isInteger(value.owner_id) &&
    isString(value.mode) &&
    isString(value.seed) &&
    isGameRuleset(value.ruleset) &&
    isGameMap(value.map) &&
    isInteger(value.seat_count) &&
    (value.human_seat_number === null || isInteger(value.human_seat_number)) &&
    isGameLifecycleStatus(value.lifecycle_status) &&
    isRecord(value.configuration) &&
    isNullableString(value.created_at)
  )
}

function isGameRuleset(
  value: unknown,
): value is { key: string; version: string } {
  return isRecord(value) && isString(value.key) && isString(value.version)
}

function isGameMap(
  value: unknown,
): value is { key: string; version: string; orientation: string } {
  return (
    isRecord(value) &&
    isString(value.key) &&
    isString(value.version) &&
    isString(value.orientation)
  )
}

function isGameSeat(value: unknown): value is GameSeat {
  return (
    isRecord(value) &&
    isInteger(value.seat_number) &&
    isString(value.controller_type) &&
    (value.user_id === null || isInteger(value.user_id)) &&
    isNullableString(value.label)
  )
}

function isGameLifecycleStatus(value: unknown): value is GameLifecycleStatus {
  return (
    isString(value) &&
    (LIFECYCLE_STATUSES as readonly string[]).includes(value)
  )
}
