import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** "drawer" slides in from the right edge (used for detail panels). */
  variant?: 'modal' | 'drawer'
  className?: string
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

/**
 * Built on the native <dialog> element: showModal() makes the rest of the page inert (focus
 * stays inside) and Esc fires `cancel`; focus returns to the trigger on close.
 * Content is only mounted while open, so forms inside start fresh each time.
 */
export function Dialog(props: DialogProps) {
  return props.open ? <DialogContent {...props} /> : null
}

function DialogContent({
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'modal',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const pressStartedOnBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // React removes the element before this cleanup runs, so the browser can't restore focus
    // itself; remember the trigger and put focus back when the dialog goes away.
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  const drawer = variant === 'drawer'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // Close on backdrop click, but not when a text selection drag ends outside the panel.
      onMouseDown={(event) => {
        pressStartedOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressStartedOnBackdrop.current && event.target === event.currentTarget) onClose()
      }}
      className={cn(
        'border bg-surface text-foreground shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]',
        drawer
          ? 'my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-xl animate-drawer-in rounded-none border-y-0 border-r-0'
          : 'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] animate-dialog-in rounded-xl',
        !drawer && widths[size],
        className,
      )}
    >
      <div className={cn('flex flex-col', drawer ? 'h-full' : 'max-h-[calc(100dvh-2rem)]')}>
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mt-1 -mr-2 size-8"
            onClick={onClose}
            aria-label="Close"
          >
            <X />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap justify-end gap-2 border-t bg-subtle/40 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  )
}
