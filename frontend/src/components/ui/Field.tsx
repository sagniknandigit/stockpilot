import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  className?: string
  /** Render-prop receives the generated id and aria props to spread onto the control. */
  children: (control: {
    id: string
    'aria-invalid': boolean | undefined
    'aria-describedby': string | undefined
  }) => ReactNode
}

/** Label + control + hint/error, wired together for screen readers. */
export function Field({ label, error, hint, className, children }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? messageId : undefined,
      })}
      {error ? (
        <p id={messageId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
