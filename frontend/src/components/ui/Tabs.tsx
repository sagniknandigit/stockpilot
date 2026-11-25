import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'

interface TabsProps<T extends string> {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}

/** Accessible tab list (arrow-key navigation). Panels are rendered by the caller. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent, index: number) {
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const next = (index + delta + tabs.length) % tabs.length
    refs.current[next]?.focus()
    onChange(tabs[next].value)
  }

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab, index) => {
        const selected = tab.value === value
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors',
              selected
                ? 'border-accent text-foreground'
                : 'border-transparent text-muted hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
