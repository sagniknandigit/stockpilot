import { ArrowRight, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { STARTER_QUESTIONS, useAssistant } from '@/components/assistant/AssistantContext'
import { Card } from '@/components/ui/Card'
import { fadeUp } from '@/lib/motion'

export function AskAssistantCard() {
  const { open } = useAssistant()
  return (
    <motion.div variants={fadeUp} className="h-full min-w-0">
      <Card className="relative isolate flex h-full flex-col overflow-hidden p-5">
        <div
          className="absolute -top-24 -right-16 -z-10 size-64 rounded-full bg-accent-2/15 blur-3xl"
          aria-hidden="true"
        />
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-semibold text-foreground">Ask StockPilot</h2>
            <p className="text-[13px] text-muted">
              Plain-English questions, answered from your live data.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {STARTER_QUESTIONS.slice(0, 4).map((question) => (
            <li key={question}>
              <button
                type="button"
                onClick={() => open(question)}
                className="group flex w-full items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-2.5 text-left text-[13px] text-foreground transition-colors hover:border-accent/40 hover:bg-accent-soft/40"
              >
                {question}
                <ArrowRight
                  className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  )
}
