import { Check, PackagePlus, ShoppingCart, Sparkles, Warehouse, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { Summary } from '@/api/types'
import { useSession } from '@/auth/AuthContext'
import { readStorage, writeStorage, cn } from '@/lib/utils'

interface OnboardingChecklistProps {
  summary: Summary | undefined
  orderCount: number | undefined
}

/**
 * Getting-started steps for new organizations, computed from real data (no extra API).
 * Hidden once everything is done or the user dismisses it (remembered per organization).
 */
export function OnboardingChecklist({ summary, orderCount }: OnboardingChecklistProps) {
  const { organization } = useSession()
  const storageKey = `stockpilot.onboarding-dismissed.${organization.id}`
  const [dismissed, setDismissed] = useState(() => readStorage<boolean>(storageKey) ?? false)

  if (!summary || orderCount === undefined) return null
  const steps = [
    {
      label: 'Add your first product',
      done: summary.active_products > 0,
      to: '/products?new=1',
      icon: PackagePlus,
    },
    {
      label: 'Receive some stock',
      done: summary.units_on_hand > 0,
      to: '/inventory',
      icon: Warehouse,
    },
    { label: 'Make your first sale', done: orderCount > 0, to: '/pos', icon: ShoppingCart },
  ]
  const completed = steps.filter((s) => s.done).length
  const visible = !dismissed && completed < steps.length

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          aria-label="Getting started"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="mb-6 rounded-2xl border bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
                  <Sparkles className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-semibold text-foreground">Get your store ready</h2>
                  <p className="text-[13px] text-muted">
                    {completed} of {steps.length} done — you’re a few clicks from your first sale.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDismissed(true)
                  writeStorage(storageKey, true)
                }}
                className="grid size-7 place-items-center rounded-md text-muted hover:bg-subtle hover:text-foreground"
                aria-label="Dismiss getting started"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-subtle">
              <motion.div
                className="h-full rounded-full bg-brand-gradient"
                initial={{ width: 0 }}
                animate={{ width: `${(completed / steps.length) * 100}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {steps.map(({ label, done, to, icon: Icon }, index) => (
                <li key={label}>
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 text-[13px] transition-colors',
                      done
                        ? 'bg-subtle/50 text-muted'
                        : 'hover:border-accent/40 hover:bg-accent-soft/50',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold',
                        done ? 'bg-success text-white' : 'border bg-surface text-muted',
                      )}
                    >
                      {done ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        'flex-1 font-medium',
                        done ? 'line-through' : 'text-foreground',
                      )}
                    >
                      {label}
                    </span>
                    {!done && <Icon className="size-4 text-accent" aria-hidden="true" />}
                    <span className="sr-only">{done ? '(done)' : '(to do)'}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}
