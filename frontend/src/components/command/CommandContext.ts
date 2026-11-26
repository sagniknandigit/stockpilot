import { createContext, useContext } from 'react'

export interface CommandPaletteContextValue {
  open: () => void
}

export const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null)

export function useCommandPalette(): CommandPaletteContextValue {
  const context = useContext(CommandPaletteContext)
  if (!context) throw new Error('useCommandPalette must be used inside <CommandPaletteProvider>')
  return context
}
