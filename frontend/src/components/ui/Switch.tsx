import { useId } from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  const id = useId()
  return (
    <div className="inline-flex items-center gap-2">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-border',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
      <label htmlFor={id} className="cursor-pointer text-[13px] text-foreground select-none">
        {label}
      </label>
    </div>
  )
}
