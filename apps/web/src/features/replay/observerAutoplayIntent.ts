const STORAGE_KEY_PREFIX = 'catan.observer-autoplay-intent.v1'

export function markObserverAutoplayIntent(ownerId: number, gameID: number): void {
  try {
    window.sessionStorage.setItem(storageKey(ownerId, gameID), '1')
  } catch {
    // The start flow remains usable when browser storage is unavailable.
  }
}

export function consumeObserverAutoplayIntent(ownerId: number, gameID: number): boolean {
  try {
    const key = storageKey(ownerId, gameID)

    if (window.sessionStorage.getItem(key) !== '1') {
      return false
    }

    window.sessionStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

function storageKey(ownerId: number, gameID: number): string {
  return `${STORAGE_KEY_PREFIX}:${ownerId}:${gameID}`
}
