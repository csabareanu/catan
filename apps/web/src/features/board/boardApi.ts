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

export type BoardErrorFields = Record<string, string[]>

export class BoardApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: BoardErrorFields

  constructor(
    message: string,
    code: string,
    status: number,
    fields?: BoardErrorFields,
  ) {
    super(message)
    this.name = 'BoardApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

export async function generateBoard(
  payload: GenerateBoardRequest,
): Promise<BoardResponse> {
  let response: Response

  try {
    response = await fetch(BOARD_GENERATION_PATH, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new BoardApiError(
      'The board generation service is unavailable.',
      'service_unavailable',
      0,
    )
  }

  const body = await readJson(response)

  if (!response.ok) {
    throw toApiError(body, response.status)
  }

  if (!isBoardResponse(body)) {
    throw new BoardApiError(
      'The board service returned an invalid response.',
      'invalid_response',
      response.status,
    )
  }

  return body
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function toApiError(body: unknown, status: number): BoardApiError {
  if (isApiErrorBody(body)) {
    return new BoardApiError(
      body.error.message,
      body.error.code,
      status,
      body.error.fields,
    )
  }

  return new BoardApiError(
    'The board request could not be completed.',
    'request_failed',
    status,
  )
}

function isBoardResponse(value: unknown): value is BoardResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false
  }

  const data = value.data

  return (
    isString(data.board_schema_version) &&
    isString(data.seed) &&
    isBoardRuleset(data.ruleset) &&
    isBoardMap(data.map) &&
    isArrayOf(data.hexes, isBoardHex) &&
    isArrayOf(data.vertices, isBoardVertex) &&
    isArrayOf(data.edges, isBoardEdge) &&
    isArrayOf(data.ports, isBoardPort)
  )
}

function isApiErrorBody(
  value: unknown,
): value is { error: { code: string; message: string; fields?: BoardErrorFields } } {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false
  }

  const error = value.error

  return (
    isString(error.code) &&
    isString(error.message) &&
    (error.fields === undefined || isBoardErrorFields(error.fields))
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

function isBoardErrorFields(value: unknown): value is BoardErrorFields {
  return isRecord(value) && isArrayOfRecordValues(value, isStringArray)
}

function isArrayOf<T>(value: unknown, predicate: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(predicate)
}

function isArrayOfRecordValues(
  value: Record<string, unknown>,
  predicate: (item: unknown) => boolean,
): boolean {
  return Object.values(value).every(predicate)
}

function isStringPair(value: unknown): value is [string, string] {
  return Array.isArray(value) && value.length === 2 && value.every(isString)
}

function isStringArray(value: unknown): value is string[] {
  return isArrayOf(value, isString)
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
