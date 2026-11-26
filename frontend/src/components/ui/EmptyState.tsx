import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { EmptyIllustration } from './Illustration'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Show the illustration (default) or a compact icon tile. */
  compact?: boolean
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center px-6 text-center',
        compact ? 'py-8' : 'py-12',
        className,
      )}
    >
      {compact && Icon ? (
        <div className="mb-3 grid size-10 place-items-center rounded-xl border bg-subtle text-muted">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      ) : (
        <EmptyIllustration className="mb-4" />
      )}
      <h3 className="font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
