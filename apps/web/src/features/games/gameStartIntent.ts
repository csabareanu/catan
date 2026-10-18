const STORAGE_KEY = 'catan.game-start-intent'

export type GameStartIntent = {
  ownerId: number
  creationKey: string
  seed: string
  aiCount: 2 | 3
  gameId: number | null
  operation: GameStartOperation
}

export type GameStartOperation = 'start' | 'save'

export function createGameStartIntent(
  ownerId: number,
  seed: string,
  aiCount: 2 | 3,
  operation: GameStartOperation = 'start',
): GameStartIntent {
  return {
    ownerId,
    creationKey: globalThis.crypto.randomUUID(),
    seed,
    aiCount,
    gameId: null,
    operation,
  }
}

export function readGameStartIntent(ownerId: number): GameStartIntent | null {
  try {
    const rawIntent = sessionStorage.getItem(STORAGE_KEY)

    if (rawIntent === null) {
      return null
    }

    const parsed: unknown = JSON.parse(rawIntent)

    if (!isGameStartIntent(parsed) || parsed.ownerId !== ownerId) {
      return null
    }

    return {
      ...parsed,
      operation: parsed.operation ?? 'start',
    }
  } catch {
    return null
  }
}

export function writeGameStartIntent(intent: GameStartIntent): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(intent))
  } catch {
    // The in-memory flow remains usable when browser storage is unavailable.
  }
}

export function clearGameStartIntent(ownerId: number): void {
  try {
    const intent = readGameStartIntent(ownerId)

    if (intent !== null) {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // There is no durable intent to clear when browser storage is unavailable.
  }
}

function isGameStartIntent(value: unknown): value is GameStartIntent {
  if (!isRecord(value)) {
    return false
  }

  return (
    isInteger(value.ownerId) &&
    typeof value.creationKey === 'string' &&
    value.creationKey.length > 0 &&
    typeof value.seed === 'string' &&
    (value.aiCount === 2 || value.aiCount === 3) &&
    (value.gameId === null || (isInteger(value.gameId) && value.gameId > 0)) &&
    (value.operation === undefined || value.operation === 'start' || value.operation === 'save')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}
