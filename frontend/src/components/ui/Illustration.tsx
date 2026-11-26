import { cn } from '@/lib/utils'

/**
 * Friendly empty-state illustration: an open box with floating cards. Drawn with theme tokens
 * so it adapts to light and dark mode.
 */
export function EmptyIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn('h-28 w-auto', className)}
      aria-hidden="true"
      fill="none"
    >
      <ellipse cx="80" cy="106" rx="52" ry="6" fill="var(--subtle)" />
      <rect
        x="44"
        y="18"
        width="38"
        height="26"
        rx="6"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        transform="rotate(-10 63 31)"
      />
      <rect
        x="50"
        y="25"
        width="18"
        height="3"
        rx="1.5"
        fill="var(--accent)"
        opacity="0.5"
        transform="rotate(-10 63 31)"
      />
      <rect
        x="50"
        y="31"
        width="24"
        height="3"
        rx="1.5"
        fill="var(--border-strong)"
        transform="rotate(-10 63 31)"
      />
      <rect
        x="84"
        y="10"
        width="34"
        height="24"
        rx="6"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        transform="rotate(8 101 22)"
      />
      <circle
        cx="93"
        cy="21"
        r="4"
        fill="var(--accent-2)"
        opacity="0.55"
        transform="rotate(8 101 22)"
      />
      <rect
        x="100"
        y="19"
        width="12"
        height="3"
        rx="1.5"
        fill="var(--border-strong)"
        transform="rotate(8 101 22)"
      />
      <path
        d="M40 56 L80 46 L120 56 L80 66 Z"
        fill="var(--accent-soft)"
        stroke="var(--accent)"
        strokeOpacity="0.35"
      />
      <path d="M40 56 V92 L80 102 V66 Z" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M120 56 V92 L80 102 V66 Z" fill="var(--subtle)" stroke="var(--border-strong)" />
      <path d="M40 56 L30 70 L70 80 L80 66 Z" fill="var(--surface)" stroke="var(--border-strong)" />
      <path
        d="M120 56 L130 70 L90 80 L80 66 Z"
        fill="var(--surface)"
        stroke="var(--border-strong)"
      />
      <path d="M128 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="var(--accent)" opacity="0.7" />
      <circle cx="32" cy="36" r="2.5" fill="var(--accent-2)" opacity="0.5" />
    </svg>
  )
}
