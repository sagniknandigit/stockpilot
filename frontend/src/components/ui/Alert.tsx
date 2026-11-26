import { CircleAlert, CircleCheck, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'error' | 'success' | 'info'

const styles: Record<Tone, string> = {
  error: 'border-danger/30 bg-danger/5 text-danger-ink',
  success: 'border-success/30 bg-success/5 text-success-ink',
  info: 'border-accent/30 bg-accent-soft text-foreground',
}
const icons = { error: CircleAlert, success: CircleCheck, info: Info }

export function Alert({
  tone = 'error',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[13px]',
        styles[tone],
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
