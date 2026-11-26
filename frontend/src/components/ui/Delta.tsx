import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Change pill: green up, red down. `onBrand` styles it for the gradient hero card. */
export function Delta({
  value,
  label,
  onBrand = false,
}: {
  value: number | null
  label?: string
  onBrand?: boolean
}) {
  if (value === null) return null
  const flat = Math.abs(value) < 0.05
  const up = value > 0
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold',
        onBrand
          ? 'bg-white/15 text-white'
          : flat
            ? 'bg-subtle text-muted'
            : up
              ? 'bg-success/10 text-success-ink'
              : 'bg-danger/10 text-danger-ink',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {formatPercent(value)}
      {label && <span className="sr-only"> {label}</span>}
    </span>
  )
}
