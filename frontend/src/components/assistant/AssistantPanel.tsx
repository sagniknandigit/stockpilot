import { useMutation } from '@tanstack/react-query'
import { ArrowUp, ChevronDown, KeyRound, Sparkles, Trash2, Wrench } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { assistantApi } from '@/api/assistant'
import type { AssistantAnswer } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { getErrorMessage, isApiError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { STARTER_QUESTIONS } from './AssistantContext'
import { Markdown } from './Markdown'
import { ThinkingDots } from './ThinkingDots'

export interface PendingQuestion {
  id: number
  text: string
}

export interface ChatMessage {
  id: number
  question: string
  answer?: AssistantAnswer
  error?: unknown
}

interface AssistantPanelProps {
  open: boolean
  onClose: () => void
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  /** A question to send as soon as the panel opens (from a chip or the command palette). */
  initialQuestion: PendingQuestion | null
  onInitialQuestionHandled: () => void
}

let nextId = 1

/** Slide-over chat. Each question is answered independently on the server. */
export function AssistantPanel(props: AssistantPanelProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      variant="drawer"
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-gradient text-white shadow-glow">
            <Sparkles className="size-3.5" aria-hidden="true" />
          </span>
          Ask StockPilot
        </span>
      }
      description="Questions about your sales, stock and suppliers — answered from your live data."
      bodyClassName="overflow-hidden"
    >
      <Conversation {...props} />
    </Dialog>
  )
}

function Conversation({
  messages,
  setMessages,
  initialQuestion,
  onInitialQuestionHandled,
}: AssistantPanelProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const ask = useMutation({
    mutationFn: ({ question }: { id: number; question: string }) => assistantApi.ask(question),
    meta: { silentError: true },
    onSuccess: (answer, { id }) =>
      setMessages((all) => all.map((m) => (m.id === id ? { ...m, answer } : m))),
    onError: (error, { id }) =>
      setMessages((all) => all.map((m) => (m.id === id ? { ...m, error } : m))),
  })
  const notConfigured = messages.some((m) => isApiError(m.error, 'assistant_unavailable'))

  function send(text: string) {
    const question = text.trim()
    if (question.length < 3 || ask.isPending) return
    const id = nextId++
    setMessages((all) => [...all, { id, question }])
    setDraft('')
    ask.mutate({ id, question })
  }

  // Chips and the command palette hand us a question to ask immediately.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  })
  const handledId = useRef<number | null>(null)
  useEffect(() => {
    if (initialQuestion && handledId.current !== initialQuestion.id) {
      handledId.current = initialQuestion.id
      sendRef.current(initialQuestion.text)
      onInitialQuestionHandled()
    }
  }, [initialQuestion, onInitialQuestionHandled])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.length === 0 && (
          <div className="pt-4 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">What would you like to know?</h3>
            <p className="mx-auto mt-1 max-w-xs text-[13px] text-muted">
              StockPilot looks up your real numbers with read-only tools and shows which data it
              used.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-gradient px-3.5 py-2 text-[13px] text-white shadow-sm">
                  {message.question}
                </p>
              </div>
              <div className="flex gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border bg-surface px-3.5 py-2.5 text-[13px] shadow-card">
                  {message.answer ? (
                    <>
                      <Markdown source={message.answer.answer} className="text-foreground" />
                      <ToolTrace calls={message.answer.tool_calls} />
                    </>
                  ) : message.error ? (
                    <AnswerError error={message.error} />
                  ) : (
                    <div className="flex items-center gap-2 py-1 text-muted">
                      <ThinkingDots /> Looking at your data…
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={endRef} />
      </div>

      <div className="border-t bg-subtle/40 p-4">
        {!notConfigured && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Suggested questions">
            {STARTER_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                disabled={ask.isPending}
                className="shrink-0 rounded-full border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            send(draft)
          }}
          className="flex items-end gap-2 rounded-2xl border bg-surface p-2 shadow-card focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15"
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
            rows={1}
            maxLength={500}
            autoFocus
            placeholder="Ask about sales, stock, suppliers…"
            aria-label="Ask StockPilot"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted/70"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-xl"
            loading={ask.isPending}
            disabled={draft.trim().length < 3}
            aria-label="Send question"
          >
            {!ask.isPending && <ArrowUp />}
          </Button>
        </form>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            <Trash2 className="size-3" aria-hidden="true" /> Clear conversation
          </button>
        )}
      </div>
    </div>
  )
}

function AnswerError({ error }: { error: unknown }) {
  if (isApiError(error, 'assistant_unavailable')) {
    return (
      <div className="flex gap-3 py-1">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
        <div>
          <p className="font-medium text-foreground">Assistant not configured</p>
          <p className="mt-0.5 text-muted">
            Set{' '}
            <code className="rounded bg-subtle px-1 py-0.5 font-mono text-[12px]">
              ANTHROPIC_API_KEY
            </code>{' '}
            on the server to enable answers. Everything else in StockPilot works without it.
          </p>
        </div>
      </div>
    )
  }
  if (isApiError(error, 'rate_limited')) {
    const retry = (error.details as { retry_after?: number } | null)?.retry_after
    return (
      <p className="text-muted">
        You’re asking faster than the limit (10 a minute).
        {retry ? ` Try again in ${Math.ceil(retry)}s.` : ''}
      </p>
    )
  }
  return <p className="text-danger-ink">{getErrorMessage(error)}</p>
}

/** Transparency: which read-only tools the answer is based on. */
function ToolTrace({ calls }: { calls: AssistantAnswer['tool_calls'] }) {
  const [open, setOpen] = useState(false)
  if (calls.length === 0) return null
  const names = [...new Set(calls.map((c) => c.name))]
  return (
    <div className="mt-3 border-t pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <Wrench className="size-3" aria-hidden="true" /> Based on {names.length}{' '}
        {names.length === 1 ? 'source' : 'sources'}
        <ChevronDown
          className={cn('size-3 transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {calls.map((call, i) => (
            <li
              key={i}
              title={JSON.stringify(call.input)}
              className={cn(
                'rounded-md border px-1.5 py-0.5 font-mono text-[11px]',
                call.is_error ? 'border-danger/30 text-danger-ink' : 'bg-subtle text-muted',
              )}
            >
              {call.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
