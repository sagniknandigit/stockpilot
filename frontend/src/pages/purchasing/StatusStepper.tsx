import { Check, X } from 'lucide-react'
import { motion } from 'motion/react'
import type { PurchaseOrder } from '@/api/types'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'ordered', label: 'Ordered' },
  { key: 'partially_received', label: 'Partially received' },
  { key: 'received', label: 'Received' },
] as const

/** draft → ordered → partially received → received, with timestamps where known. */
export function StatusStepper({ order, timeZone }: { order: PurchaseOrder; timeZone: string }) {
  if (order.status === 'cancelled') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] text-danger-ink">
        <span className="grid size-7 place-items-center rounded-full bg-danger text-white">
          <X className="size-4" aria-hidden="true" />
        </span>
        This purchase order was cancelled. No stock was received.
      </div>
    )
  }
  const current = STEPS.findIndex((s) => s.key === order.status)
  const times: Partial<Record<(typeof STEPS)[number]['key'], string | null>> = {
    draft: order.created_at,
    ordered: order.ordered_at,
    received: order.received_at,
  }

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Purchase order progress">
      {STEPS.map((step, index) => {
        const done = index < current || order.status === 'received'
        const active = index === current && order.status !== 'received'
        const time = times[step.key]
        return (
          <li
            key={step.key}
            className="relative flex flex-col items-center text-center"
            aria-current={active ? 'step' : undefined}
          >
            {index > 0 && (
              <span
                className="absolute top-3.5 right-1/2 h-0.5 w-full -translate-x-0 bg-border"
                aria-hidden="true"
              >
                <motion.span
                  className="block h-full bg-brand-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: index <= current ? '100%' : 0 }}
                  transition={{ duration: 0.5, delay: index * 0.12 }}
                />
              </span>
            )}
            <span
              className={cn(
                'relative z-10 grid size-7 place-items-center rounded-full border-2 text-xs font-semibold',
                done && 'border-transparent bg-brand-gradient text-white',
                active && 'border-accent bg-surface text-accent ring-4 ring-accent/15',
                !done && !active && 'border-border-strong bg-surface text-muted',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                'mt-2 text-xs font-medium',
                done || active ? 'text-foreground' : 'text-muted',
              )}
            >
              {step.label}
            </span>
            {time && (done || active) && (
              <span className="hidden text-[11px] text-muted sm:block">
                {formatDateTime(time, timeZone)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
