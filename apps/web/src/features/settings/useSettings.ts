import { createContext, useContext } from 'react'
import type { BoardAppearance } from '../board/boardAppearance'

type Settings = {
  boardAppearance: BoardAppearance
  changeBoardAppearance: (appearance: BoardAppearance) => void
}

export const SettingsContext = createContext<Settings | null>(null)

export function useSettings(): Settings {
  const settings = useContext(SettingsContext)

  if (settings === null) {
    throw new Error('Settings must be used within SettingsProvider.')
  }

  return settings
}
