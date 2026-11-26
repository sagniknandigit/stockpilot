import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AssistantContext } from './AssistantContext'
import { AssistantPanel, type ChatMessage, type PendingQuestion } from './AssistantPanel'

/** Owns the conversation so it survives closing and reopening the panel. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null)
  const clearPending = useCallback(() => setPendingQuestion(null), [])

  const value = useMemo(
    () => ({
      open: (question?: string) => {
        setOpen(true)
        if (question) setPendingQuestion({ id: Date.now(), text: question })
      },
    }),
    [],
  )

  return (
    <AssistantContext value={value}>
      {children}
      <AssistantPanel
        open={open}
        onClose={() => setOpen(false)}
        messages={messages}
        setMessages={setMessages}
        initialQuestion={pendingQuestion}
        onInitialQuestionHandled={clearPending}
      />
    </AssistantContext>
  )
}
