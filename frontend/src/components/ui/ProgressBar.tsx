import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max: number
  label: string
  tone?: 'brand' | 'success' | 'warning' | 'danger'
  className?: string
}

const tones = {
  brand: 'bg-brand-gradient',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function ProgressBar({ value, max, label, tone = 'brand', className }: ProgressBarProps) {
  const ratio = max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={cn('h-1.5 overflow-hidden rounded-full bg-subtle', className)}
    >
      <motion.div
        className={cn('h-full rounded-full', tones[tone])}
        initial={{ width: 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}
