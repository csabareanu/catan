import { useState, type ReactNode } from 'react'
import {
  readBoardAppearance,
  saveBoardAppearance,
  type BoardAppearance,
} from '../board/boardAppearance'
import { SettingsContext } from './useSettings'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [boardAppearance, setBoardAppearance] = useState<BoardAppearance>(readBoardAppearance)

  const changeBoardAppearance = (appearance: BoardAppearance) => {
    setBoardAppearance(appearance)
    saveBoardAppearance(appearance)
  }

  return (
    <SettingsContext.Provider value={{ boardAppearance, changeBoardAppearance }}>
      {children}
    </SettingsContext.Provider>
  )
}
