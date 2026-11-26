import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Keyboard key hint, e.g. <Kbd>⌘K</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border-strong bg-surface px-1 font-sans text-[11px] font-medium text-muted shadow-[0_1px_0_var(--border)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
