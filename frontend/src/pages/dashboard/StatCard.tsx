import type { LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Skeleton } from '@/components/ui/Skeleton'
import { fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: number | undefined
  format: (value: number) => string
  icon: LucideIcon
  hint?: ReactNode
  delta?: ReactNode
  tone?: 'accent' | 'warning'
}

export function StatCard({
  label,
  value,
  format,
  icon: Icon,
  hint,
  delta,
  tone = 'accent',
}: StatCardProps) {
  return (
    <motion.div
      variants={fadeUp}
      className="group rounded-2xl border bg-surface p-5 shadow-card transition-shadow hover:shadow-pop"
    >
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span
          className={cn(
            'grid size-8 place-items-center rounded-lg transition-transform group-hover:scale-105',
            tone === 'warning'
              ? 'bg-warning/12 text-warning-ink'
              : 'bg-accent-soft text-accent-soft-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      {value === undefined ? (
        <Skeleton className="mt-2 h-8 w-28" />
      ) : (
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <AnimatedNumber
            value={value}
            format={format}
            className="text-[26px] font-semibold tracking-tight text-foreground"
          />
          {delta}
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </motion.div>
  )
}
