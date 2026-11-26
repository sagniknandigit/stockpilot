import { createContext, useContext } from 'react'

export interface AssistantContextValue {
  /** Open the panel, optionally asking `question` right away. */
  open: (question?: string) => void
}

export const AssistantContext = createContext<AssistantContextValue | null>(null)

export function useAssistant(): AssistantContextValue {
  const context = useContext(AssistantContext)
  if (!context) throw new Error('useAssistant must be used inside <AssistantProvider>')
  return context
}

export const STARTER_QUESTIONS = [
  'What will run out this week?',
  'Top 5 products by profit last 30 days',
  'Which products are slow movers?',
  'How did sales this week compare to last week?',
  'What should I reorder from Morning Dew Dairy?',
]
