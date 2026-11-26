import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-gradient text-accent-foreground shadow-sm ring-1 ring-inset ring-white/10 hover:shadow-glow hover:brightness-110',
  secondary:
    'border border-border bg-surface text-foreground shadow-card hover:border-border-strong hover:bg-subtle',
  soft: 'bg-accent-soft text-accent-soft-foreground hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-foreground hover:bg-subtle',
  danger: 'bg-danger text-white shadow-sm hover:brightness-110',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-xs',
  md: 'h-9 gap-2 rounded-lg px-3.5',
  lg: 'h-11 gap-2 rounded-xl px-5 text-[15px]',
  xl: 'h-14 gap-2.5 rounded-2xl px-6 text-base',
  icon: 'size-9 rounded-lg',
}

/** Shared by <Button> and <ButtonLink> so links can look exactly like buttons. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
) {
  return cn(
    'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background-color,box-shadow,filter,transform,border-color] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
    variants[variant],
    sizes[size],
    className,
  )
}
