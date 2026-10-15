export type ApiErrorFields = Record<string, string[]>

type ApiRequestOptions = {
  method?: 'DELETE' | 'GET' | 'POST'
  body?: unknown
  token?: string
  onUnauthorized?: () => void
  signal?: AbortSignal
}

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly fields?: ApiErrorFields

  constructor(
    message: string,
    code: string,
    status: number,
    fields?: ApiErrorFields,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.fields = fields
  }
}

export async function requestJson<T>(
  path: string,
  isResponse: (value: unknown) => value is T,
  options: ApiRequestOptions = {},
): Promise<T> {
  const response = await sendRequest(path, options)
  const body = await readJson(response, options.signal)

  if (!response.ok) {
    const error = toApiError(body, response.status)

    if (response.status === 401) {
      options.onUnauthorized?.()
    }

    throw error
  }

  if (!isResponse(body)) {
    throw new ApiError(
      'The API returned an invalid response.',
      'invalid_response',
      response.status,
    )
  }

  return body
}

export async function requestNoContent(
  path: string,
  options: ApiRequestOptions = {},
): Promise<void> {
  const response = await sendRequest(path, options)

  if (!response.ok) {
    const error = toApiError(await readJson(response, options.signal), response.status)

    if (response.status === 401) {
      options.onUnauthorized?.()
    }

    throw error
  }

  if (response.status !== 204) {
    throw new ApiError(
      'The API returned an invalid response.',
      'invalid_response',
      response.status,
    )
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

async function sendRequest(
  path: string,
  options: ApiRequestOptions,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (options.token !== undefined) {
    headers.Authorization = `Bearer ${options.token}`
  }

  try {
    return await fetch(path, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (caught: unknown) {
    if (options.signal?.aborted) {
      throw caught
    }

    throw new ApiError(
      'The API request could not be completed.',
      'network_error',
      0,
    )
  }
}

async function readJson(response: Response, signal?: AbortSignal): Promise<unknown> {
  try {
    return await response.json()
  } catch (caught: unknown) {
    if (signal?.aborted) {
      throw caught
    }

    return null
  }
}

function toApiError(body: unknown, status: number): ApiError {
  if (isApiErrorBody(body)) {
    return new ApiError(
      body.error.message,
      body.error.code,
      status,
      body.error.fields,
    )
  }

  return new ApiError(
    'The API request could not be completed.',
    'request_failed',
    status,
  )
}

function isApiErrorBody(
  value: unknown,
): value is {
  error: { code: string; message: string; fields?: ApiErrorFields }
} {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false
  }

  const error = value.error

  return (
    isString(error.code) &&
    isString(error.message) &&
    (error.fields === undefined || isErrorFields(error.fields))
  )
}

function isErrorFields(value: unknown): value is ApiErrorFields {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) && messages.every((message) => isString(message)),
    )
  )
}
