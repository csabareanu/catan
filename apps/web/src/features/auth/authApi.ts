import {
  requestJson,
  requestNoContent,
  isInteger,
  isNullableString,
  isRecord,
  isString,
  type ApiErrorFields,
} from '../../lib/apiClient'

const AUTH_PATH = '/api/v1/auth'

export type AuthenticatedUser = {
  id: number
  name: string
  email: string
  created_at: string | null
}

export type AuthTokenResponse = {
  data: {
    user: AuthenticatedUser
    token: string
    token_type: string
  }
}

export type CurrentUserResponse = {
  data: {
    user: AuthenticatedUser
  }
}

export type RegistrationInput = {
  name: string
  email: string
  password: string
  password_confirmation: string
  token_name?: string
}

export type LoginInput = {
  email: string
  password: string
  token_name?: string
}

export async function registerUser(
  input: RegistrationInput,
): Promise<AuthTokenResponse> {
  return requestJson(`${AUTH_PATH}/register`, isAuthTokenResponse, {
    method: 'POST',
    body: input,
  })
}

export async function loginUser(input: LoginInput): Promise<AuthTokenResponse> {
  return requestJson(`${AUTH_PATH}/login`, isAuthTokenResponse, {
    method: 'POST',
    body: input,
  })
}

export async function getCurrentUser(
  token: string,
  onUnauthorized?: () => void,
): Promise<CurrentUserResponse> {
  return requestJson(`${AUTH_PATH}/me`, isCurrentUserResponse, {
    token,
    onUnauthorized,
  })
}

export async function logoutUser(
  token: string,
  onUnauthorized?: () => void,
): Promise<void> {
  return requestNoContent(`${AUTH_PATH}/logout`, {
    method: 'POST',
    token,
    onUnauthorized,
  })
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  return (
    isRecord(value) &&
    isInteger(value.id) &&
    isString(value.name) &&
    isString(value.email) &&
    isNullableString(value.created_at)
  )
}

function isAuthTokenResponse(value: unknown): value is AuthTokenResponse {
  if (!isRecord(value) || !isRecord(value.data)) {
    return false
  }

  return (
    isAuthenticatedUser(value.data.user) &&
    isString(value.data.token) &&
    isString(value.data.token_type)
  )
}

function isCurrentUserResponse(value: unknown): value is CurrentUserResponse {
  return isRecord(value) && isRecord(value.data) && isAuthenticatedUser(value.data.user)
}

export type AuthFieldErrors = ApiErrorFields
