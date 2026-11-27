import { cn } from '@/lib/utils'
import { CopyButton } from './CopyButton'

/** Monospace snippet with a copy button. Always dark so code reads the same in both themes. */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-white/10 bg-[oklch(0.18_0.01_275)]',
        className,
      )}
    >
      {label && (
        <p className="border-b border-white/10 px-4 py-2 text-[11px] font-semibold tracking-wide text-white/50 uppercase">
          {label}
        </p>
      )}
      <pre className="overflow-x-auto p-4 pr-14 font-mono text-[12.5px] leading-relaxed text-white/90">
        <code>{code}</code>
      </pre>
      <CopyButton
        value={code}
        size="icon"
        variant="ghost"
        label="Copy code"
        className={cn(
          'absolute right-2 size-8 text-white/60 hover:bg-white/10 hover:text-white',
          label ? 'top-0.5 size-7' : 'top-2',
        )}
      />
    </div>
  )
}
