import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { toast, useToasts, type ToastVariant } from './toast'

const icons: Record<ToastVariant, typeof Info> = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
}

const iconColors: Record<ToastVariant, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-accent',
}

export function Toaster() {
  const toasts = useToasts()
  const ref = useRef<HTMLDivElement>(null)

  // Rendered as a popover so it sits in the top layer, above any open modal <dialog>.
  // Re-showing on each change moves it above dialogs opened after it.
  useEffect(() => {
    const el = ref.current
    if (!el || !('showPopover' in el)) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (toasts.length > 0) el.showPopover()
  }, [toasts])

  return (
    <div
      ref={ref}
      popover="manual"
      className="pointer-events-none fixed inset-auto top-14 right-0 m-0 flex w-full max-w-sm flex-col gap-2 overflow-visible border-0 bg-transparent p-4"
    >
      <div aria-live="polite" role="status" className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const Icon = icons[item.variant]
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
                transition={spring}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface-raised p-3.5 shadow-pop"
              >
                <Icon
                  className={cn('mt-0.5 size-4 shrink-0', iconColors[item.variant])}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  {item.description && (
                    <p className="mt-0.5 text-[13px] text-muted">{item.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toast.dismiss(item.id)}
                  className="rounded text-muted hover:text-foreground"
                  aria-label="Dismiss notification"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
