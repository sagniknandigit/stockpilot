import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

/** Status pills tint from the semantic tokens, so both themes stay in sync. */
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-subtle text-muted ring-border',
  accent: 'bg-accent-soft text-accent-soft-foreground ring-accent/20',
  success: 'bg-success/10 text-success-ink ring-success/25',
  warning: 'bg-warning/12 text-warning-ink ring-warning/30',
  danger: 'bg-danger/10 text-danger-ink ring-danger/25',
  info: 'bg-accent-2/10 text-[color-mix(in_oklch,var(--accent-2)_75%,var(--foreground))] ring-accent-2/25',
}

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-accent-2',
}

export function Badge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: BadgeTone
  /** Leading status dot. */
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', dots[tone])} aria-hidden="true" />}
      {children}
    </span>
  )
}
