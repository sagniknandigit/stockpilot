import { Sparkles } from 'lucide-react'
import { useAssistant } from './AssistantContext'

/** Top-bar entry point. */
export function AssistantButton() {
  const { open } = useAssistant()
  return (
    <button
      type="button"
      onClick={() => open()}
      className="group inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/25 bg-accent-soft px-2.5 text-[13px] font-medium text-accent-soft-foreground transition-[box-shadow,filter] hover:shadow-glow"
      aria-label="Ask StockPilot"
    >
      <Sparkles className="size-4 transition-transform group-hover:rotate-12" aria-hidden="true" />
      <span className="hidden xl:inline">Ask AI</span>
    </button>
  )
}
