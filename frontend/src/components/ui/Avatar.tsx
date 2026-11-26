import { cn, initials } from '@/lib/utils'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  /** Brand gradient (current user / org) instead of the soft tint. */
  brand?: boolean
  square?: boolean
  className?: string
}

const sizes = { sm: 'size-7 text-[11px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' }

export function Avatar({
  name,
  size = 'md',
  brand = false,
  square = false,
  className,
}: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center font-semibold select-none',
        square ? 'rounded-lg' : 'rounded-full',
        brand
          ? 'bg-brand-gradient text-accent-foreground shadow-sm'
          : 'bg-accent-soft text-accent-soft-foreground ring-1 ring-accent/10 ring-inset',
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
