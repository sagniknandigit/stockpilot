import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-md bg-[linear-gradient(90deg,var(--subtle)_0%,var(--border)_50%,var(--subtle)_100%)] bg-[length:200%_100%]',
        className,
      )}
    />
  )
}
