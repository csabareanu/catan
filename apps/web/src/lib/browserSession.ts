const SESSION_TOKEN_KEY = 'catan.api-token'

export function readSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY)
  } catch {
    return null
  }
}

export function writeSessionToken(token: string): void {
  window.sessionStorage.setItem(SESSION_TOKEN_KEY, token)
}

export function clearSessionToken(): void {
  try {
    window.sessionStorage.removeItem(SESSION_TOKEN_KEY)
  } catch {
    // A blocked storage area already behaves like an empty browser session.
  }
}
