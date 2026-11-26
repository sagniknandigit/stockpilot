import { cn } from '@/lib/utils'

/** Brand mark: a gradient tile with a stylised stacked-box glyph and a soft glow. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'relative grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand-gradient shadow-glow ring-1 ring-white/15 ring-inset',
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[18px] text-white"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      >
        <path d="M12 3 4.5 7v10L12 21l7.5-4V7z" opacity="0.55" />
        <path d="M4.5 7 12 11l7.5-4M12 11v10" />
      </svg>
    </span>
  )
}

export function Logo({
  className,
  collapsed = false,
}: {
  className?: string
  collapsed?: boolean
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">StockPilot</span>
      )}
    </div>
  )
}
