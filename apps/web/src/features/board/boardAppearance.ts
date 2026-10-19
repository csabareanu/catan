export type BoardAppearance = 'classic' | 'illustrated'

export const BOARD_APPEARANCE_STORAGE_KEY = 'catan.board-appearance.v1'

export function readBoardAppearance(): BoardAppearance {
  if (typeof window === 'undefined') {
    return 'classic'
  }

  try {
    const storedAppearance: unknown = window.localStorage.getItem(BOARD_APPEARANCE_STORAGE_KEY)

    return isBoardAppearance(storedAppearance) ? storedAppearance : 'classic'
  } catch {
    return 'classic'
  }
}

export function saveBoardAppearance(appearance: BoardAppearance): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(BOARD_APPEARANCE_STORAGE_KEY, appearance)
  } catch {
    return
  }
}

function isBoardAppearance(value: unknown): value is BoardAppearance {
  return value === 'classic' || value === 'illustrated'
}
