import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface MenuProps {
  /** Renders the trigger; spread the given props onto a <button>. */
  trigger: (props: {
    onClick: () => void
    'aria-expanded': boolean
    'aria-controls': string
    'aria-haspopup': 'menu'
  }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
}

/** Minimal dropdown: closes on outside click and Esc. */
export function Menu({ trigger, children, align = 'right', className }: MenuProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        onClick: () => setOpen((value) => !value),
        'aria-expanded': open,
        'aria-controls': id,
        'aria-haspopup': 'menu',
      })}
      {open && (
        <div
          id={id}
          role="menu"
          className={cn(
            'absolute z-40 mt-2 min-w-56 animate-fade-in rounded-xl border bg-surface p-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  onSelect,
  children,
  icon,
  active,
}: {
  onSelect: () => void
  children: ReactNode
  icon?: ReactNode
  active?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-subtle [&_svg]:size-4',
        active ? 'font-medium text-foreground' : 'text-foreground/90',
      )}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  )
}
