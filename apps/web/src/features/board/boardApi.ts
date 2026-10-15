import {
  ApiError,
  requestJson,
  type ApiErrorFields,
} from '../../lib/apiClient'

const BOARD_GENERATION_PATH = '/api/v1/boards/generate'

const TERRAIN_VALUES = [
  'forest',
  'pasture',
  'fields',
  'hills',
  'mountains',
  'desert',
] as const

const RESOURCE_VALUES = ['lumber', 'wool', 'grain', 'brick', 'ore'] as const

export type Terrain = (typeof TERRAIN_VALUES)[number]
export type ResourceType = (typeof RESOURCE_VALUES)[number]

export type GenerateBoardRequest = {
  seed: string
  ruleset_key: 'base'
  map_key: 'standard'
}

export type BoardResponse = {
  data: BoardData
}

export type BoardData = {
  board_schema_version: string
  seed: string
  ruleset: BoardRuleset
  map: BoardMap
  hexes: BoardHex[]
  vertices: BoardVertex[]
  edges: BoardEdge[]
  ports: BoardPort[]
}

export type BoardRuleset = {
  key: string
  version: string
}

export type BoardMap = {
  key: string
  version: string
  orientation: string
}

export type BoardHex = {
  id: string
  q: number
  r: number
  terrain: Terrain
  number_token: number | null
  vertex_ids: string[]
}

export type BoardVertex = {
  id: string
  x: number
  y: number
}

export type BoardEdge = {
  id: string
  vertex_ids: [string, string]
}

export type BoardPort = {
  id: string
  edge_id: string
  resource_type: ResourceType | null
  trade_ratio: number
}

export type BoardErrorFields = ApiErrorFields

export class BoardApiError extends ApiError {
  constructor(
    message: string,
    code: string,
    status: number,
    fields?: BoardErrorFields,
  ) {
    super(message, code, status, fields)
    this.name = 'BoardApiError'
  }
}

export async function generateBoard(
  payload: GenerateBoardRequest,
): Promise<BoardResponse> {
  try {
    return await requestJson(BOARD_GENERATION_PATH, isBoardResponse, {
      method: 'POST',
      body: payload,
    })
  } catch (caught: unknown) {
    if (caught instanceof ApiError) {
      const message =
        caught.code === 'network_error'
          ? 'The board generation service is unavailable.'
          : caught.code === 'invalid_response'
            ? 'The board service returned an invalid response.'
            : caught.message

      throw new BoardApiError(message, caught.code, caught.status, caught.fields)
    }

    throw caught
  }
}

function isBoardResponse(value: unknown): value is BoardResponse {
  return isRecord(value) && isBoardData(value.data)
}

export function isBoardData(value: unknown): value is BoardData {
  if (!isRecord(value)) {
    return false
  }

  return (
    isString(value.board_schema_version) &&
    isString(value.seed) &&
    isBoardRuleset(value.ruleset) &&
    isBoardMap(value.map) &&
    isArrayOf(value.hexes, isBoardHex) &&
    isArrayOf(value.vertices, isBoardVertex) &&
    isArrayOf(value.edges, isBoardEdge) &&
    isArrayOf(value.ports, isBoardPort)
  )
}

function isBoardRuleset(value: unknown): value is BoardRuleset {
  return isRecord(value) && isString(value.key) && isString(value.version)
}

function isBoardMap(value: unknown): value is BoardMap {
  return (
    isRecord(value) &&
    isString(value.key) &&
    isString(value.version) &&
    isString(value.orientation)
  )
}

function isBoardHex(value: unknown): value is BoardHex {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isInteger(value.q) &&
    isInteger(value.r) &&
    isTerrain(value.terrain) &&
    (value.number_token === null || isInteger(value.number_token)) &&
    isArrayOf(value.vertex_ids, isString)
  )
}

function isBoardVertex(value: unknown): value is BoardVertex {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isInteger(value.x) &&
    isInteger(value.y)
  )
}

function isBoardEdge(value: unknown): value is BoardEdge {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isStringPair(value.vertex_ids)
  )
}

function isBoardPort(value: unknown): value is BoardPort {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.edge_id) &&
    (value.resource_type === null || isResourceType(value.resource_type)) &&
    isInteger(value.trade_ratio)
  )
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate)
}

function isStringPair(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 && value.every(isString)
}

function isTerrain(value: unknown): value is Terrain {
  return isOneOf(value, TERRAIN_VALUES)
}

function isResourceType(value: unknown): value is ResourceType {
  return isOneOf(value, RESOURCE_VALUES)
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
